import type {
  ApplicationSourceName,
  ForgeRoomActivityContent,
  RunActivityCounters,
  RunLifecycle,
  TaskStatus,
} from "@forgeroom/contracts";

export type { ApplicationSourceName };

export type ActivityPresentation = {
  eyebrow: string;
  title: string;
  detail?: string;
  status?: string;
  tone: "neutral" | "info" | "success" | "warning" | "danger" | "violet";
  inert?: boolean;
};

const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  todo: "To do",
  in_progress: "In progress",
  blocked: "Blocked",
  in_review: "In review",
  done: "Done",
  cancelled: "Cancelled",
};

const RUN_LIFECYCLE_LABEL: Record<RunLifecycle, string> = {
  queued: "Queued",
  active: "Active",
  completed: "Completed",
  partial: "Partial",
  failed: "Failed",
  cancelled: "Cancelled",
};

export function formatRunActivityCounters(counters: RunActivityCounters): string {
  const parts: string[] = [];
  if (counters.running > 0) parts.push(`${counters.running} running`);
  if (counters.planning > 0) parts.push(`${counters.planning} planning`);
  if (counters.awaiting_input > 0) parts.push(`${counters.awaiting_input} awaiting input`);
  if (counters.awaiting_approval > 0) parts.push(`${counters.awaiting_approval} awaiting approval`);
  if (counters.blocked_connection > 0) parts.push(`${counters.blocked_connection} blocked`);
  if (counters.cancelling > 0) parts.push(`${counters.cancelling} cancelling`);
  if (counters.queued > 0) parts.push(`${counters.queued} queued`);
  return parts.length > 0 ? parts.join(" · ") : "No active work";
}

export function presentForgeRoomActivity(content: ForgeRoomActivityContent): ActivityPresentation {
  switch (content.activityType) {
    case "forgeroom.coworker_work.v1": {
      const phaseLabel =
        content.phase === "queued"
          ? "Queued"
          : content.phase === "running"
            ? "Working"
            : content.phase === "interrupted"
              ? "Needs input"
              : content.phase === "finished"
                ? "Finished"
                : "Failed";
      return {
        eyebrow: "Assignment",
        title: content.assignment,
        detail: "Persistent coworker work lane",
        status: phaseLabel,
        tone:
          content.phase === "failed"
            ? "danger"
            : content.phase === "interrupted"
              ? "warning"
              : content.phase === "finished"
                ? "success"
                : "violet",
      };
    }
    case "forgeroom.task_record.v1":
      return {
        eyebrow: "Task",
        title: content.title,
        detail: `Revision ${content.revision}`,
        status: TASK_STATUS_LABEL[content.status],
        tone: content.status === "blocked" ? "warning" : "info",
      };
    case "forgeroom.sandbox.v1": {
      const stateLabel =
        content.commandState === "creating"
          ? "Creating"
          : content.commandState === "running"
            ? "Running"
            : content.commandState === "completed"
              ? "Completed"
              : "Failed";
      return {
        eyebrow: "Sandbox",
        title: "Sandbox command",
        detail: "Isolated command execution",
        status: stateLabel,
        tone: content.commandState === "failed" ? "danger" : "neutral",
      };
    }
    case "forgeroom.artifact.v1":
      return {
        eyebrow: "Artifact",
        title: content.title,
        detail: `${content.mimeType} · revision ${content.revision}`,
        status: "Published",
        tone: "success",
      };
    case "forgeroom.pause_group.v1": {
      const waiting = content.requiredActionCount - content.resolvedActionCount;
      return {
        eyebrow: "Human action",
        title:
          content.state === "collecting" ? "Waiting for human decisions" : "Pause group update",
        detail: `${content.resolvedActionCount} of ${content.requiredActionCount} resolved`,
        status: waiting > 0 ? `${waiting} waiting` : "Ready to resume",
        tone: waiting > 0 ? "warning" : "success",
      };
    }
    case "forgeroom.controlled_ui.v1":
      return {
        eyebrow: "Component",
        title: content.componentName,
        detail: content.textAlternative,
        status: content.status,
        tone: content.status === "failed" ? "danger" : "info",
      };
    case "forgeroom.connection.v1":
      return {
        eyebrow: "Connection",
        title: "Connector status changed",
        detail: "Toolkit connection health",
        status: content.status,
        tone:
          content.status === "expired" ||
          content.status === "revoked" ||
          content.status === "drifted"
            ? "warning"
            : "success",
      };
    case "forgeroom.audit_receipt.v1":
      return {
        eyebrow: "Receipt",
        title: "Run receipt recorded",
        detail: "Safe final receipt hash stored",
        status: "Verified",
        tone: "success",
      };
    default:
      return presentUnknownActivity();
  }
}

