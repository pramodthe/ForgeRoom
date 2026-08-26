import type { Context } from "hono";
import type { SafeJsonObject } from "@forgeroom/contracts";
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
    return c.json(result.value, 201);
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
    return c.json({ channels: result.value }, 200);
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
    return c.json(result.value, 200);
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
    return c.json(result.value, 200);
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
    return c.json(result.value, 200);
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
    return c.json(result.value, 200);
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
    const parsed = channelParticipantRemoveCommandSchema.safeParse(
      await c.req.json().catch(() => ({
        schemaVersion: 1,
        idempotency_key: c.req.query("idempotency_key"),
      })),
    );
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
    return c.json(result.value, 200);
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
    return c.json(result.value, 201);
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
    return c.json({ coworkers: result.value }, 200);
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
    return c.json(result.value, 200);
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
    return c.json(result.value, 200);
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
    return c.json(result.value, 200);
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
