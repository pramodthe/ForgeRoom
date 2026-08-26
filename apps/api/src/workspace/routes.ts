import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { streamSSE } from "hono/streaming";
import type { AgentChannelEnvelope, SafeJsonObject } from "@forgeroom/contracts";
import {
  channelArchiveCommandSchema,
  channelCreateCommandSchema,
  channelMessageCommandSchema,
  channelParticipantAddCommandSchema,
  channelParticipantRemoveCommandSchema,
  channelUpdateCommandSchema,
  coworkerDisableCommandSchema,
  coworkerUpdateCommandSchema,
} from "@forgeroom/contracts";
import { randomOpaqueId } from "../auth/crypto";
import type { AuthService } from "../auth/service";
import type { ApiEnv } from "../env";
import { errorResponse } from "../http";
import { requireMutationSession, requireParam, requireSession } from "../http-guards";
import type { WorkspaceService, WorkspaceServiceError } from "./service";

function fail(c: Context, error: WorkspaceServiceError) {
  const status =
    error.code === "not_found"
      ? 404
      : error.code === "forbidden"
        ? 403
        : error.code === "conflict"
          ? 409
          : 400;
  const failure = errorResponse(error.code, error.message, {
    status,
    details: ("details" in error ? error.details : undefined) as SafeJsonObject | undefined,
  });
  return c.json(failure.body, failure.status);
}

function okJson(c: Context, body: object, status: ContentfulStatusCode) {
  return c.json({ ...body, request_id: randomOpaqueId("req") }, status);
}

/** Strict decimal channel sequence cursor (rejects parseInt soft matches). */
function parseSequenceCursor(raw: string | undefined): { ok: true; value: number } | { ok: false } {
  if (raw === undefined || raw === "") {
    return { ok: true, value: -1 };
  }
  if (!/^(0|[1-9][0-9]*)$/.test(raw) && raw !== "-1") {
    return { ok: false };
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < -1 || value > 2_147_483_647) {
    return { ok: false };
  }
  return { ok: true, value };
}

