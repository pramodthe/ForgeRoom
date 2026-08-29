import type { SafeJsonValue } from "@forgeroom/contracts";

const EVENT_TITLES: Record<string, string> = {
  "tool.started": "Tool started",
  "tool.succeeded": "Tool succeeded",
  "tool.failed": "Tool failed",
  "connection.blocked": "Connection blocked",
  "turn.done": "Turn completed",
  "turn.error": "Turn error",
  "turn.failed": "Turn failed",
  "session.error": "Session error",
  "approval.decided": "Approval decided",
  "artifact.discovered": "Artifact discovered",
  "artifact.published": "Artifact published",
  "artifact.preview_failed": "Artifact preview failed",
  "pause.resume.started": "Resume started",
  "pause.resume.completed": "Resume completed",
};

export function formatRunEventTitle(normalizedType: string): string {
  return (
    EVENT_TITLES[normalizedType] ??
    normalizedType
      .split(".")
      .map((part) => part.replaceAll("_", " "))
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" · ")
  );
}

export function formatRunEventDetail(
  normalizedType: string,
  payloadRedacted: SafeJsonValue,
): string {
  if (payloadRedacted && typeof payloadRedacted === "object" && !Array.isArray(payloadRedacted)) {
    const payload = payloadRedacted as Record<string, unknown>;
    if (typeof payload.tool_name === "string") {
      return payload.tool_name;
    }
    if (typeof payload.display === "string") {
      return payload.display;
    }
    if (typeof payload.message === "string") {
      return payload.message;
    }
    if (typeof payload.decision === "string") {
      return `Decision: ${payload.decision}`;
    }
    if (typeof payload.state === "string") {
      return payload.state.replaceAll("_", " ");
    }
    if (typeof payload.name === "string") {
      return payload.name;
    }
  }
  return formatRunEventTitle(normalizedType);
}

export function formatQuestionPromptLabel(promptRedacted: SafeJsonValue): string {
  if (typeof promptRedacted === "string") {
    return promptRedacted;
  }
  if (promptRedacted && typeof promptRedacted === "object" && !Array.isArray(promptRedacted)) {
    const prompt = (promptRedacted as Record<string, unknown>).prompt;
    if (typeof prompt === "string") {
      return prompt;
    }
    if (prompt && typeof prompt === "object" && !Array.isArray(prompt)) {
      const nested = (prompt as Record<string, unknown>).prompt;
      if (typeof nested === "string") {
        return nested;
      }
    }
  }
  return "Question";
}
