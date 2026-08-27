import { describe, expect, it } from "vitest";
import type { ChannelRosterCoworker } from "../api/workspace-api";
import {
  buildComposerMessageCommand,
  composerBlockReason,
  composerSendBlocked,
  previewComposerRecipients,
} from "./composer-routing";

function rosterRow(
  handle: string,
  overrides: Partial<ChannelRosterCoworker> = {},
): ChannelRosterCoworker {
  return {
    participant_id: `p_${handle}`,
    coworker_id: `cw_${handle}`,
    handle,
    name: handle[0]!.toUpperCase() + handle.slice(1),
    title: "Demo coworker",
    role: "member",
    availability: "available",
    assignment_summary: null,
    effective_tools: ["demo.read"],
    ...overrides,
  };
}

describe("previewComposerRecipients", () => {
  const roster = [rosterRow("analyst"), rosterRow("builder")];

  it("previews a single mention", () => {
    const preview = previewComposerRecipients({ body: "@analyst review this", roster });
    expect(preview.resolution.ok).toBe(true);
    if (preview.resolution.ok) {
      expect(preview.resolution.recipient_handles).toEqual(["analyst"]);
      expect(preview.resolution.routing_mode).toBe("direct");
    }
    expect(preview.recipients[0]?.name).toBe("Analyst");
  });

  it("previews @team fan-out sorted handles", () => {
    const preview = previewComposerRecipients({ body: "@team ship it", roster });
    expect(preview.resolution.ok).toBe(true);
    if (preview.resolution.ok) {
      expect(preview.resolution.routing_mode).toBe("team");
      expect(preview.resolution.recipient_handles).toEqual(["analyst", "builder"]);
    }
  });

  it("blocks unknown handles", () => {
    const preview = previewComposerRecipients({ body: "@ghost hello", roster });
    expect(composerSendBlocked(preview.resolution)).toBe(true);
    expect(composerBlockReason(preview.resolution)).toMatch(/unknown/i);
  });

  it("blocks multi-coworker channels without explicit recipient", () => {
    const preview = previewComposerRecipients({ body: "hello team", roster });
    expect(composerSendBlocked(preview.resolution)).toBe(true);
    expect(composerBlockReason(preview.resolution)).toMatch(/explicit/i);
  });

  it("blocks rotating coworkers", () => {
    const rotating = [rosterRow("analyst"), rosterRow("builder", { availability: "cancelling" })];
    const preview = previewComposerRecipients({ body: "@builder fix", roster: rotating });
    expect(composerSendBlocked(preview.resolution)).toBe(true);
    expect(composerBlockReason(preview.resolution)).toMatch(/unavailable/i);
  });

  it("auto-routes single-member channels", () => {
    const preview = previewComposerRecipients({
      body: "status update",
      roster: [rosterRow("analyst")],
    });
    expect(preview.resolution.ok).toBe(true);
    if (preview.resolution.ok) {
      expect(preview.resolution.recipient_handles).toEqual(["analyst"]);
    }
  });
});

describe("buildComposerMessageCommand", () => {
  const roster = [rosterRow("analyst"), rosterRow("builder")];

  it("submits previewed direct routing for a mention", () => {
    const built = buildComposerMessageCommand({ body: "@analyst review", roster });
    expect(built.ok).toBe(true);
    if (built.ok) {
      expect(built.command).toEqual({
        body: "@analyst review",
        recipient_handles: ["analyst"],
        routing_mode: "direct",
        parent_message_id: null,
      });
    }
  });

  it("submits previewed team fan-out for @team", () => {
    const built = buildComposerMessageCommand({ body: "@team ship", roster });
    expect(built.ok).toBe(true);
    if (built.ok) {
      expect(built.command.recipient_handles).toEqual(["analyst", "builder"]);
      expect(built.command.routing_mode).toBe("team");
    }
  });
});
