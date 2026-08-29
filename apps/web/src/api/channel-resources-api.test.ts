import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getUiInstanceReplay,
  postUiInstanceInteraction,
  postUiInstanceInteractionToken,
} from "./channel-resources-api";

const HASH = `sha256:${"a".repeat(64)}`;
const NOW = "2026-08-29T00:00:00.000Z";

describe("getUiInstanceReplay", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("keeps request_id when validating the closed replay response", async () => {
    const replay = {
      request_id: "req_1",
      schemaVersion: 1,
      instanceId: "ui_1",
      workspaceId: "ws_1",
      channelId: "ch_1",
      runId: "run_1",
      runStepId: "step_1",
      agentTurnId: "turn_1",
      logicalThreadId: "thread_1",
      componentVersionId: "componentv_table",
      componentName: "DataTable",
      componentVersion: "1.0.0",
      componentDescriptorHash: HASH,
      rendererKey: "DataTable@1.0.0",
      rendererProfileHash: HASH,
      rail: "registry_v1",
      status: "building",
      renderRevision: null,
      lastGoodRenderRevision: null,
      baseRenderRevision: null,
      stateRevision: null,
      baseStateRevision: null,
      renderManifestHash: null,
      validatedPropsHash: null,
      scopedStateHash: null,
      validatedProps: null,
      scopedState: null,
      textAlternative: "Preparing a table.",
      interactionEnabled: false,
      renderGrant: {
        id: "urg_1",
        rail: "registry_v1",
        registryVersion: "registry-1",
        allowedComponentTypes: ["table"],
        policyRevision: 1,
        grantScopeHash: HASH,
        expiresAt: NOW,
        revoked: false,
      },
      dataGrants: [],
      actionGrants: [],
      sourceRefs: [],
      lastChannelSequence: 1,
      createdAt: NOW,
      updatedAt: NOW,
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Promise.resolve(
          new Response(JSON.stringify(replay), {
            status: 200,
            headers: { "content-type": "application/json" },
          }),
        ),
      ),
    );

    await expect(getUiInstanceReplay("ui_1")).resolves.toEqual(replay);
  });

  it("keeps request_id while validating token and interaction responses", async () => {
    const interactionToken = "t".repeat(32);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            request_id: "req_token",
            interactionId: "interaction_1",
            state: "token_issued",
            interactionToken,
            expiresAt: NOW,
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            request_id: "req_commit",
            schemaVersion: 1,
            interactionId: "interaction_1",
            state: "succeeded",
            result: { status_filter: "all" },
            resultRef: "uirev_1",
            renderRevision: 1,
            stateRevision: null,
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      postUiInstanceInteractionToken({
        instanceId: "ui_1",
        csrfToken: "csrf_1",
        request: {
          schemaVersion: 1,
          surfaceId: "ui_1",
          renderNodeId: "node_1",
          renderRevision: 1,
          expectedStateRevision: null,
          actionGrantId: "ag_1",
          actionRef: "submit",
          input: { status_filter: "all" },
          clientKind: "registry",
          idempotencyKey: "submit_1",
        },
      }),
    ).resolves.toEqual({
      interactionId: "interaction_1",
      interactionToken,
      expiresAt: NOW,
    });
    await expect(
      postUiInstanceInteraction({
        instanceId: "ui_1",
        csrfToken: "csrf_1",
        command: { schemaVersion: 1, interactionId: "interaction_1", interactionToken },
      }),
    ).resolves.toMatchObject({
      request_id: "req_commit",
      interactionId: "interaction_1",
      state: "succeeded",
    });
  });
});
