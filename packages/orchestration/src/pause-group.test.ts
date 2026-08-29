import { describe, expect, it } from "vitest";
import {
  buildApprovalRedactionResult,
  buildPauseGroupCapturePlan,
  classifyRequiredActionType,
  extractRawRequiredActions,
  hashCanonical,
  redactProviderRequiredActionText,
  sessionAcceptsInputWhilePaused,
  type ApprovalRedactionAdapter,
} from "./pause-group";

const HASH = `sha256:${"ab".repeat(32)}`;

const stubAdapter: ApprovalRedactionAdapter = {
  redactApproval: (toolName, args) => {
    const record = args && typeof args === "object" ? (args as Record<string, unknown>) : {};
    const {
      token: _t,
      access_token: _a,
      ...safe
    } = record as Record<string, unknown> & {
      token?: unknown;
      access_token?: unknown;
    };
    return buildApprovalRedactionResult({
      observedDescriptorHash: HASH,
      riskClass: "write",
      redactedArguments: safe,
      redactedTarget: { kind: "github_issue", display: "org/repo#1" },
      expectedEffect: `Approve ${toolName}`,
    });
  },
};

describe("required action classification", () => {
  it("classifies approval, question and connection types", () => {
    expect(classifyRequiredActionType({ type: "tool.approval_required" })).toBe("approval");
    expect(classifyRequiredActionType({ type: "tool.response_required" })).toBe("question");
    expect(classifyRequiredActionType({ type: "ask_user_question" })).toBe("question");
    expect(classifyRequiredActionType({ type: "mcp.auth_required" })).toBe("connection");
    expect(classifyRequiredActionType({ type: "mystery.event" })).toBe("unsupported");
  });
});

describe("buildPauseGroupCapturePlan", () => {
  it("captures mixed approval and question actions with binding hashes", () => {
    const plan = buildPauseGroupCapturePlan({
      trueforgeTurnId: "tf_turn_1",
      generation: 1,
      persistentThreadId: "thread_1",
      approvalRedaction: stubAdapter,
      requiredActions: [
        {
          type: "tool.approval_required",
          id: "ra_approval",
          tool_name: "GITHUB_ADD_LABELS_TO_AN_ISSUE",
          tool_call_id: "tc_1",
          arguments: {
            owner: "org",
            repo: "repo",
            issue_number: 1,
            labels: ["x"],
            token: "secret",
          },
        },
        {
          type: "tool.response_required",
          id: "ra_question",
          prompt: "Which label?",
        },
      ],
    });
    expect("ok" in plan && plan.ok === false).toBe(false);
    if ("ok" in plan) throw new Error("expected plan");
    expect(plan.actions).toHaveLength(2);
    expect(plan.runStepState).toBe("awaiting_approval");
    expect(plan.generation).toBe(1);
    expect(plan.trueforgeTurnId).toBe("tf_turn_1");

    const approval = plan.actions[0];
    expect(approval?.actionType).toBe("approval");
    if (approval?.actionType !== "approval") throw new Error("approval");
    expect(approval.proposal.argumentsHash.startsWith("sha256:")).toBe(true);
    expect(approval.proposal.targetHash.startsWith("sha256:")).toBe(true);
    expect(approval.proposal.observedDescriptorHash).toBe(HASH);
    expect(JSON.stringify(approval.payloadRedacted)).not.toContain("secret");

    const question = plan.actions[1];
    expect(question?.actionType).toBe("question");
    if (question?.actionType !== "question") throw new Error("question");
    expect(question.promptHash.startsWith("sha256:")).toBe(true);
  });

  it("captures connection actions as blocked_connection run step state", () => {
    const plan = buildPauseGroupCapturePlan({
      trueforgeTurnId: "tf_turn_1",
      generation: 2,
      approvalRedaction: stubAdapter,
      requiredActions: [
        {
          type: "mcp.auth_required",
          id: "ra_conn",
          connector: "composio_github",
          reason: "account_expired",
        },
      ],
    });
    expect("ok" in plan && plan.ok === false).toBe(false);
    if ("ok" in plan) throw new Error("expected plan");
    expect(plan.runStepState).toBe("blocked_connection");
    expect(plan.actions[0]?.actionType).toBe("connection");
  });

  it("redacts credentials embedded in provider question and connection text", () => {
    const plan = buildPauseGroupCapturePlan({
      trueforgeTurnId: "tf_turn_sensitive",
      generation: 2,
      approvalRedaction: stubAdapter,
      requiredActions: [
        {
          type: "tool.response_required",
          id: "ra_sensitive_question",
          prompt: {
            message: "Confirm api_key=provider-secret-value-now",
            access_token: "nested-provider-token",
          },
        },
        {
          type: "mcp.auth_required",
          id: "ra_sensitive_connection",
          connector: "github",
          reason: "Reconnect with Bearer provider-secret-bearer-token",
        },
      ],
    });
    if ("ok" in plan) throw new Error("expected plan");

    const persistedProjection = JSON.stringify(plan.actions);
    expect(persistedProjection).not.toContain("provider-secret-value-now");
    expect(persistedProjection).not.toContain("nested-provider-token");
    expect(persistedProjection).not.toContain("provider-secret-bearer-token");
    expect(persistedProjection).toContain("[REDACTED]");
  });

  it("rejects unexpected child-thread actions without persisting them", () => {
    const onlyChild = buildPauseGroupCapturePlan({
      trueforgeTurnId: "tf_turn_1",
      generation: 1,
      persistentThreadId: "thread_parent",
      approvalRedaction: stubAdapter,
      requiredActions: [
        {
          type: "tool.approval_required",
          id: "ra_child",
          thread_id: "thread_child",
          tool_name: "GITHUB_ADD_LABELS_TO_AN_ISSUE",
          arguments: {},
        },
      ],
    });
    expect(onlyChild).toEqual({ ok: false, reason: "unexpected_child_only" });

    const mixed = buildPauseGroupCapturePlan({
      trueforgeTurnId: "tf_turn_1",
      generation: 1,
      persistentThreadId: "thread_parent",
      approvalRedaction: stubAdapter,
      requiredActions: [
        {
          type: "tool.approval_required",
          id: "ra_parent",
          thread_id: "thread_parent",
          tool_name: "GITHUB_ADD_LABELS_TO_AN_ISSUE",
          tool_call_id: "tc_p",
          arguments: { owner: "o", repo: "r", issue_number: 1 },
        },
        {
          type: "tool.approval_required",
          id: "ra_child",
          thread_id: "thread_child",
          tool_name: "GITHUB_ADD_LABELS_TO_AN_ISSUE",
          arguments: {},
        },
      ],
    });
    expect("ok" in mixed && mixed.ok === false).toBe(false);
    if ("ok" in mixed) throw new Error("expected plan");
    expect(mixed.actions).toHaveLength(1);
    expect(mixed.actions[0]?.providerActionId).toBe("ra_parent");
    expect(mixed.rejectedChildCount).toBe(1);
  });

  it("rejects unsupported and duplicate provider action ids", () => {
    expect(
      buildPauseGroupCapturePlan({
        trueforgeTurnId: "tf_turn_1",
        generation: 1,
        approvalRedaction: stubAdapter,
        requiredActions: [{ type: "weird.thing", id: "ra_1" }],
      }),
    ).toMatchObject({ ok: false, reason: "unsupported_action" });

    expect(
      buildPauseGroupCapturePlan({
        trueforgeTurnId: "tf_turn_1",
        generation: 1,
        approvalRedaction: stubAdapter,
        requiredActions: [
          {
            type: "tool.approval_required",
            id: "ra_dup",
            tool_name: "GITHUB_ADD_LABELS_TO_AN_ISSUE",
            arguments: {},
          },
          {
            type: "tool.response_required",
            id: "ra_dup",
            prompt: "x",
          },
        ],
      }),
    ).toMatchObject({ ok: false, reason: "duplicate_provider_action_id" });
  });
});

