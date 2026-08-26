import { describe, expect, it } from "vitest";
import { interpretUiRail, p0UiRailSchema, uiInteractionTokenRequestSchema } from "./components";
import { interpretP0Capability } from "./unsupported";
import { parseUpstreamAgUiEvent } from "./events";
import { HASH } from "./test-helpers";

describe("unsupported P0 capabilities", () => {
  it("parses iframe and open-UI rails to a typed unsupported result", () => {
    expect(p0UiRailSchema.safeParse("iframe_v1").success).toBe(false);
    expect(interpretUiRail("iframe_v1")).toEqual({
      ok: false,
      capability: "iframe_v1",
      reason: "unsupported_in_p0",
    });
    expect(interpretUiRail("generate_open_ui").ok).toBe(false);
    expect(interpretP0Capability("open-generative-ui")).toEqual({
      ok: false,
      capability: "open-generative-ui",
      reason: "unsupported_in_p0",
    });
    expect(interpretP0Capability("GeneratedSourceEventRefV1").ok).toBe(false);
    expect(interpretP0Capability("request_agent_turn").ok).toBe(false);
    expect(interpretP0Capability("open_existing_hitl").ok).toBe(false);
  });

  it("rejects native-subagent and reasoning AG-UI families as unsupported", () => {
    expect(parseUpstreamAgUiEvent({ type: "RAW" }).reason).toBe("unsupported_in_p0");
    expect(parseUpstreamAgUiEvent({ type: "REASONING_CONTENT" }).ok).toBe(false);
    expect(parseUpstreamAgUiEvent({ type: "SUBAGENT_START" }).ok).toBe(false);
    expect(interpretP0Capability("subagent.started").ok).toBe(false);
  });

  it("rejects iframe client kinds on interaction commands", () => {
    expect(
      uiInteractionTokenRequestSchema.safeParse({
        schemaVersion: 1,
        surfaceId: "ui_1",
        renderNodeId: "node_1",
        renderRevision: 1,
        expectedStateRevision: 0,
        actionGrantId: "uag_1",
        actionRef: "select_node",
        input: { nodeId: "node_1" },
        clientKind: "iframe",
        actionMode: "local_state",
      }).success,
    ).toBe(false);
    expect(HASH.startsWith("sha256:")).toBe(true);
  });
});
