import { GOLDEN_RESEARCH_PROMPT } from "./constants";

/** Untrusted structured builder output — requests only, never authority. */
export type CoworkerDraftProposalV1 = {
  schemaVersion: 1;
  displayName: string;
  title: string;
  job: string;
  instructions: string;
  modelPresetName?: string;
  requestedChannels: string[];
  requestedSkills: string[];
  requestedConnections: Array<{
    connector: string;
    effects: Array<"read" | "write" | "destructive">;
  }>;
  requestedKnowledgeScopes: string[];
  requestedMemoryScopes: string[];
  requestedRecordCapabilities: string[];
  approvalIntent: "read_only" | "approve_writes" | "approve_all_tools";
  sandboxRequested: boolean;
  nativeSubagentsRequested: boolean;
  generativeUiRequested: boolean;
};

export type BuildCoworkerDraftProposalInput = {
  request: string;
  /** Optional channel names/handles mentioned in the request. */
  knownChannelNames?: string[];
};

const INJECTION_MARKERS = [
  /ignore\s+(all\s+)?previous\s+instructions/i,
  /grant\s+(me\s+)?(write|destructive|admin)/i,
  /enable\s+(all\s+)?tools/i,
  /GITHUB_ADD_LABELS/i,
  /GITHUB_REMOVE_A_LABEL/i,
  /new\s+account\s+connection/i,
  /native\s+subagents?\s+enabled/i,
] as const;

function normalizeRequest(request: string): string {
  return request.trim().replace(/\s+/g, " ");
}

function isResearchReadOnlyRequest(request: string): boolean {
  const normalized = normalizeRequest(request).toLowerCase();
  const golden = GOLDEN_RESEARCH_PROMPT.toLowerCase();
  if (normalized === golden) {
    return true;
  }
  return (
    normalized.includes("research") &&
    (normalized.includes("read") || normalized.includes("github")) &&
    (normalized.includes("cannot modify") ||
      normalized.includes("can't modify") ||
      normalized.includes("read-only") ||
      normalized.includes("read only"))
  );
}

function researchProposal(request: string): CoworkerDraftProposalV1 {
  return {
    schemaVersion: 1,
    displayName: "Research",
    title: "Read-only research coworker",
    job: request,
    instructions:
      "Analyze GitHub and public evidence with read-only tools. Produce sourced briefings without mutating external systems.",
    modelPresetName: "openai/gpt-5-4-mini",
    requestedChannels: [],
    requestedSkills: [],
    requestedConnections: [{ connector: "github", effects: ["read"] }],
    requestedKnowledgeScopes: [],
    requestedMemoryScopes: [],
    requestedRecordCapabilities: [],
    approvalIntent: "read_only",
    sandboxRequested: false,
    nativeSubagentsRequested: false,
    generativeUiRequested: true,
  };
}

function genericReadOnlyProposal(request: string): CoworkerDraftProposalV1 {
  return {
    schemaVersion: 1,
    displayName: "Specialist",
    title: "Read-only specialist",
    job: request,
    instructions: request,
    modelPresetName: "openai/gpt-5-4-mini",
    requestedChannels: [],
    requestedSkills: [],
    requestedConnections: [{ connector: "github", effects: ["read"] }],
    requestedKnowledgeScopes: [],
    requestedMemoryScopes: [],
    requestedRecordCapabilities: [],
    approvalIntent: "read_only",
    sandboxRequested: false,
    nativeSubagentsRequested: false,
    generativeUiRequested: false,
  };
}

/**
 * Dedicated no-external-tools builder path. Output is untrusted; server resolution is authoritative.
 * Injection markers in user text cannot expand requested effects beyond read-only research defaults.
 */
export function buildCoworkerDraftProposalFromRequest(
  input: BuildCoworkerDraftProposalInput,
): CoworkerDraftProposalV1 {
  const request = normalizeRequest(input.request);
  if (request.length === 0) {
    throw new Error("Coworker request must not be empty.");
  }

  const injectionAttempt = INJECTION_MARKERS.some((pattern) => pattern.test(request));
  const base = isResearchReadOnlyRequest(request)
    ? researchProposal(request)
    : genericReadOnlyProposal(request);

  if (injectionAttempt) {
    return {
      ...base,
      approvalIntent: "read_only",
      requestedConnections: [{ connector: "github", effects: ["read"] }],
      nativeSubagentsRequested: false,
      sandboxRequested: false,
      requestedKnowledgeScopes: [],
      requestedMemoryScopes: [],
      requestedRecordCapabilities: [],
    };
  }

  if (/write|destructive|modify|delete|create issue|add label|remove label/i.test(request)) {
    return {
      ...base,
      approvalIntent: "read_only",
      requestedConnections: [{ connector: "github", effects: ["read"] }],
    };
  }

  if (/native subagent|child agent|sub-agent/i.test(request)) {
    return {
      ...base,
      nativeSubagentsRequested: false,
    };
  }

  return base;
}