describe("sessionAcceptsInputWhilePaused", () => {
  it("allows only pause_group_response while a group is unresolved", () => {
    expect(
      sessionAcceptsInputWhilePaused({
        hasUnresolvedPauseGroup: true,
        inputType: "normal",
      }),
    ).toEqual({ ok: false, reason: "pause_group_unresolved" });
    expect(
      sessionAcceptsInputWhilePaused({
        hasUnresolvedPauseGroup: true,
        inputType: "correction",
      }),
    ).toEqual({ ok: false, reason: "pause_group_unresolved" });
    expect(
      sessionAcceptsInputWhilePaused({
        hasUnresolvedPauseGroup: true,
        inputType: "correction",
        isLinkedPauseCorrection: true,
      }),
    ).toEqual({ ok: true });
    expect(
      sessionAcceptsInputWhilePaused({
        hasUnresolvedPauseGroup: true,
        inputType: "component_interaction_response",
      }),
    ).toEqual({ ok: false, reason: "pause_group_unresolved" });
    expect(
      sessionAcceptsInputWhilePaused({
        hasUnresolvedPauseGroup: true,
        inputType: "pause_group_response",
      }),
    ).toEqual({ ok: true });
    expect(
      sessionAcceptsInputWhilePaused({
        hasUnresolvedPauseGroup: false,
        inputType: "normal",
      }),
    ).toEqual({ ok: true });
  });
});

describe("extractRawRequiredActions / hashCanonical", () => {
  it("reads snake and camel collections and hashes stably", () => {
    expect(
      extractRawRequiredActions({
        state: { required_actions: [{ type: "tool.approval_required", id: "a" }] },
      }),
    ).toHaveLength(1);
    expect(
      extractRawRequiredActions({
        requiredActions: [{ type: "tool.response_required", id: "b" }],
      }),
    ).toHaveLength(1);
    expect(hashCanonical({ b: 1, a: 2 })).toBe(hashCanonical({ a: 2, b: 1 }));
  });

  it("redacts nested sensitive keys and inline credentials", () => {
    const redacted = redactProviderRequiredActionText({
      prompt: "Use sk-provider-secret-value to continue",
      nested: { password: "provider-password-value" },
      commonFormats: [
        "github_pat_11FAKECANARYTOKEN_abcdefghijklmnop",
        "AKIAFAKECANARY123456",
        "xoxb-fake-canary-token-123456",
        "glpat-fake-canary-token-1234567890",
        "npm_abcdefghijklmnopqrstuvwxyz123456",
        "sk_live_abcdefghijklmnop123456",
      ],
    });
    const serialized = JSON.stringify(redacted);
    for (const canary of [
      "provider-secret-value",
      "provider-password-value",
      "github_pat_",
      "AKIAFAKE",
      "xoxb-",
      "glpat-",
      "npm_",
      "sk_live_",
    ]) {
      expect(serialized).not.toContain(canary);
    }
  });
});