export function presentUnsupportedCapability(summary?: string): ActivityPresentation {
  return {
    eyebrow: "Unsupported",
    title: "Capability unavailable in P0",
    detail: summary ?? "This coworker requested a capability that is not enabled in this release.",
    status: "Inert",
    tone: "neutral",
    inert: true,
  };
}

export function presentUnknownActivity(): ActivityPresentation {
  return {
    eyebrow: "Activity",
    title: "Unsupported activity",
    detail: "This activity type cannot be rendered safely.",
    status: "Inert",
    tone: "neutral",
    inert: true,
  };
}

const CUSTOM_EVENT_PRESENTATION: Partial<Record<ApplicationSourceName, ActivityPresentation>> = {
  "task.created": {
    eyebrow: "Task",
    title: "Task created",
    detail: "Authoritative TaskRecord persisted",
    tone: "info",
  },
  "task.updated": {
    eyebrow: "Task",
    title: "Task updated",
    detail: "Task revision recorded",
    tone: "info",
  },
  "tool.proposed": {
    eyebrow: "Tool",
    title: "Tool proposed",
    detail: "Awaiting policy review",
    tone: "neutral",
  },
  "tool.started": {
    eyebrow: "Tool",
    title: "Tool running",
    detail: "External tool execution started",
    tone: "violet",
  },
  "tool.succeeded": {
    eyebrow: "Tool",
    title: "Tool completed",
    detail: "Safe receipt recorded",
    tone: "success",
  },
  "tool.failed": {
    eyebrow: "Tool",
    title: "Tool failed",
    detail: "Execution did not complete",
    tone: "danger",
  },
  "tool.outcome_unknown": {
    eyebrow: "Tool",
    title: "Tool outcome uncertain",
    detail: "External result could not be verified",
    tone: "warning",
  },
  "sandbox.created": {
    eyebrow: "Sandbox",
    title: "Sandbox created",
    tone: "neutral",
  },
  "sandbox.command_started": {
    eyebrow: "Sandbox",
    title: "Sandbox command started",
    tone: "violet",
  },
  "sandbox.command_completed": {
    eyebrow: "Sandbox",
    title: "Sandbox command completed",
    tone: "success",
  },
  "sandbox.failed": {
    eyebrow: "Sandbox",
    title: "Sandbox failed",
    tone: "danger",
  },
  "artifact.discovered": {
    eyebrow: "Artifact",
    title: "Artifact discovered",
    tone: "info",
  },
  "artifact.published": {
    eyebrow: "Artifact",
    title: "Artifact published",
    tone: "success",
  },
  "artifact.preview_failed": {
    eyebrow: "Artifact",
    title: "Artifact preview unavailable",
    tone: "warning",
  },
  "approval.requested": {
    eyebrow: "Approval",
    title: "Approval requested",
    detail: "Trusted host approval card required",
    status: "Waiting",
    tone: "warning",
  },
  "approval.decided": {
    eyebrow: "Approval",
    title: "Approval recorded",
    detail: "Human decision persisted; external execution waits for resume",
    tone: "success",
  },
  "approval.stale": {
    eyebrow: "Approval",
    title: "Approval stale",
    detail: "Proposal is no longer actionable",
    tone: "warning",
  },
  "question.requested": {
    eyebrow: "Question",
    title: "Clarifying question asked",
    detail: "Answer through the trusted question card",
    status: "Waiting",
    tone: "warning",
  },
  "question.answered": {
    eyebrow: "Question",
    title: "Question answered",
    detail: "Encrypted answer stored until resume is confirmed",
    tone: "success",
  },
  "pause_group.created": {
    eyebrow: "Human action",
    title: "Pause group opened",
    detail: "Waiting for owner decisions",
    status: "Waiting",
    tone: "warning",
  },
  "pause_group.ready": {
    eyebrow: "Human action",
    title: "Pause group ready",
    detail: "Every required action has resolved",
    status: "Ready",
    tone: "success",
  },
  "pause_group.resume_started": {
    eyebrow: "Human action",
    title: "Resume started",
    detail: "Response-only turn queued",
    status: "Resuming",
    tone: "violet",
  },
  "pause_group.resumed": {
    eyebrow: "Human action",
    title: "Resume completed",
    detail: "Work continues after human input",
    status: "Resumed",
    tone: "success",
  },
  "pause_group.resume_uncertain": {
    eyebrow: "Human action",
    title: "Resume uncertain",
    detail: "Outcome needs reconciliation",
    status: "Uncertain",
    tone: "warning",
  },
  "connection.blocked": {
    eyebrow: "Connection",
    title: "Connection blocked",
    detail: "Reconnect the acting account to continue",
    tone: "warning",
  },
  "connection.restored": {
    eyebrow: "Connection",
    title: "Connection restored",
    tone: "success",
  },
  "run.cancel_requested": {
    eyebrow: "Run",
    title: "Cancellation requested",
    tone: "warning",
  },
  "run.cancelled": {
    eyebrow: "Run",
    title: "Run cancelled",
    tone: "neutral",
  },
  "run.failed": {
    eyebrow: "Run",
    title: "Run failed",
    tone: "danger",
  },
  "run.partial": {
    eyebrow: "Run",
    title: "Run partially completed",
    tone: "warning",
  },
  "run.completed": {
    eyebrow: "Run",
    title: "Run completed",
    tone: "success",
  },
  "step.queued": {
    eyebrow: "Step",
    title: "Coworker step queued",
    tone: "neutral",
  },
  "step.started": {
    eyebrow: "Step",
    title: "Coworker step started",
    tone: "violet",
  },
  "step.completed": {
    eyebrow: "Step",
    title: "Coworker step completed",
    tone: "success",
  },
  "step.failed": {
    eyebrow: "Step",
    title: "Coworker step failed",
    tone: "danger",
  },
};

