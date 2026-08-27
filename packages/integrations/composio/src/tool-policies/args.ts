import { formatGithubIssueDisplay } from "./demo-fixture";
import { ToolPolicyError, type RedactedArguments, type SafeTargetSummary } from "./types";

const REDACTED = "[REDACTED]";

/** Keys normalized the same way as @forgeroom/contracts forbidden payload checks. */
function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, "");
}

const FORBIDDEN_SUFFIXES = [
  "apikey",
  "accesstoken",
  "refreshtoken",
  "clientsecret",
  "authheader",
  "authorization",
  "credential",
  "credentials",
  "password",
  "passwordhash",
  "secret",
  "token",
  "bearer",
] as const;

const FORBIDDEN_EXACT = new Set([
  "password",
  "apikey",
  "accesstoken",
  "refreshtoken",
  "secret",
  "clientsecret",
  "credential",
  "credentials",
  "authorization",
  "authheader",
  "reasoning",
  "reasoningcontent",
  "thinking",
  "signature",
  "requestsignature",
  "rawtoolbody",
  "composioapikey",
  "trueforgeapikey",
  "githubsecret",
]);

export function isSensitiveArgumentKey(key: string): boolean {
  const normalized = normalizeKey(key);
  if (FORBIDDEN_EXACT.has(normalized)) {
    return true;
  }
  return FORBIDDEN_SUFFIXES.some((suffix) => normalized.endsWith(suffix));
}

function asPlainObject(args: unknown): Record<string, unknown> {
  if (typeof args !== "object" || args === null || Array.isArray(args)) {
    throw new ToolPolicyError("invalid_arguments", "tool arguments must be a plain object");
  }
  return args as Record<string, unknown>;
}

function requireString(obj: Record<string, unknown>, key: string): string {
  const value = obj[key];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new ToolPolicyError("invalid_arguments", `missing or invalid string field: ${key}`);
  }
  return value.trim();
}

function requireIssueNumber(obj: Record<string, unknown>): number {
  const value = obj.issue_number;
  if (typeof value === "number" && Number.isInteger(value) && value >= 1) {
    return value;
  }
  if (typeof value === "string" && /^\d+$/.test(value.trim())) {
    const parsed = Number(value.trim());
    if (parsed >= 1) {
      return parsed;
    }
  }
  throw new ToolPolicyError("invalid_arguments", "missing or invalid issue_number");
}

export function extractGithubIssueTarget(args: unknown): SafeTargetSummary {
  const obj = asPlainObject(args);
  const owner = requireString(obj, "owner");
  const repo = requireString(obj, "repo");
  const issueNumber = requireIssueNumber(obj);
  return {
    kind: "github_issue",
    owner,
    repo,
    issueNumber,
    display: formatGithubIssueDisplay(owner, repo, issueNumber),
  };
}

/**
 * Keep only allowlisted safe fields; redact any other/sensitive keys.
 * Output key order is sorted for deterministic previews/hashes.
 */
export function redactGithubIssueArguments(
  args: unknown,
  allowlist: readonly string[],
): RedactedArguments {
  const obj = asPlainObject(args);
  const allowed = new Set(allowlist);
  const out: Record<string, unknown> = {};

  for (const key of Object.keys(obj).sort()) {
    if (key === "__proto__" || key === "prototype" || key === "constructor") {
      out[key] = REDACTED;
      continue;
    }
    if (!allowed.has(key) || isSensitiveArgumentKey(key)) {
      out[key] = REDACTED;
      continue;
    }
    const value = obj[key];
    if (key === "labels" && Array.isArray(value)) {
      if (value.length === 0) {
        throw new ToolPolicyError("invalid_arguments", "labels must be a non-empty array");
      }
      out[key] = [...value].map(String).sort();
      continue;
    }
    if (key === "issue_number") {
      out[key] = requireIssueNumber(obj);
      continue;
    }
    if (typeof value === "string") {
      out[key] = value.trim();
      continue;
    }
    out[key] = value;
  }

  // Ensure required allowlisted fields are present after redaction.
  for (const key of allowlist) {
    if (!(key in out)) {
      if (key === "issue_number") {
        out[key] = requireIssueNumber(obj);
      } else if (key === "labels") {
        const labels = obj.labels;
        if (!Array.isArray(labels) || labels.length === 0) {
          throw new ToolPolicyError("invalid_arguments", "labels must be a non-empty array");
        }
        out[key] = [...labels].map(String).sort();
      } else if (key === "name") {
        out[key] = requireString(obj, "name");
      } else {
        out[key] = requireString(obj, key);
      }
    }
  }

  return Object.freeze(out);
}

export function composioSuccessful(result: unknown): boolean | null {
  if (typeof result !== "object" || result === null || Array.isArray(result)) {
    return null;
  }
  const successful = (result as { successful?: unknown }).successful;
  if (typeof successful === "boolean") {
    return successful;
  }
  return null;
}

export function extractLabelNamesFromIssueResult(result: unknown): string[] | null {
  if (typeof result !== "object" || result === null || Array.isArray(result)) {
    return null;
  }
  const root = result as Record<string, unknown>;
  const data = root.data ?? root;
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    return null;
  }
  const labels = (data as { labels?: unknown }).labels;
  if (!Array.isArray(labels)) {
    return null;
  }
  return labels.map((entry) => {
    if (typeof entry === "string") {
      return entry;
    }
    if (typeof entry === "object" && entry !== null && "name" in entry) {
      const name = (entry as { name?: unknown }).name;
      return typeof name === "string" ? name : String(name);
    }
    return String(entry);
  });
}
