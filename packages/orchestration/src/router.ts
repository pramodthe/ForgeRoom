import {
  P0_MAX_ROUTING_RECIPIENTS,
  type RoutingFailureCode,
  type RoutingFailureReason,
  type RoutingResolution,
} from "@forgeroom/contracts";

/** Reserved team fan-out mention token (case-insensitive). */
export const TEAM_MENTION = "team" as const;

/**
 * Mention token pattern: `@handle` where handle starts with a letter/digit and
 * may continue with letter/digit/underscore/hyphen/dot. Only recognized after
 * start-of-string or whitespace/opening punctuation so email local-parts and
 * `+@` fragments are not treated as mentions.
 */
const MENTION_RE = /(?:^|[\s([{<"'])@([A-Za-z0-9][A-Za-z0-9_.-]*)/g;

export type MentionRouterCoworker = {
  readonly id: string;
  readonly handle: string;
  /** Workspace profile status. */
  readonly status: "active" | "disabled";
  /** True when the coworker is an active channel participant. */
  readonly isChannelMember: boolean;
  /**
   * True only when the coworker can accept new work.
   * Callers must set this explicitly (e.g. false while a session is rotating).
   */
  readonly availableForNewWork: boolean;
};

export type ResolveMessageRecipientsInput = {
  readonly body: string;
  readonly coworkers: readonly MentionRouterCoworker[];
};

function failure(
  code: RoutingFailureCode,
  reason: RoutingFailureReason,
  message: string,
  details: Record<string, unknown> = {},
): RoutingResolution {
  return { ok: false, code, reason, message, details };
}

/** Extract ordered unique mention tokens from a message body (lowercased for @team). */
export function extractMentionTokens(body: string): string[] {
  const seen = new Set<string>();
  const tokens: string[] = [];
  MENTION_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = MENTION_RE.exec(body)) !== null) {
    const raw = match[1]!;
    const key = raw.toLowerCase() === TEAM_MENTION ? TEAM_MENTION : raw;
    if (seen.has(key.toLowerCase())) {
      continue;
    }
    seen.add(key.toLowerCase());
    tokens.push(key);
  }
  return tokens;
}

function enabledMembers(coworkers: readonly MentionRouterCoworker[]): MentionRouterCoworker[] {
  return coworkers.filter((row) => row.status === "active" && row.isChannelMember);
}

function assertHandlesUnambiguous(
  coworkers: readonly MentionRouterCoworker[],
): RoutingResolution | null {
  const byLower = new Map<string, string[]>();
  for (const row of coworkers) {
    const key = row.handle.toLowerCase();
    const list = byLower.get(key) ?? [];
    list.push(row.handle);
    byLower.set(key, list);
  }
  for (const [key, handles] of byLower) {
    if (handles.length > 1) {
      return failure(
        "validation_failed",
        "ambiguous_handle",
        "Channel coworker handles collide case-insensitively.",
        { handle: key, handles: [...new Set(handles)] },
      );
    }
  }
  return null;
}

function resolveHandle(
  token: string,
  coworkers: readonly MentionRouterCoworker[],
): { ok: true; coworker: MentionRouterCoworker } | RoutingResolution {
  const lowered = token.toLowerCase();
  const insensitive = coworkers.filter((row) => row.handle.toLowerCase() === lowered);
  if (insensitive.length > 1) {
    return failure(
      "validation_failed",
      "ambiguous_handle",
      "Mention matches multiple coworker handles.",
      { handle: token },
    );
  }
  if (insensitive.length === 1) {
    return { ok: true, coworker: insensitive[0]! };
  }

  return failure("validation_failed", "unknown_handle", "Mentioned coworker handle is unknown.", {
    handle: token,
  });
}

function authorizeTarget(coworker: MentionRouterCoworker): RoutingResolution | null {
  if (coworker.status === "disabled") {
    return failure("validation_failed", "disabled_coworker", "Mentioned coworker is disabled.", {
      handle: coworker.handle,
    });
  }
  if (!coworker.isChannelMember) {
    return failure(
      "validation_failed",
      "non_member",
      "Mentioned coworker is not a channel member.",
      { handle: coworker.handle },
    );
  }
  if (!coworker.availableForNewWork) {
    return failure(
      "recipient_unavailable",
      "recipient_unavailable",
      "Mentioned coworker is unavailable for new work.",
      { handle: coworker.handle },
    );
  }
  return null;
}

/**
 * Resolve authorized recipients from the message body alone.
 * Client-supplied recipient_handles / routing_mode must not be trusted.
 */
export function resolveMessageRecipients(input: ResolveMessageRecipientsInput): RoutingResolution {
  const tokens = extractMentionTokens(input.body);
  const hasTeam = tokens.some((token) => token.toLowerCase() === TEAM_MENTION);
  const explicit = tokens.filter((token) => token.toLowerCase() !== TEAM_MENTION);

  if (hasTeam && explicit.length > 0) {
    return failure(
      "validation_failed",
      "conflicting_routing",
      "Cannot combine @team with explicit coworker mentions.",
      { mentions: tokens },
    );
  }

  if (hasTeam) {
    const ambiguity = assertHandlesUnambiguous(enabledMembers(input.coworkers));
    if (ambiguity) {
      return ambiguity;
    }
    const enabled = enabledMembers(input.coworkers).filter((row) => row.availableForNewWork);
    if (enabled.length === 0) {
      return failure(
        "recipient_required",
        "team_empty",
        "@team requires at least one enabled channel coworker.",
      );
    }
    if (enabled.length > P0_MAX_ROUTING_RECIPIENTS) {
      return failure(
        "validation_failed",
        "team_too_large",
        "@team fans out to at most two enabled channel coworkers.",
        { enabled_count: enabled.length },
      );
    }
    const handles = [...enabled]
      .sort((a, b) => a.handle.localeCompare(b.handle))
      .map((row) => row.handle);
    return { ok: true, routing_mode: "team", recipient_handles: handles };
  }

  if (explicit.length > 0) {
    if (explicit.length > P0_MAX_ROUTING_RECIPIENTS) {
      return failure(
        "validation_failed",
        "fanout_too_large",
        "P0 direct fan-out supports at most two recipients.",
        { mention_count: explicit.length },
      );
    }
    const resolved: string[] = [];
    for (const token of explicit) {
      const match = resolveHandle(token, input.coworkers);
      if (!("coworker" in match)) {
        return match;
      }
      const denied = authorizeTarget(match.coworker);
      if (denied) {
        return denied;
      }
      if (!resolved.includes(match.coworker.handle)) {
        resolved.push(match.coworker.handle);
      }
    }
    if (resolved.length > P0_MAX_ROUTING_RECIPIENTS) {
      return failure(
        "validation_failed",
        "fanout_too_large",
        "P0 direct fan-out supports at most two recipients.",
        { recipient_count: resolved.length },
      );
    }
    return { ok: true, routing_mode: "direct", recipient_handles: resolved };
  }

  // No mention: auto-route only when exactly one enabled, available coworker.
  const enabled = enabledMembers(input.coworkers);
  const available = enabled.filter((row) => row.availableForNewWork);
  if (available.length === 1) {
    return {
      ok: true,
      routing_mode: "direct",
      recipient_handles: [available[0]!.handle],
    };
  }
  if (available.length === 0 && enabled.length === 1) {
    return failure(
      "recipient_unavailable",
      "recipient_unavailable",
      "The only channel coworker is unavailable for new work.",
      { handle: enabled[0]!.handle },
    );
  }
  return failure(
    "recipient_required",
    "recipient_required",
    "Multi-coworker channels require an explicit @mention or @team recipient.",
    { enabled_count: enabled.length },
  );
}
