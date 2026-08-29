type PauseGroupLifecycleInput = {
  pauseGroupReady: boolean;
  pauseGroupState: string;
  requiredActionCount: number;
  resolvedActionCount: number;
  recordedVerb: "decision" | "answer";
};

export function formatPauseGroupLifecycleMessage(input: PauseGroupLifecycleInput): string[] {
  const lines = [input.recordedVerb === "decision" ? "Decision recorded." : "Answer recorded."];
  const remaining = input.requiredActionCount - input.resolvedActionCount;

  if (input.pauseGroupReady) {
    lines.push("Pause group ready — resume will start after the worker claims it.");
  } else if (remaining > 0) {
    lines.push(
      `${remaining} more required action${remaining === 1 ? "" : "s"} must resolve before resume.`,
    );
  }

  if (input.pauseGroupState === "resuming") {
    lines.push("Resume started.");
  } else if (input.pauseGroupState === "resumed") {
    lines.push("Resume completed — watch the timeline for execution results.");
  } else if (input.pauseGroupState === "uncertain") {
    lines.push("Resume outcome is uncertain and may need reconciliation.");
  }

  return lines;
}
