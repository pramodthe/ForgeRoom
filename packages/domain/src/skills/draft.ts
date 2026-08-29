import { createHash } from "node:crypto";
import type { SkillDraft } from "@forgeroom/contracts";
import { canonicalizeJson } from "../components/jcs";
import {
  assertRunEligibleForSkillDraft,
  collectRequiredApprovals,
  collectRequiredTools,
  type SkillRunEvidence,
} from "./evidence";

export type SkillDraftBody = {
  when_to_use: string;
  inputs: string[];
  method: string[];
  validation: string;
  output: string;
  failures: string[];
  required_tools: string[];
  required_components: string[];
  required_approvals: string[];
};

export type BuildSkillDraftInput = {
  evidence: SkillRunEvidence;
  workspaceId: string;
  draftId: string;
  createdBy: string;
  createdAt: string;
  revision?: number;
};

export class SkillDraftBuildError extends Error {
  readonly code: "run_not_completed" | "invalid_source_steps" | "unsafe_evidence";

  constructor(code: "run_not_completed" | "invalid_source_steps" | "unsafe_evidence") {
    super(`Skill draft cannot be created: ${code}.`);
    this.name = "SkillDraftBuildError";
    this.code = code;
  }
}

function readPayloadString(payload: unknown, key: string): string | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }
  const value = (payload as Record<string, unknown>)[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function hashSkillSourceContent(evidence: SkillRunEvidence): string {
  const preimage = {
    run_id: evidence.runId,
    goal: evidence.goal,
    source_message_body: evidence.sourceMessageBody,
    source_step_ids: [...evidence.sourceStepIds].sort(),
    events: evidence.events
      .map((event) => ({
        normalized_type: event.normalizedType,
        payload_redacted: event.payloadRedacted,
      }))
      .sort((left, right) =>
        `${left.normalized_type}:${canonicalizeJson(left.payload_redacted)}`.localeCompare(
          `${right.normalized_type}:${canonicalizeJson(right.payload_redacted)}`,
        ),
      ),
    approvals: evidence.approvals.map((approval) => ({
      tool_name: approval.toolName,
      state: approval.state,
    })),
    artifacts: evidence.artifacts.map((artifact) => ({ id: artifact.id, name: artifact.name })),
    tasks: evidence.tasks.map((task) => ({
      id: task.id,
      title: task.title,
      status: task.status,
    })),
    component_version_ids: [...evidence.componentVersionIds].sort(),
  };
  return `sha256:${createHash("sha256").update(canonicalizeJson(preimage)).digest("hex")}`;
}

export function hashSkillDraftBody(
  body: SkillDraftBody,
  revision: number,
  sourceContentHash: string,
): string {
  const preimage = {
    revision,
    source_content_hash: sourceContentHash,
    when_to_use: body.when_to_use,
    inputs: body.inputs,
    method: body.method,
    validation: body.validation,
    output: body.output,
    failures: body.failures,
    required_tools: body.required_tools,
    required_components: body.required_components,
    required_approvals: body.required_approvals,
  };
  return `sha256:${createHash("sha256").update(canonicalizeJson(preimage)).digest("hex")}`;
}

export function buildSkillDraftMarkdown(body: SkillDraftBody): string {
  const lines = [
    "# Saved run skill",
    "",
    "## When to use",
    body.when_to_use,
    "",
    "## Inputs",
    ...body.inputs.map((input) => `- ${input}`),
    "",
    "## Method",
    ...body.method.map((step, index) => `${index + 1}. ${step}`),
    "",
    "## Validation",
    body.validation,
    "",
    "## Output",
    body.output,
    "",
    "## Failures",
    ...(body.failures.length > 0 ? body.failures.map((entry) => `- ${entry}`) : ["- No data"]),
  ];
  return lines.join("\n");
}

export function hashSkillMarkdown(markdown: string): string {
  return `sha256:${createHash("sha256").update(markdown, "utf8").digest("hex")}`;
}

export function buildSkillDraftBody(evidence: SkillRunEvidence): SkillDraftBody {
  const requiredTools = collectRequiredTools(evidence);
  const requiredApprovals = collectRequiredApprovals(evidence);
  const method = evidence.steps
    .filter((step) => evidence.sourceStepIds.includes(step.id))
    .map((step) => step.objective);

  for (const event of evidence.events) {
    if (event.normalizedType === "tool.started" || event.normalizedType === "tool.succeeded") {
      const toolName = readPayloadString(event.payloadRedacted, "tool_name");
      const target = readPayloadString(event.payloadRedacted, "target");
      if (toolName) {
        method.push(
          target
            ? `Use ${toolName} against ${target}.`
            : `Use ${toolName} with the approved bounded arguments.`,
        );
      }
    }
    if (event.normalizedType === "approval.decided") {
      const decision = readPayloadString(event.payloadRedacted, "decision");
      const toolName = readPayloadString(event.payloadRedacted, "tool_name");
      if (toolName && decision) {
        method.push(`Record host approval decision ${decision} for ${toolName}.`);
      }
    }
    if (event.normalizedType === "artifact.published") {
      const name = readPayloadString(event.payloadRedacted, "name");
      if (name) {
        method.push(`Publish artifact ${name} for audit and downstream review.`);
      }
    }
  }

  const inputs = [
    evidence.goal,
    evidence.sourceMessageBody,
    ...evidence.events
      .map((event) => readPayloadString(event.payloadRedacted, "target"))
      .filter((value): value is string => Boolean(value)),
  ].filter((value, index, array) => array.indexOf(value) === index);

  const failures = evidence.events
    .filter((event) => event.normalizedType === "tool.failed")
    .map((event) => {
      const toolName = readPayloadString(event.payloadRedacted, "tool_name");
      return toolName ? `Stop and report when ${toolName} fails.` : "Stop and report tool failure.";
    });

  const output =
    evidence.artifacts.length > 0
      ? `Produce ${evidence.artifacts.map((artifact) => artifact.name).join(", ")} and reconcile against the source request.`
      : evidence.tasks.length > 0
        ? `Update task ${evidence.tasks[0]?.title ?? "record"} to the accepted terminal state.`
        : "Return a bounded summary that matches the accepted run outcome.";

  return {
    when_to_use: evidence.goal,
    inputs,
    method: method.length > 0 ? method : ["Follow the completed run steps in order."],
    validation:
      "Re-run the bounded read/approval checks and confirm the accepted outcome before finishing.",
    output,
    failures:
      failures.length > 0
        ? failures
        : ["If required tools or approvals are unavailable, stop without mutating provider state."],
    required_tools: requiredTools,
    required_components: [...evidence.componentVersionIds].sort(),
    required_approvals: requiredApprovals,
  };
}

export function buildSkillDraft(input: BuildSkillDraftInput): SkillDraft {
  const eligibility = assertRunEligibleForSkillDraft(input.evidence);
  if (eligibility) {
    throw new SkillDraftBuildError(eligibility);
  }
  const body = buildSkillDraftBody(input.evidence);
  const sourceContentHash = hashSkillSourceContent(input.evidence);
  const revision = input.revision ?? 1;
  const draftHash = hashSkillDraftBody(body, revision, sourceContentHash);
  return {
    schemaVersion: 1,
    id: input.draftId,
    workspace_id: input.workspaceId,
    revision,
    draft_hash: draftHash,
    source_run_id: input.evidence.runId,
    source_step_ids: [...input.evidence.sourceStepIds],
    source_content_hash: sourceContentHash,
    when_to_use: body.when_to_use,
    inputs: body.inputs,
    method: body.method,
    validation: body.validation,
    output: body.output,
    failures: body.failures,
    required_tools: body.required_tools,
    required_components: body.required_components,
    required_approvals: body.required_approvals,
    state: "draft",
    created_by: input.createdBy,
    created_at: input.createdAt,
  };
}
