import { describe, expect, it, vi } from "vitest";
import type { SkillRunEvidence } from "@forgeroom/domain";
import {
  buildSkillDraftBodyFromTurn,
  compileInstructionOnlyDraftAgentSpec,
  SkillDraftTurnError,
  type SkillDraftTurnDeps,
} from "./draft-turn";

const EVIDENCE: SkillRunEvidence = {
  runId: "run_1",
  goal: "Inspect the fixture",
  sourceMessageBody: "Please inspect the fixture",
  lifecycle: "completed",
  sourceStepIds: ["step_1"],
  steps: [
    {
      id: "step_1",
      objective: "Read",
      state: "completed",
      assigned_coworker_id: "cw_1",
      run_id: "run_1",
      required_actions: [],
    } as unknown as SkillRunEvidence["steps"][number],
  ],
  events: [
    {
      normalizedType: "tool.succeeded",
      payloadRedacted: { type: "tool.succeeded", tool_name: "GITHUB_GET_AN_ISSUE" },
    },
  ],
  approvals: [{ toolName: "GITHUB_ADD_LABELS_TO_AN_ISSUE", state: "allowed" }],
  artifacts: [],
  tasks: [],
  componentVersionIds: [],
};

const MARKDOWN = `## When to use
After a completed inspection run.

## Inputs
- Fixture request

## Method
1. Read bounded evidence
2. Summarize outcome

## Validation
Confirm the accepted run outcome.

## Output
Bounded summary for audit.

## Failures
- Stop when tools are unavailable
`;

describe("compileInstructionOnlyDraftAgentSpec", () => {
  it("does not include MCP servers or pinned skills", () => {
    const spec = compileInstructionOnlyDraftAgentSpec("openai/gpt-5-4-mini");
    expect(spec.mcp_servers ?? []).toEqual([]);
    expect(spec.skills ?? []).toEqual([]);
    expect(spec.config?.sandbox?.enabled).toBe(false);
  });
});

describe("buildSkillDraftBodyFromTurn", () => {
  it("rejects drafting turns that emit tool events", async () => {
    const client = {
      createSession: vi.fn(async () => ({ id: "sess_1" })),
      createTurn: vi.fn(async () => ({ id: "turn_1", state: { status: "done" } })),
      getTurn: vi.fn(async () => ({
        id: "turn_1",
        state: { status: "done", output: MARKDOWN },
      })),
      listTurnEvents: vi.fn(async () => [{ type: "tool.started", id: "evt_1" }]),
    };
    await expect(
      buildSkillDraftBodyFromTurn(EVIDENCE, {
        client: client as unknown as SkillDraftTurnDeps["client"],
      }),
    ).rejects.toMatchObject({
      code: "draft_turn_external_tool",
    } satisfies Partial<SkillDraftTurnError>);
    expect(client.createSession).toHaveBeenCalledOnce();
    expect(client.createTurn).toHaveBeenCalledOnce();
  });

  it("parses instruction-only markdown and keeps evidence-derived requirements", async () => {
    const client = {
      createSession: vi.fn(async () => ({ id: "sess_1" })),
      createTurn: vi.fn(async () => ({ id: "turn_1", state: { status: "creating" } })),
      getTurn: vi.fn(async () => ({
        id: "turn_1",
        state: { status: "done", output: MARKDOWN },
      })),
      listTurnEvents: vi.fn(async () => [
        { type: "assistant.message", id: "evt_1", content: MARKDOWN },
      ]),
    };
    const body = await buildSkillDraftBodyFromTurn(EVIDENCE, {
      client: client as unknown as SkillDraftTurnDeps["client"],
    });
    expect(body.when_to_use).toContain("inspection run");
    expect(body.method).toHaveLength(2);
    expect(body.required_tools).toEqual(["GITHUB_ADD_LABELS_TO_AN_ISSUE", "GITHUB_GET_AN_ISSUE"]);
    expect(client.listTurnEvents).toHaveBeenCalledWith("sess_1", "turn_1");
  });
});
