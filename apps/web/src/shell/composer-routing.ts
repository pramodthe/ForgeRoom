import type { RoutingResolution } from "@forgeroom/contracts";
import { resolveMessageRecipients, type MentionRouterCoworker } from "@forgeroom/orchestration";
import type { ChannelRosterCoworker } from "../api/workspace-api";

export type ComposerMessageCommand = {
  body: string;
  recipient_handles: string[];
  routing_mode: "direct" | "team";
  parent_message_id: null;
};

export type ComposerRecipientPreview = {
  resolution: RoutingResolution;
  recipients: Array<{
    handle: string;
    name: string;
    routingLabel: string;
    toolsSummary: string;
  }>;
};

function rosterAvailabilityForRouting(
  availability: ChannelRosterCoworker["availability"],
): boolean {
  return availability !== "disabled" && availability !== "cancelling" && availability !== "offline";
}

export function rosterToRouterCoworkers(
  roster: readonly ChannelRosterCoworker[],
): MentionRouterCoworker[] {
  return roster.map((row) => ({
    id: row.coworker_id,
    handle: row.handle,
    status: row.availability === "disabled" ? "disabled" : "active",
    isChannelMember: true,
    availableForNewWork: rosterAvailabilityForRouting(row.availability),
  }));
}

export function previewComposerRecipients(input: {
  body: string;
  roster: readonly ChannelRosterCoworker[];
}): ComposerRecipientPreview {
  const resolution = resolveMessageRecipients({
    body: input.body,
    coworkers: rosterToRouterCoworkers(input.roster),
  });

  if (!resolution.ok) {
    return { resolution, recipients: [] };
  }

  const rosterByHandle = new Map(input.roster.map((row) => [row.handle.toLowerCase(), row]));
  const recipients = resolution.recipient_handles.map((handle) => {
    const row = rosterByHandle.get(handle.toLowerCase());
    const tools = row?.effective_tools ?? [];
    const toolsSummary =
      tools.length === 0
        ? "No tools granted"
        : tools.length <= 3
          ? tools.join(", ")
          : `${tools.slice(0, 3).join(", ")} +${tools.length - 3}`;
    return {
      handle,
      name: row?.name ?? handle,
      routingLabel: resolution.routing_mode === "team" ? "Team fan-out" : "Direct",
      toolsSummary,
    };
  });

  return { resolution, recipients };
}

export function composerSendBlocked(resolution: RoutingResolution): boolean {
  return !resolution.ok;
}

export function composerBlockReason(resolution: RoutingResolution): string | null {
  if (resolution.ok) {
    return null;
  }
  return resolution.message;
}

export function buildComposerMessageCommand(input: {
  body: string;
  roster: readonly ChannelRosterCoworker[];
}): { ok: true; command: ComposerMessageCommand } | { ok: false; message: string } {
  const trimmed = input.body.trim();
  const preview = previewComposerRecipients({ body: trimmed, roster: input.roster });
  if (!preview.resolution.ok) {
    return { ok: false, message: preview.resolution.message };
  }
  return {
    ok: true,
    command: {
      body: trimmed,
      recipient_handles: preview.resolution.recipient_handles,
      routing_mode: preview.resolution.routing_mode,
      parent_message_id: null,
    },
  };
}