const NATIVE_SUBAGENT_EVENTS: ReadonlySet<string> = new Set([
  "subagent.started",
  "subagent.completed",
  "subagent.failed",
]);

export function presentToolCall(input: {
  toolName: string;
  status: "running" | "complete";
}): ActivityPresentation {
  return input.status === "complete"
    ? {
        eyebrow: "Tool",
        title: input.toolName,
        detail: "Tool execution completed",
        status: "Completed",
        tone: "success",
      }
    : {
        eyebrow: "Tool",
        title: input.toolName,
        detail: "External tool execution in progress",
        status: "Running",
        tone: "violet",
      };
}

export function presentCustomEvent(
  name: ApplicationSourceName,
  payload?: { lifecycle?: RunLifecycle; activity?: RunActivityCounters },
): ActivityPresentation {
  if (NATIVE_SUBAGENT_EVENTS.has(name)) {
    return presentUnsupportedCapability("Native subagent events are inert in P0.");
  }

  if (name === "run.state_changed" || name === "run.created" || name === "run.routing_resolved") {
    const lifecycle = payload?.lifecycle;
    const counters = payload?.activity;
    return {
      eyebrow: "Run",
      title:
        name === "run.routing_resolved"
          ? "Recipients resolved"
          : lifecycle
            ? `Run ${RUN_LIFECYCLE_LABEL[lifecycle].toLowerCase()}`
            : "Run updated",
      detail: counters ? formatRunActivityCounters(counters) : undefined,
      status: lifecycle ? RUN_LIFECYCLE_LABEL[lifecycle] : undefined,
      tone:
        lifecycle === "failed"
          ? "danger"
          : lifecycle === "partial"
            ? "warning"
            : lifecycle === "completed"
              ? "success"
              : "info",
    };
  }

  const preset = CUSTOM_EVENT_PRESENTATION[name];
  if (preset) {
    return preset;
  }

  if (name.startsWith("ui.")) {
    return {
      eyebrow: "Component",
      title: "Component surface updated",
      detail: "Controlled UI state changed",
      tone: "info",
    };
  }

  if (name.startsWith("session.") || name.startsWith("turn.")) {
    return {
      eyebrow: "Session",
      title: "Session state changed",
      detail: "Coworker session provisioning update",
      tone: "neutral",
    };
  }

  return {
    eyebrow: "Activity",
    title: name.replaceAll(".", " "),
    detail: "Normalized channel event",
    tone: "neutral",
  };
}

export function activityIconForEyebrow(eyebrow: string): string {
  switch (eyebrow) {
    case "Task":
      return "✓";
    case "Tool":
      return "⚙";
    case "Sandbox":
      return "▣";
    case "Artifact":
      return "◫";
    case "Approval":
    case "Question":
    case "Human action":
      return "!";
    case "Connection":
      return "↯";
    case "Run":
    case "Step":
      return "→";
    case "Receipt":
      return "✦";
    case "Component":
      return "◻";
    case "Unsupported":
      return "—";
    default:
      return "•";
  }
}
