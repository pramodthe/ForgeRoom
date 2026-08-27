import { describe, expect, it } from "vitest";
import {
  assertSandboxEnabledToolPolicy,
  evaluateCredentialCanary,
  evaluateEgressProbe,
  extractToolCallsFromModelMessage,
  isSandboxCommandToolName,
  mapTrueForgeWireEventsToSandboxLifecycle,
  sha256Utf8,
  toRedactedSandboxEvidence,
  verifySandboxEnabledToolPolicy,
} from "./sandbox";
import {
  P0_SANDBOX_FIXTURE_DEMO_LINES,
  P0_SANDBOX_FIXTURE_DEMO_LINES_SHA256,
} from "./sandbox-p0-contract";

describe("P0-311 sandbox wire mapping", () => {
  it("maps sandbox.created and sandbox command lifecycle from TrueForge wire events", () => {
    const wire = [
      {
        type: "sandbox.created",
        id: "evt_sandbox_1",
        sandbox_id: "sb_daytona_abc123",
        thread_id: null,
      },
      {
        type: "model.message",
        id: "evt_msg_1",
        thread_id: "main",
        finish_reason: "tool_calls",
        tool_calls: [
          {
            id: "tc_sandbox_1",
            type: "function",
            function: { name: "run_sandbox_command", arguments: '{"command":"echo hi"}' },
            tool_info: { type: "truefoundry-system", name: "run_sandbox_command" },
          },
        ],
      },
      {
        type: "tool.response",
        id: "evt_tool_1",
        thread_id: "main",
        tool_call_id: "tc_sandbox_1",
        content: "ok",
      },
    ];

    const mapped = mapTrueForgeWireEventsToSandboxLifecycle(wire);
    expect(mapped.map((event) => event.applicationType)).toEqual([
      "sandbox.created",
      "sandbox.command_started",
      "sandbox.command_completed",
    ]);
    expect(mapped[0]?.commandState).toBe("creating");
    expect(mapped[1]?.commandState).toBe("running");
    expect(mapped[2]?.commandState).toBe("completed");
    expect(mapped[0]?.payloadRedacted.sandbox_id).toBe("sb_daytona_abc123");
    expect(JSON.stringify(mapped)).not.toContain("arguments");
  });

  it("does not treat MCP tools as sandbox command lifecycle", () => {
    const wire = [
      {
        type: "sandbox.created",
        id: "evt_sandbox_1",
        sandbox_id: "sb_1",
      },
      {
        type: "model.message",
        id: "evt_msg_1",
        tool_calls: [
          {
            id: "tc_mcp_1",
            function: { name: "GITHUB_GET_AN_ISSUE" },
            tool_info: { type: "mcp", name: "GITHUB_GET_AN_ISSUE", server_name: "composio" },
          },
        ],
      },
      {
        type: "tool.response",
        id: "evt_tool_1",
        tool_call_id: "tc_mcp_1",
        content: "{}",
      },
    ];
    const mapped = mapTrueForgeWireEventsToSandboxLifecycle(wire);
    expect(mapped.map((event) => event.applicationType)).toEqual(["sandbox.created"]);
  });

  it("classifies failed sandbox tool responses as sandbox.failed", () => {
    const wire = [
      { type: "sandbox.created", id: "e1", sandbox_id: "sb_1" },
      {
        type: "model.message",
        id: "e2",
        tool_calls: [
          {
            id: "tc1",
            function: { name: "write_file" },
            tool_info: { type: "truefoundry-system", name: "write_file" },
          },
        ],
      },
      {
        type: "tool.response",
        id: "e3",
        tool_call_id: "tc1",
        content: "Error: permission denied",
      },
    ];
    const mapped = mapTrueForgeWireEventsToSandboxLifecycle(wire);
    expect(mapped.at(-1)?.applicationType).toBe("sandbox.failed");
    expect(mapped.at(-1)?.commandState).toBe("failed");
  });
});

describe("P0-311 sandbox profile policy", () => {
  it("rejects sensitive read tools on sandbox-enabled profiles", () => {
    const result = verifySandboxEnabledToolPolicy({
      sandboxEnabled: true,
      enabledTools: ["GITHUB_GET_AN_ISSUE", "GITHUB_ADD_LABELS_TO_AN_ISSUE"],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.forbiddenTools).toEqual(["GITHUB_GET_AN_ISSUE"]);
    expect(() =>
      assertSandboxEnabledToolPolicy({
        sandboxEnabled: true,
        enabledTools: ["GITHUB_GET_AN_ISSUE"],
      }),
    ).toThrow(/sensitive read tools/);
  });

  it("allows sandbox-disabled profiles to retain read tools", () => {
    expect(
      verifySandboxEnabledToolPolicy({
        sandboxEnabled: false,
        enabledTools: ["GITHUB_GET_AN_ISSUE"],
      }),
    ).toEqual({ ok: true, sandboxEnabled: false });
  });
});

describe("P0-311 credential and egress probes", () => {
  it("flags credential canary keys present in sandbox env listing", () => {
    const result = evaluateCredentialCanary(["PATH", "COMPOSIO_API_KEY", "HOME"]);
    expect(result.absent).toBe(false);
    expect(result.presentKeys).toEqual(["COMPOSIO_API_KEY"]);
  });

  it("fails sensitive-data readiness when egress is open (SEC-021)", () => {
    expect(evaluateEgressProbe("200").sensitiveDataReadiness).toBe("fail");
    expect(evaluateEgressProbe("000").sensitiveDataReadiness).toBe("pass");
  });

  it("builds redacted sandbox evidence without secrets", () => {
    const sha = sha256Utf8(P0_SANDBOX_FIXTURE_DEMO_LINES);
    expect(sha).toBe(P0_SANDBOX_FIXTURE_DEMO_LINES_SHA256);
    const evidence = toRedactedSandboxEvidence({
      sandboxId: "sb_daytona_probe_4c94",
      lifecycle: mapTrueForgeWireEventsToSandboxLifecycle([
        { type: "sandbox.created", id: "e1", sandbox_id: "sb_daytona_probe_4c94" },
      ]),
      credentialCanary: { absent: true, presentKeys: [] },
      egress: evaluateEgressProbe("000"),
      fixtureContentSha256: sha,
    });
    expect(evidence.sandboxIdSuffix).toBe("4c94");
    expect(evidence.fixture.match).toBe(true);
    expect(evidence.credentialCanaryAbsent).toBe(true);
    expect(JSON.stringify(evidence)).not.toContain("sb_daytona_probe");
  });
});

describe("sandbox command tool detection", () => {
  it("recognizes harness sandbox tool names", () => {
    expect(isSandboxCommandToolName("run_sandbox_command")).toBe(true);
    expect(isSandboxCommandToolName("GITHUB_GET_AN_ISSUE")).toBe(false);
    const calls = extractToolCallsFromModelMessage({
      tool_calls: [
        {
          id: "tc1",
          function: { name: "execute_code" },
          tool_info: { type: "truefoundry-system", name: "execute_code" },
        },
      ],
    });
    expect(calls[0]?.isSandboxCommand).toBe(true);
  });
});
