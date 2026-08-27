import { describe, expect, it } from "vitest";
import { P0_COMPOSIO_DESCRIPTOR_HASHES } from "./descriptors";
import {
  P0_COMPOSIO_CONNECTION_ID,
  assertReconnectBoundToWorkspace,
  buildConnectionStatusView,
  buildP0ActingIdentity,
  evaluateConnectionTest,
  evaluatePinnedConnectionGate,
  listP0ConnectionTools,
  parseGrantedScopes,
  toRedactedConnectionEvidence,
} from "./connections";
import { P0_COMPOSIO_READ_TOOL } from "./real-read";

const PINNED = "ca_xxxxnizY";

describe("P0-304 connection health mapping", () => {
  it("maps ACTIVE pinned account to active without blocked_connection", () => {
    const gate = evaluatePinnedConnectionGate({
      account: { id: PINNED, status: "ACTIVE", isDisabled: false, toolkitSlug: "github" },
      expectedConnectedAccountId: PINNED,
    });
    expect(gate.status).toBe("active");
    expect(gate.blocksDispatch).toBe(false);
    expect(gate.runStepState).toBeNull();
  });

  it("maps expiry to blocked_connection and never selects a fallback account", () => {
    const gate = evaluatePinnedConnectionGate({
      account: { id: PINNED, status: "EXPIRED", isDisabled: false, toolkitSlug: "github" },
      expectedConnectedAccountId: PINNED,
      observedAlternateAccountId: "ca_otherFallback",
    });
    expect(gate.status).toBe("expired");
    expect(gate.blocksDispatch).toBe(true);
    expect(gate.runStepState).toBe("blocked_connection");
    expect(gate.fallbackAccountRejected).toBe(true);
  });

  it("rejects account mismatch as drifted blocked_connection", () => {
    const gate = evaluatePinnedConnectionGate({
      account: { id: "ca_other", status: "ACTIVE", isDisabled: false, toolkitSlug: "github" },
      expectedConnectedAccountId: PINNED,
    });
    expect(gate.status).toBe("drifted");
    expect(gate.runStepState).toBe("blocked_connection");
    expect(gate.fallbackAccountRejected).toBe(true);
  });
});

describe("P0-304 connection status view", () => {
  it("returns identity, scopes, tools/hashes and forbids catalog/account expansion", () => {
    const view = buildConnectionStatusView({
      workspaceId: "workspace_1",
      account: {
        id: PINNED,
        status: "ACTIVE",
        isDisabled: false,
        toolkitSlug: "github",
        scopes: ["repo", "user"],
      },
      expectedConnectedAccountId: PINNED,
      verifiedAt: "2026-08-27T12:00:00.000Z",
    });
    expect(view.id).toBe(P0_COMPOSIO_CONNECTION_ID);
    expect(view.acting_identity).toEqual(buildP0ActingIdentity(PINNED));
    expect(view.scopes).toEqual(["repo", "user"]);
    expect(view.tools).toEqual(listP0ConnectionTools());
    expect(view.catalog_browse_allowed).toBe(false);
    expect(view.account_selection_allowed).toBe(false);
    expect(view.capability_expansion_allowed).toBe(false);
    const evidence = toRedactedConnectionEvidence(view);
    expect(evidence.accountSuffix).toBe("nizY");
    expect(JSON.stringify(evidence)).not.toContain(PINNED);
  });

  it("parses granted scopes from Composio account payloads without secrets", () => {
    expect(
      parseGrantedScopes({
        requested_scopes: ["repo", "user"],
        data: { access_token: "SECRET", scope: "repo,user,gist" },
      }),
    ).toEqual(["repo", "user"]);
  });
});

describe("P0-304 connection test", () => {
  it("performs a safe read-only check result shape", () => {
    const result = evaluateConnectionTest({
      connectionId: P0_COMPOSIO_CONNECTION_ID,
      expectedDescriptorHash: P0_COMPOSIO_DESCRIPTOR_HASHES[P0_COMPOSIO_READ_TOOL],
      account: {
        id: PINNED,
        status: "ACTIVE",
        isDisabled: false,
        toolkitSlug: "github",
        scopes: ["repo"],
      },
      expectedConnectedAccountId: PINNED,
      execute: { httpStatus: 200, successful: true, authFailure: false },
      now: "2026-08-27T12:00:00.000Z",
    });
    expect(result.ok).toBe(true);
    expect(result.checked_tool).toBe(P0_COMPOSIO_READ_TOOL);
    expect(result.checked_descriptor_hash).toBe(
      `sha256:${P0_COMPOSIO_DESCRIPTOR_HASHES[P0_COMPOSIO_READ_TOOL]}`,
    );
    expect(result.run_step_state).toBeNull();
    expect(result.safe_summary).toMatch(/Read-only check/);
  });

  it("fails closed on expired auth without fallback", () => {
    const result = evaluateConnectionTest({
      connectionId: P0_COMPOSIO_CONNECTION_ID,
      expectedDescriptorHash: P0_COMPOSIO_DESCRIPTOR_HASHES[P0_COMPOSIO_READ_TOOL],
      account: {
        id: PINNED,
        status: "EXPIRED",
        isDisabled: false,
        toolkitSlug: "github",
        scopes: [],
      },
      expectedConnectedAccountId: PINNED,
      execute: null,
      now: "2026-08-27T12:00:00.000Z",
    });
    expect(result.ok).toBe(false);
    expect(result.run_step_state).toBe("blocked_connection");
    expect(result.reason).toBe("expired_account");
  });
});

describe("P0-304 reconnect workspace binding", () => {
  it("rejects wrong workspace and expired links", () => {
    const binding = {
      intentId: "intent_1",
      connectionId: P0_COMPOSIO_CONNECTION_ID,
      workspaceId: "workspace_1",
      actorUserId: "user_owner",
      expectedConnectedAccountId: PINNED,
      redirectUrl: "https://connect.example/link",
      expiresAt: "2026-08-27T12:10:00.000Z",
      provisionalConnectedAccountId: "ca_provisional",
      createdAt: "2026-08-27T12:00:00.000Z",
    };
    expect(
      assertReconnectBoundToWorkspace({
        binding,
        workspaceId: "workspace_other",
        connectionId: P0_COMPOSIO_CONNECTION_ID,
        now: "2026-08-27T12:05:00.000Z",
      }),
    ).toEqual({ ok: false, reason: "wrong_workspace" });
    expect(
      assertReconnectBoundToWorkspace({
        binding,
        workspaceId: "workspace_1",
        connectionId: P0_COMPOSIO_CONNECTION_ID,
        now: "2026-08-27T12:11:00.000Z",
      }),
    ).toEqual({ ok: false, reason: "link_expired" });
    expect(
      assertReconnectBoundToWorkspace({
        binding,
        workspaceId: "workspace_1",
        connectionId: P0_COMPOSIO_CONNECTION_ID,
        now: "2026-08-27T12:05:00.000Z",
      }).ok,
    ).toBe(true);
  });
});
