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
  channelPinCreateCommandSchema,
  channelPinRemoveCommandSchema,
  channelUpdateCommandSchema,
  coworkerDisableCommandSchema,
  coworkerDraftConfirmCommandSchema,
  coworkerDraftCreateCommandSchema,
  coworkerDraftRejectCommandSchema,
  coworkerDraftReviseCommandSchema,
  coworkerUpdateCommandSchema,
  taskCreateCommandSchema,
  taskUpdateCommandSchema,
  runCancelCommandSchema,
  skillDraftCreateCommandSchema,
  skillDraftPublishCommandSchema,
  skillBindingCreateCommandSchema,
  skillBindingDeleteCommandSchema,
} from "@forgeroom/contracts";
import { randomOpaqueId } from "../auth/crypto";
import type { AuthService } from "../auth/service";
import type { ApiEnv } from "../env";
import { errorResponse } from "../http";
import {
  readSessionCookie,
  requireMutationSession,
  requireParam,
  requireSession,
} from "../http-guards";
import { drainThroughSequence } from "./event-stream";
import type { WorkspaceService, WorkspaceServiceError } from "./service";

function fail(c: Context, error: WorkspaceServiceError) {
  const status =
    error.code === "not_found"
      ? 404
      : error.code === "forbidden"
        ? 403
        : error.code === "provider_unavailable"
          ? 503
          : error.code === "conflict"
            ? 409
            : error.code === "stale_task_revision" || error.code === "task_transition_not_allowed"
              ? 409
              : error.code === "stale_coworker_draft" ||
                  error.code === "expired_proposal" ||
                  error.code === "coworker_provisioning_failed"
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

  app.get("/api/channels/:channelId/roster", async (c) => {
    const authed = await requireSession(c, env, auth);
    if (authed instanceof Response) {
      return authed;
    }
    const channelId = requireParam(c, "channelId");
    if (channelId instanceof Response) {
      return channelId;
    }
    const result = await workspace.listChannelRoster(authed.session, channelId);
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

  app.get("/api/channels/:channelId/messages", async (c) => {
    const authed = await requireSession(c, env, auth);
    if (authed instanceof Response) {
      return authed;
    }
    const channelId = requireParam(c, "channelId");
    if (channelId instanceof Response) {
      return channelId;
    }
    const result = await workspace.listMessages(authed.session, channelId);
    if (!result.ok) {
      return fail(c, result.error);
    }
    return okJson(c, result.value, 200);
  });

  app.get("/api/channels/:channelId/pins", async (c) => {
    const authed = await requireSession(c, env, auth);
    if (authed instanceof Response) {
      return authed;
    }
    const channelId = requireParam(c, "channelId");
    if (channelId instanceof Response) {
      return channelId;
    }
    const result = await workspace.listPins(authed.session, channelId);
    if (!result.ok) {
      return fail(c, result.error);
    }
    return okJson(c, result.value, 200);
  });

  app.post("/api/channels/:channelId/pins", async (c) => {
    const authed = await requireMutationSession(c, env, auth);
    if (authed instanceof Response) {
      return authed;
    }
    const channelId = requireParam(c, "channelId");
    if (channelId instanceof Response) {
      return channelId;
    }
    const parsed = channelPinCreateCommandSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      const failure = errorResponse("validation_failed", "Invalid channel pin create command.", {
        status: 400,
      });
      return c.json(failure.body, failure.status);
    }
    const result = await workspace.createPin(authed.session, channelId, parsed.data);
    if (!result.ok) {
      return fail(c, result.error);
    }
    return okJson(c, result.value, 201);
  });

  app.delete("/api/channels/:channelId/pins/:pinId", async (c) => {
    const authed = await requireMutationSession(c, env, auth);
    if (authed instanceof Response) {
      return authed;
    }
    const channelId = requireParam(c, "channelId");
    if (channelId instanceof Response) {
      return channelId;
    }
    const pinId = requireParam(c, "pinId");
    if (pinId instanceof Response) {
      return pinId;
    }
    const parsed = channelPinRemoveCommandSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      const failure = errorResponse("validation_failed", "Invalid channel pin remove command.", {
        status: 400,
      });
      return c.json(failure.body, failure.status);
    }
    const result = await workspace.removePin(authed.session, channelId, pinId, parsed.data);
    if (!result.ok) {
      return fail(c, result.error);
    }
    return okJson(c, result.value, 200);
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

    const HEARTBEAT_MS = env.nodeEnv === "test" ? 250 : 15_000;
    const AUTH_RECHECK_MS = env.nodeEnv === "test" ? 150 : 30_000;
    const DB_POLL_MS = env.nodeEnv === "test" ? 100 : 2_000;
    const cookieValue = readSessionCookie(c, env);

    return streamSSE(c, async (stream) => {
      let lastSent = afterSequence;
      let closed = false;
      let liveEnabled = false;
      const pending = new Map<number, AgentChannelEnvelope>();
      let writeChain: Promise<void> = Promise.resolve();

      const enqueueWrite = (task: () => Promise<void>, options?: { force?: boolean }) => {
        writeChain = writeChain
          .then(async () => {
            if (closed && !options?.force) return;
            await task();
          })
          .catch(() => {
            closed = true;
          });
        return writeChain;
      };

      const emitEnvelope = async (envelope: AgentChannelEnvelope) => {
        await stream.writeSSE({
          id: String(envelope.channelSequence),
          event: "channel_event",
          data: JSON.stringify(envelope),
        });
      };

      /** Buffer a valid envelope, then emit contiguous pending from lastSent+1. */
      const bufferEnvelope = async (envelope: AgentChannelEnvelope) => {
        if (closed || envelope.channelSequence <= lastSent) {
          return;
        }
        pending.set(envelope.channelSequence, envelope);
        while (!closed && pending.has(lastSent + 1)) {
          const next = pending.get(lastSent + 1)!;
          pending.delete(lastSent + 1);
          lastSent = next.channelSequence;
          await emitEnvelope(next);
        }
      };

      /**
       * After observing DB through `throughSequence`, emit pending envelopes and
       * skip any sequences with no valid envelope so gaps cannot stall the stream.
       */
      const observeThrough = async (throughSequence: number) => {
        if (closed || throughSequence <= lastSent) {
          return;
        }
        const drained = drainThroughSequence(lastSent, throughSequence, pending);
        lastSent = drained.lastSent;
        for (const envelope of drained.toEmit) {
          if (closed) return;
          await emitEnvelope(envelope);
        }
      };

      const applyEventPage = async (page: {
        events: AgentChannelEnvelope[];
        next_after_sequence: number;
      }) => {
        for (const envelope of page.events) {
          if (closed) return;
          if (envelope.channelSequence <= lastSent) continue;
          pending.set(envelope.channelSequence, envelope);
        }
        await observeThrough(page.next_after_sequence);
      };

      const queueEnvelope = (envelope: AgentChannelEnvelope) => {
        void enqueueWrite(() => bufferEnvelope(envelope));
      };

      const unsubscribe = workspace.subscribeChannelEvents(channelId, (envelope) => {
        if (envelope.channelSequence <= afterSequence) {
          return;
        }
        if (!liveEnabled) {
          if (envelope.channelSequence > lastSent) {
            pending.set(envelope.channelSequence, envelope);
          }
          return;
        }
        queueEnvelope(envelope);
      });

      /** Must only be called from inside the write chain (never await enqueueWrite here). */
      const pollFromDb = async (): Promise<
        { ok: true } | { ok: false; code: string; message: string }
      > => {
        let cursor = lastSent;
        for (;;) {
          const page = await workspace.listEvents(authed.session, channelId, cursor, {
            limit: 200,
          });
          if (!page.ok) {
            return {
              ok: false,
              code: page.error.code,
              message: page.error.message,
            };
          }
          await applyEventPage(page.value);
          cursor = page.value.next_after_sequence;
          if (!page.value.has_more) {
            return { ok: true };
          }
        }
      };

      try {
        // Replay pages until caught up (bounded pages).
        let cursor = afterSequence;
        for (;;) {
          const replay = await workspace.listEvents(authed.session, channelId, cursor);
          if (!replay.ok) {
            await enqueueWrite(async () => {
              await stream.writeSSE({
                event: "error",
                data: JSON.stringify({
                  code: replay.error.code,
                  message: replay.error.message,
                }),
              });
            });
            await writeChain;
            return;
          }
          await enqueueWrite(async () => {
            await applyEventPage(replay.value);
          });
          await writeChain;
          cursor = replay.value.next_after_sequence;
          if (!replay.value.has_more) {
            break;
          }
        }

        // Catch-up after subscribe attach.
        await enqueueWrite(async () => {
          const polled = await pollFromDb();
          if (!polled.ok) {
            closed = true;
            await stream.writeSSE({
              event: "error",
              data: JSON.stringify({ code: polled.code, message: polled.message }),
            });
            return;
          }
          // Flush hub-buffered envelopes that arrived during replay (no DB through-cursor).
          const buffered = [...pending.entries()]
            .sort((a, b) => a[0] - b[0])
            .map(([, envelope]) => envelope);
          for (const envelope of buffered) {
            await bufferEnvelope(envelope);
          }
        });
        await writeChain;
        if (closed) {
          return;
        }
        liveEnabled = true;

        let lastAuthCheck = Date.now();
        let lastDbPoll = Date.now();
        while (!closed && !stream.closed && !c.req.raw.signal.aborted) {
          const nowMs = Date.now();
          if (nowMs - lastAuthCheck >= AUTH_RECHECK_MS) {
            lastAuthCheck = nowMs;
            const session = await auth.readSession(cookieValue);
            if (!session) {
              await enqueueWrite(
                async () => {
                  await stream.writeSSE({
                    event: "error",
                    data: JSON.stringify({
                      code: "unauthenticated",
                      message: "Session expired or revoked.",
                    }),
                  });
                },
                { force: true },
              );
              await writeChain;
              closed = true;
              break;
            }
            const ownedNow = await workspace.getChannel(session, channelId);
            if (!ownedNow.ok) {
              await enqueueWrite(
                async () => {
                  await stream.writeSSE({
                    event: "error",
                    data: JSON.stringify({
                      code: ownedNow.error.code,
                      message: ownedNow.error.message,
                    }),
                  });
                },
                { force: true },
              );
              await writeChain;
              closed = true;
              break;
            }
          }

          if (nowMs - lastDbPoll >= DB_POLL_MS) {
            lastDbPoll = nowMs;
            await enqueueWrite(async () => {
              const polled = await pollFromDb();
              if (!polled.ok) {
                closed = true;
                // Write error inline — do not await enqueueWrite (would deadlock).
                await stream.writeSSE({
                  event: "error",
                  data: JSON.stringify({ code: polled.code, message: polled.message }),
                });
              }
            });
            await writeChain;
            if (closed) {
              break;
            }
          }

          await enqueueWrite(async () => {
            await stream.writeSSE({
              event: "heartbeat",
              data: "{}",
            });
          });
          await writeChain;
          await stream.sleep(Math.min(HEARTBEAT_MS, DB_POLL_MS));
        }
      } finally {
        closed = true;
        unsubscribe();
        await writeChain.catch(() => undefined);
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

  app.post("/api/workspaces/:workspaceId/coworker-drafts", async (c) => {
    const authed = await requireMutationSession(c, env, auth);
    if (authed instanceof Response) return authed;
    const workspaceId = requireParam(c, "workspaceId");
    if (workspaceId instanceof Response) return workspaceId;
    const parsed = coworkerDraftCreateCommandSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      const failure = errorResponse("validation_failed", "Invalid coworker draft create command.", {
        status: 400,
      });
      return c.json(failure.body, failure.status);
    }
    const result = await workspace.createCoworkerDraft(authed.session, workspaceId, parsed.data);
    if (!result.ok) return fail(c, result.error);
    return okJson(c, { draft: result.value }, 201);
  });

  app.get("/api/coworker-drafts/:draftId", async (c) => {
    const authed = await requireSession(c, env, auth);
    if (authed instanceof Response) return authed;
    const draftId = requireParam(c, "draftId");
    if (draftId instanceof Response) return draftId;
    const result = await workspace.getCoworkerDraft(authed.session, draftId);
    if (!result.ok) return fail(c, result.error);
    return okJson(c, { draft: result.value }, 200);
  });

  app.post("/api/coworker-drafts/:draftId/revise", async (c) => {
    const authed = await requireMutationSession(c, env, auth);
    if (authed instanceof Response) return authed;
    const draftId = requireParam(c, "draftId");
    if (draftId instanceof Response) return draftId;
    const parsed = coworkerDraftReviseCommandSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      const failure = errorResponse("validation_failed", "Invalid coworker draft revise command.", {
        status: 400,
      });
      return c.json(failure.body, failure.status);
    }
    const result = await workspace.reviseCoworkerDraft(authed.session, draftId, parsed.data);
    if (!result.ok) return fail(c, result.error);
    return okJson(c, { draft: result.value }, 200);
  });

  app.post("/api/coworker-drafts/:draftId/confirm", async (c) => {
    const authed = await requireMutationSession(c, env, auth);
    if (authed instanceof Response) return authed;
    const draftId = requireParam(c, "draftId");
    if (draftId instanceof Response) return draftId;
    const parsed = coworkerDraftConfirmCommandSchema.safeParse(
      await c.req.json().catch(() => null),
    );
    if (!parsed.success) {
      const failure = errorResponse(
        "validation_failed",
        "Invalid coworker draft confirm command.",
        {
          status: 400,
        },
      );
      return c.json(failure.body, failure.status);
    }
    const result = await workspace.confirmCoworkerDraft(authed.session, draftId, parsed.data);
    if (!result.ok) return fail(c, result.error);
    return okJson(c, result.value, 200);
  });

  app.post("/api/coworker-drafts/:draftId/reject", async (c) => {
    const authed = await requireMutationSession(c, env, auth);
    if (authed instanceof Response) return authed;
    const draftId = requireParam(c, "draftId");
    if (draftId instanceof Response) return draftId;
    const parsed = coworkerDraftRejectCommandSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      const failure = errorResponse("validation_failed", "Invalid coworker draft reject command.", {
        status: 400,
      });
      return c.json(failure.body, failure.status);
    }
    const result = await workspace.rejectCoworkerDraft(authed.session, draftId, parsed.data);
    if (!result.ok) return fail(c, result.error);
    return okJson(c, { draft: result.value }, 200);
  });

  app.post("/api/channels/:channelId/tasks", async (c) => {
    const authed = await requireMutationSession(c, env, auth);
    if (authed instanceof Response) return authed;
    const channelId = requireParam(c, "channelId");
    if (channelId instanceof Response) return channelId;
    const parsed = taskCreateCommandSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      const failure = errorResponse("validation_failed", "Invalid task create command.", {
        status: 400,
      });
      return c.json(failure.body, failure.status);
    }
    const result = await workspace.createTask(authed.session, channelId, parsed.data);
    if (!result.ok) return fail(c, result.error);
    return okJson(c, { task: result.value }, 201);
  });

  app.get("/api/channels/:channelId/tasks", async (c) => {
    const authed = await requireSession(c, env, auth);
    if (authed instanceof Response) return authed;
    const channelId = requireParam(c, "channelId");
    if (channelId instanceof Response) return channelId;
    const result = await workspace.listTasks(authed.session, channelId);
    if (!result.ok) return fail(c, result.error);
    return okJson(c, { tasks: result.value }, 200);
  });

  app.get("/api/tasks/:taskId", async (c) => {
    const authed = await requireSession(c, env, auth);
    if (authed instanceof Response) return authed;
    const taskId = requireParam(c, "taskId");
    if (taskId instanceof Response) return taskId;
    const result = await workspace.getTask(authed.session, taskId);
    if (!result.ok) return fail(c, result.error);
    return okJson(c, { task: result.value }, 200);
  });

  app.patch("/api/tasks/:taskId", async (c) => {
    const authed = await requireMutationSession(c, env, auth);
    if (authed instanceof Response) return authed;
    const taskId = requireParam(c, "taskId");
    if (taskId instanceof Response) return taskId;
    const parsed = taskUpdateCommandSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      const failure = errorResponse("validation_failed", "Invalid task update command.", {
        status: 400,
      });
      return c.json(failure.body, failure.status);
    }
    const result = await workspace.updateTask(authed.session, taskId, parsed.data);
    if (!result.ok) return fail(c, result.error);
    return okJson(c, { task: result.value }, 200);
  });

  app.get("/api/tasks/:taskId/history", async (c) => {
    const authed = await requireSession(c, env, auth);
    if (authed instanceof Response) return authed;
    const taskId = requireParam(c, "taskId");
    if (taskId instanceof Response) return taskId;
    const result = await workspace.listTaskHistory(authed.session, taskId);
    if (!result.ok) return fail(c, result.error);
    return okJson(c, { revisions: result.value }, 200);
  });

  app.get("/api/runs/:runId", async (c) => {
    const authed = await requireSession(c, env, auth);
    if (authed instanceof Response) {
      return authed;
    }
    const runId = requireParam(c, "runId");
    if (runId instanceof Response) {
      return runId;
    }
    const result = await workspace.getRun(authed.session, runId);
    if (!result.ok) {
      return fail(c, result.error);
    }
    return okJson(c, result.value, 200);
  });

  app.get("/api/runs/:runId/receipt", async (c) => {
    const authed = await requireSession(c, env, auth);
    if (authed instanceof Response) {
      return authed;
    }
    const runId = requireParam(c, "runId");
    if (runId instanceof Response) {
      return runId;
    }
    const result = await workspace.getRunReceipt(authed.session, runId);
    if (!result.ok) {
      return fail(c, result.error);
    }
    return okJson(c, result.value, 200);
  });

  app.post("/api/runs/:runId/cancel", async (c) => {
    const authed = await requireMutationSession(c, env, auth);
    if (authed instanceof Response) {
      return authed;
    }
    const runId = requireParam(c, "runId");
    if (runId instanceof Response) {
      return runId;
    }
    const body = (await c.req.json().catch(() => ({}))) as unknown;
    const parsed = runCancelCommandSchema.safeParse(body);
    if (!parsed.success) {
      const failure = errorResponse("validation_failed", "Invalid run cancel command.", {
        status: 400,
      });
      return c.json(failure.body, failure.status);
    }
    const result = await workspace.cancelRun(authed.session, runId, parsed.data);
    if (!result.ok) {
      return fail(c, result.error);
    }
    return okJson(c, result.value, 200);
  });

  app.post("/api/runs/:runId/steer", async (c) => {
    const authed = await requireMutationSession(c, env, auth);
    if (authed instanceof Response) {
      return authed;
    }
    const runId = requireParam(c, "runId");
    if (runId instanceof Response) {
      return runId;
    }
    const body = (await c.req.json().catch(() => ({}))) as {
      prior_run_step_id?: string;
      channel_agent_session_id?: string;
      content?: string;
      bound_session_generation_id?: string;
    };
    if (!body.prior_run_step_id || !body.channel_agent_session_id || !body.content?.trim()) {
      const failure = errorResponse(
        "validation_failed",
        "prior_run_step_id, channel_agent_session_id, and content are required.",
        { status: 400 },
      );
      return c.json(failure.body, failure.status);
    }
    const result = await workspace.steerCorrection(authed.session, runId, {
      priorRunStepId: body.prior_run_step_id,
      channelAgentSessionId: body.channel_agent_session_id,
      content: body.content,
      boundSessionGenerationId: body.bound_session_generation_id ?? null,
    });
    if (!result.ok) {
      return fail(c, result.error);
    }
    return okJson(c, result.value, 201);
  });

  app.post("/api/runs/:runId/skill-drafts", async (c) => {
    const authed = await requireMutationSession(c, env, auth);
    if (authed instanceof Response) {
      return authed;
    }
    const runId = requireParam(c, "runId");
    if (runId instanceof Response) {
      return runId;
    }
    const parsed = skillDraftCreateCommandSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      const failure = errorResponse("validation_failed", "Invalid skill draft create command.", {
        status: 400,
      });
      return c.json(failure.body, failure.status);
    }
    const result = await workspace.createSkillDraft(authed.session, runId, parsed.data);
    if (!result.ok) {
      return fail(c, result.error);
    }
    return okJson(c, { draft: result.value }, 201);
  });

  app.get("/api/skill-drafts/:draftId", async (c) => {
    const authed = await requireSession(c, env, auth);
    if (authed instanceof Response) {
      return authed;
    }
    const draftId = requireParam(c, "draftId");
    if (draftId instanceof Response) {
      return draftId;
    }
    const result = await workspace.getSkillDraft(authed.session, draftId);
    if (!result.ok) {
      return fail(c, result.error);
    }
    return okJson(c, { draft: result.value }, 200);
  });

  app.get("/api/workspaces/:workspaceId/skills", async (c) => {
    const authed = await requireSession(c, env, auth);
    if (authed instanceof Response) {
      return authed;
    }
    const workspaceId = requireParam(c, "workspaceId");
    if (workspaceId instanceof Response) {
      return workspaceId;
    }
    const result = await workspace.listWorkspaceSkills(authed.session, workspaceId);
    if (!result.ok) {
      return fail(c, result.error);
    }
    return okJson(c, result.value, 200);
  });

  app.get("/api/skills/:skillId", async (c) => {
    const authed = await requireSession(c, env, auth);
    if (authed instanceof Response) {
      return authed;
    }
    const skillId = requireParam(c, "skillId");
    if (skillId instanceof Response) {
      return skillId;
    }
    const draftResult = await workspace.getSkillDraftBySkill(authed.session, skillId);
    const versionResult = await workspace.getSkillVersionBySkill(authed.session, skillId);
    if (!draftResult.ok && !versionResult.ok) {
      return fail(c, { code: "not_found", message: "Skill not found." });
    }
    return okJson(
      c,
      {
        draft: draftResult.ok ? draftResult.value : null,
        version: versionResult.ok ? versionResult.value : null,
      },
      200,
    );
  });

  app.post("/api/skill-drafts/:draftId/publish", async (c) => {
    const authed = await requireMutationSession(c, env, auth);
    if (authed instanceof Response) {
      return authed;
    }
    const draftId = requireParam(c, "draftId");
    if (draftId instanceof Response) {
      return draftId;
    }
    const parsed = skillDraftPublishCommandSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      const failure = errorResponse("validation_failed", "Invalid skill draft publish command.", {
        status: 400,
      });
      return c.json(failure.body, failure.status);
    }
    const result = await workspace.publishSkillDraft(authed.session, draftId, parsed.data);
    if (!result.ok) {
      return fail(c, result.error);
    }
    return okJson(c, { version: result.value }, 200);
  });

  app.post("/api/coworkers/:coworkerId/skill-bindings", async (c) => {
    const authed = await requireMutationSession(c, env, auth);
    if (authed instanceof Response) {
      return authed;
    }
    const coworkerId = requireParam(c, "coworkerId");
    if (coworkerId instanceof Response) {
      return coworkerId;
    }
    const parsed = skillBindingCreateCommandSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      const failure = errorResponse("validation_failed", "Invalid skill binding create command.", {
        status: 400,
      });
      return c.json(failure.body, failure.status);
    }
    const result = await workspace.createSkillBinding(authed.session, coworkerId, parsed.data);
    if (!result.ok) {
      return fail(c, result.error);
    }
    return okJson(c, { binding: result.value }, 201);
  });

  app.delete("/api/coworkers/:coworkerId/skill-bindings/:bindingId", async (c) => {
    const authed = await requireMutationSession(c, env, auth);
    if (authed instanceof Response) {
      return authed;
    }
    const coworkerId = requireParam(c, "coworkerId");
    if (coworkerId instanceof Response) {
      return coworkerId;
    }
    const bindingId = requireParam(c, "bindingId");
    if (bindingId instanceof Response) {
      return bindingId;
    }
    const parsed = skillBindingDeleteCommandSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      const failure = errorResponse("validation_failed", "Invalid skill binding delete command.", {
        status: 400,
      });
      return c.json(failure.body, failure.status);
    }
    const result = await workspace.deleteSkillBinding(
      authed.session,
      coworkerId,
      bindingId,
      parsed.data,
    );
    if (!result.ok) {
      return fail(c, result.error);
    }
    return okJson(c, { binding: result.value }, 200);
  });
}
