import type { CoworkerDetail } from "../api/workspace-api";

export function formatCapability(value: string): string {
  return value
    .replace(/^component_/, "")
    .replace(/_v\d+$/, "")
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function formatVerifiedAt(value: string | null | undefined): string {
  if (!value) return "Not verified yet";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not verified yet";
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function coworkersBoundToSkillVersion(
  coworkers: CoworkerDetail[],
  skillVersionId: string,
): CoworkerDetail[] {
  return coworkers.filter((coworker) => coworker.config.skill_version_ids.includes(skillVersionId));
}

export function summarizeCoworkerGrants(coworker: CoworkerDetail): {
  tools: string[];
  skills: number;
  channels: number;
} {
  return {
    tools: coworker.config.tool_grants.slice(0, 4),
    skills: coworker.config.skill_version_ids.length,
    channels: coworker.config.channel_ids.length,
  };
}

export function approvalPolicyLines(coworker: CoworkerDetail): string[] {
  const lines = [
    "External writes require human approval before dispatch.",
    "Destructive tools remain blocked in P0.",
  ];
  if (coworker.config.task_record_grants.length > 0) {
    for (const grant of coworker.config.task_record_grants) {
      lines.push(`TaskRecord ${grant.operations.join(", ")} on channel ${grant.channel_id}`);
    }
  } else {
    lines.push("No TaskRecord write grants configured.");
  }
  return lines;
}
