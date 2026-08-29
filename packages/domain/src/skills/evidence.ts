import type { Run, RunStep, SafeJsonValue } from "@forgeroom/contracts";
import { assertSkillEvidencePayloadSafe } from "./redaction";

export type SkillRunEvidenceEvent = {
  normalizedType: string;
  payloadRedacted: SafeJsonValue;
};

export type SkillRunEvidence = {
  runId: string;
  goal: string;
  sourceMessageBody: string;
  lifecycle: Run["lifecycle"];
  sourceStepIds: string[];
  steps: RunStep[];
  events: SkillRunEvidenceEvent[];
  approvals: Array<{ toolName: string; state: string }>;
  artifacts: Array<{ id: string; name: string }>;
  tasks: Array<{ id: string; title: string; status: string }>;
  componentVersionIds: string[];
};

export type SkillDraftEligibilityError =
  "run_not_completed" | "invalid_source_steps" | "unsafe_evidence";

export function assertRunEligibleForSkillDraft(
  evidence: SkillRunEvidence,
): SkillDraftEligibilityError | null {
  if (evidence.lifecycle !== "completed") {
    return "run_not_completed";
  }
  const stepIds = new Set(evidence.steps.map((step) => step.id));
  if (
    evidence.sourceStepIds.length === 0 ||
    evidence.sourceStepIds.some((stepId) => !stepIds.has(stepId))
  ) {
    return "invalid_source_steps";
  }
  const selectedSteps = evidence.steps.filter((step) => evidence.sourceStepIds.includes(step.id));
  if (selectedSteps.some((step) => step.state !== "completed")) {
    return "invalid_source_steps";
  }
  try {
    assertSkillEvidencePayloadSafe({ goal: evidence.goal, message: evidence.sourceMessageBody });
    for (const event of evidence.events) {
      assertSkillEvidencePayloadSafe(event.payloadRedacted);
    }
  } catch {
    return "unsafe_evidence";
  }
  return null;
}

export function collectRequiredTools(evidence: SkillRunEvidence): string[] {
  const tools = new Set<string>();
  for (const approval of evidence.approvals) {
    if (approval.toolName) {
      tools.add(approval.toolName);
    }
  }
  for (const event of evidence.events) {
    if (!event.normalizedType.startsWith("tool.")) {
      continue;
    }
    const payload = readPayloadRecord(event.payloadRedacted);
    const toolName = payload?.tool_name;
    if (typeof toolName === "string" && toolName.length > 0) {
      tools.add(toolName);
    }
  }
  return [...tools].sort();
}

function readPayloadRecord(payload: SafeJsonValue): Record<string, unknown> | null {
  let value: unknown = payload;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      return null;
    }
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

export function collectRequiredApprovals(evidence: SkillRunEvidence): string[] {
  const approvals = new Set<string>();
  for (const approval of evidence.approvals) {
    if (approval.state === "allowed" || approval.state === "succeeded") {
      approvals.add(`host_approval_${approval.toolName.toLowerCase()}`);
    }
  }
  for (const event of evidence.events) {
    if (event.normalizedType !== "approval.decided") {
      continue;
    }
    const payload = readPayloadRecord(event.payloadRedacted);
    const toolName = payload?.tool_name;
    if (typeof toolName === "string" && toolName.length > 0) {
      approvals.add(`host_approval_${toolName.toLowerCase()}`);
    }
  }
  return [...approvals].sort();
}