export function mountWorkspaceRoutes(
  app: {
    get: (path: string, handler: (c: Context) => Response | Promise<Response>) => unknown;
    post: (path: string, handler: (c: Context) => Response | Promise<Response>) => unknown;
    patch: (path: string, handler: (c: Context) => Response | Promise<Response>) => unknown;
    delete: (path: string, handler: (c: Context) => Response | Promise<Response>) => unknown;
  },
  options: { env: ApiEnv; auth: AuthService; workspace: WorkspaceService },
) {
  const { env, auth, workspace } = options;

  app.post("/api/workspaces/:workspaceId/channels", async (c) => {
    const authed = await requireMutationSession(c, env, auth);
    if (authed instanceof Response) {
      return authed;
    }
    const workspaceId = requireParam(c, "workspaceId");
    if (workspaceId instanceof Response) {
      return workspaceId;
    }
    const parsed = channelCreateCommandSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      const failure = errorResponse("validation_failed", "Invalid channel create command.", {
        status: 400,
      });
      return c.json(failure.body, failure.status);
    }
    const result = await workspace.createChannel(authed.session, workspaceId, parsed.data);
    if (!result.ok) {
      return fail(c, result.error);
    }
    return okJson(c, result.value, 201);
  });

  app.get("/api/workspaces/:workspaceId/channels", async (c) => {
    const authed = await requireSession(c, env, auth);
    if (authed instanceof Response) {
      return authed;
    }
    const workspaceId = requireParam(c, "workspaceId");
    if (workspaceId instanceof Response) {
      return workspaceId;
    }
    const result = await workspace.listChannels(authed.session, workspaceId);
    if (!result.ok) {
      return fail(c, result.error);
    }
    return okJson(c, { channels: result.value }, 200);
  });

  app.get("/api/channels/:channelId", async (c) => {
    const authed = await requireSession(c, env, auth);
    if (authed instanceof Response) {
      return authed;
    }
    const channelId = requireParam(c, "channelId");
    if (channelId instanceof Response) {
      return channelId;
    }
    const result = await workspace.getChannel(authed.session, channelId);
    if (!result.ok) {
      return fail(c, result.error);
    }
    return okJson(c, result.value, 200);
  });

  app.patch("/api/channels/:channelId", async (c) => {
    const authed = await requireMutationSession(c, env, auth);
    if (authed instanceof Response) {
      return authed;
    }
    const channelId = requireParam(c, "channelId");
    if (channelId instanceof Response) {
      return channelId;
    }
    const parsed = channelUpdateCommandSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      const failure = errorResponse("validation_failed", "Invalid channel update command.", {
        status: 400,
      });
      return c.json(failure.body, failure.status);
    }
    const result = await workspace.updateChannel(authed.session, channelId, parsed.data);
    if (!result.ok) {
      return fail(c, result.error);
    }
    return okJson(c, result.value, 200);
  });

  app.post("/api/channels/:channelId/archive", async (c) => {
    const authed = await requireMutationSession(c, env, auth);
    if (authed instanceof Response) {
      return authed;
    }
    const channelId = requireParam(c, "channelId");
    if (channelId instanceof Response) {
      return channelId;
    }
    const parsed = channelArchiveCommandSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      const failure = errorResponse("validation_failed", "Invalid channel archive command.", {
        status: 400,
      });
      return c.json(failure.body, failure.status);
    }
    const result = await workspace.archiveChannel(authed.session, channelId, parsed.data);
    if (!result.ok) {
      return fail(c, result.error);
    }
    return okJson(c, result.value, 200);
  });

  app.post("/api/channels/:channelId/participants", async (c) => {
    const authed = await requireMutationSession(c, env, auth);
    if (authed instanceof Response) {
      return authed;
    }
    const channelId = requireParam(c, "channelId");
    if (channelId instanceof Response) {
      return channelId;
    }
    const parsed = channelParticipantAddCommandSchema.safeParse(
      await c.req.json().catch(() => null),
    );
    if (!parsed.success) {
      const failure = errorResponse("validation_failed", "Invalid participant add command.", {
        status: 400,
      });
      return c.json(failure.body, failure.status);
    }
    const result = await workspace.addParticipant(authed.session, channelId, {
      participant_type: parsed.data.participant_type,
      participant_id: parsed.data.participant_id,
      role: parsed.data.role,
      idempotency_key: parsed.data.idempotency_key,
    });
    if (!result.ok) {
      return fail(c, result.error);
    }
    return okJson(c, result.value, 200);
  });

  app.delete("/api/channels/:channelId/participants/:participantId", async (c) => {
    const authed = await requireMutationSession(c, env, auth);
    if (authed instanceof Response) {
      return authed;
    }
    const channelId = requireParam(c, "channelId");
    if (channelId instanceof Response) {
      return channelId;
    }
    const participantId = requireParam(c, "participantId");
    if (participantId instanceof Response) {
      return participantId;
    }
    const rawBody = await c.req.json().catch(() => null);
    if (rawBody === null) {
      const failure = errorResponse("validation_failed", "Invalid participant remove command.", {
        status: 400,
      });
      return c.json(failure.body, failure.status);
    }
    const parsed = channelParticipantRemoveCommandSchema.safeParse(rawBody);
    if (!parsed.success) {
      const failure = errorResponse("validation_failed", "Invalid participant remove command.", {
        status: 400,
      });
      return c.json(failure.body, failure.status);
    }
    const result = await workspace.removeParticipant(
      authed.session,
      channelId,
      participantId,
      parsed.data.idempotency_key,
    );
    if (!result.ok) {
      return fail(c, result.error);
    }
    return okJson(c, result.value, 200);
  });

  app.post("/api/channels/:channelId/messages", async (c) => {
    const authed = await requireMutationSession(c, env, auth);
    if (authed instanceof Response) {
      return authed;
    }
    const channelId = requireParam(c, "channelId");
    if (channelId instanceof Response) {
      return channelId;
    }
    const parsed = channelMessageCommandSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      const failure = errorResponse("validation_failed", "Invalid channel message command.", {
        status: 400,
      });
      return c.json(failure.body, failure.status);
    }
    const result = await workspace.postMessage(authed.session, channelId, parsed.data);
    if (!result.ok) {
      return fail(c, result.error);
    }
    return okJson(c, result.value, 201);
  });

  app.get("/api/channels/:channelId/events", async (c) => {
    const authed = await requireSession(c, env, auth);
    if (authed instanceof Response) {
      return authed;
    }
    const channelId = requireParam(c, "channelId");
    if (channelId instanceof Response) {
      return channelId;
    }
    const rawAfter = c.req.query("afterSequence");
    const parsedAfter = parseSequenceCursor(rawAfter);
    if (!parsedAfter.ok) {
      const failure = errorResponse(
        "validation_failed",
        "afterSequence must be a decimal integer greater than or equal to -1.",
        { status: 400 },
      );
      return c.json(failure.body, failure.status);
    }
    const afterSequence = parsedAfter.value;
    const result = await workspace.listEvents(authed.session, channelId, afterSequence);
    if (!result.ok) {
      return fail(c, result.error);
    }
    return okJson(c, result.value, 200);
  });

  app.get("/api/channels/:channelId/stream", async (c) => {
    const authed = await requireSession(c, env, auth);
    if (authed instanceof Response) {
      return authed;
    }
    const channelId = requireParam(c, "channelId");
    if (channelId instanceof Response) {
      return channelId;
    }

    const owned = await workspace.getChannel(authed.session, channelId);
    if (!owned.ok) {
      return fail(c, owned.error);
    }

    const headerLast = c.req.header("last-event-id");
    const queryAfter = c.req.query("afterSequence");
    const rawCursor = headerLast ?? queryAfter;
    const parsedCursor = parseSequenceCursor(rawCursor);
    if (!parsedCursor.ok) {
      const failure = errorResponse(
        "validation_failed",
        "Last-Event-ID / afterSequence must be a decimal integer channel sequence.",
        { status: 400 },
      );
      return c.json(failure.body, failure.status);
    }
    const afterSequence = parsedCursor.value;

    const HEARTBEAT_MS = 15_000;

    return streamSSE(c, async (stream) => {
      const sent = new Set<number>();
      let lastSent = afterSequence;
      let closed = false;
      let liveEnabled = false;
      const liveBuffer: AgentChannelEnvelope[] = [];

      const writeEnvelope = async (envelope: AgentChannelEnvelope) => {
        if (closed || sent.has(envelope.channelSequence)) {
          return;
        }
        if (envelope.channelSequence <= afterSequence) {
          return;
        }
        sent.add(envelope.channelSequence);
        lastSent = Math.max(lastSent, envelope.channelSequence);
        await stream.writeSSE({
          id: String(envelope.channelSequence),
          event: "channel_event",
          data: JSON.stringify(envelope),
        });
      };

      // Subscribe first so live events during replay are buffered, then catch up.
      const unsubscribe = workspace.subscribeChannelEvents(channelId, (envelope) => {
        // Dedupe only by sequence already delivered — never drop an earlier
        // not-yet-seen sequence if live publishes arrive out of order.
        if (sent.has(envelope.channelSequence) || envelope.channelSequence <= afterSequence) {
          return;
        }
        if (!liveEnabled) {
          liveBuffer.push(envelope);
          return;
        }
        void writeEnvelope(envelope).catch(() => {
          closed = true;
        });
      });

      try {
        const replay = await workspace.listEvents(authed.session, channelId, afterSequence);
        if (!replay.ok) {
          await stream.writeSSE({
            event: "error",
            data: JSON.stringify({ code: replay.error.code, message: replay.error.message }),
          });
          return;
        }
        for (const envelope of replay.value.events) {
          await writeEnvelope(envelope);
        }

        // Catch up any rows committed between replay query and subscribe attach.
        const catchUp = await workspace.listEvents(authed.session, channelId, lastSent);
        if (catchUp.ok) {
          for (const envelope of catchUp.value.events) {
            await writeEnvelope(envelope);
          }
        }

        liveEnabled = true;
        for (const buffered of liveBuffer
          .splice(0)
          .sort((a, b) => a.channelSequence - b.channelSequence)) {
          await writeEnvelope(buffered);
        }

        while (!closed && !stream.closed && !c.req.raw.signal.aborted) {
          await stream.writeSSE({
            event: "heartbeat",
            data: "{}",
          });
          await stream.sleep(HEARTBEAT_MS);
        }
      } finally {
        closed = true;
        unsubscribe();
      }
    });
  });

  app.get("/api/workspaces/:workspaceId/coworkers", async (c) => {
    const authed = await requireSession(c, env, auth);
    if (authed instanceof Response) {
      return authed;
    }
    const workspaceId = requireParam(c, "workspaceId");
    if (workspaceId instanceof Response) {
      return workspaceId;
    }
    const result = await workspace.listCoworkers(authed.session, workspaceId);
    if (!result.ok) {
      return fail(c, result.error);
    }
    return okJson(c, { coworkers: result.value }, 200);
  });

  app.get("/api/coworkers/:coworkerId", async (c) => {
    const authed = await requireSession(c, env, auth);
    if (authed instanceof Response) {
      return authed;
    }
    const coworkerId = requireParam(c, "coworkerId");
    if (coworkerId instanceof Response) {
      return coworkerId;
    }
    const result = await workspace.getCoworker(authed.session, coworkerId);
    if (!result.ok) {
      return fail(c, result.error);
    }
    return okJson(c, result.value, 200);
  });

  app.patch("/api/coworkers/:coworkerId", async (c) => {
    const authed = await requireMutationSession(c, env, auth);
    if (authed instanceof Response) {
      return authed;
    }
    const coworkerId = requireParam(c, "coworkerId");
    if (coworkerId instanceof Response) {
      return coworkerId;
    }
    const parsed = coworkerUpdateCommandSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      const failure = errorResponse("validation_failed", "Invalid coworker update command.", {
        status: 400,
      });
      return c.json(failure.body, failure.status);
    }
    const result = await workspace.updateCoworker(authed.session, coworkerId, parsed.data);
    if (!result.ok) {
      return fail(c, result.error);
    }
    return okJson(c, result.value, 200);
  });

  app.post("/api/coworkers/:coworkerId/disable", async (c) => {
    const authed = await requireMutationSession(c, env, auth);
    if (authed instanceof Response) {
      return authed;
    }
    const coworkerId = requireParam(c, "coworkerId");
    if (coworkerId instanceof Response) {
      return coworkerId;
    }
    const parsed = coworkerDisableCommandSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      const failure = errorResponse("validation_failed", "Invalid coworker disable command.", {
        status: 400,
      });
      return c.json(failure.body, failure.status);
    }
    const result = await workspace.disableCoworker(authed.session, coworkerId, parsed.data);
    if (!result.ok) {
      return fail(c, result.error);
    }
    return okJson(c, result.value, 200);
  });

  // Direct coworker create is intentionally absent; only CoworkerDraft (P0-213) provisions.
  app.post("/api/workspaces/:workspaceId/coworkers", async (c) => {
    const failure = errorResponse(
      "not_found",
      "Direct coworker creation is unavailable; use CoworkerDraft confirmation.",
      { status: 404 },
    );
    return c.json(failure.body, failure.status);
  });
}
