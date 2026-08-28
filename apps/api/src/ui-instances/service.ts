import type {
  ErrorCode,
  SessionResponse,
  UiInstanceReplayResponse,
  UiInteractionResult,
  UiInteractionTokenRequest,
} from "@forgeroom/contracts";
import {
  actionGrantSchema,
  uiInteractionResultSchema,
  uiInteractionTokenResponseSchema,
} from "@forgeroom/contracts";
import {
  commitUiInteraction,
  issueUiInteractionToken,
  loadUiInstanceReplayBundle,
  toUiInstanceReplayResponse,
  type createSql,
} from "@forgeroom/db";
import { randomOpaqueId } from "../auth/crypto";
import type { AuthService } from "../auth/service";
import type { WorkspaceService } from "../workspace/service";

type SqlClient = ReturnType<typeof createSql>;

export type UiInstanceServiceResult<T> =
  { ok: true; value: T } | { ok: false; error: { code: ErrorCode; message: string } };

export type UiInstanceService = {
  getReplay(
    session: SessionResponse,
    instanceId: string,
  ): Promise<UiInstanceServiceResult<{ replay: UiInstanceReplayResponse }>>;
  issueInteractionToken(
    session: SessionResponse,
    instanceId: string,
    request: UiInteractionTokenRequest,
    cookieValue?: string,
  ): Promise<
    UiInstanceServiceResult<{
      request_id: string;
      interactionId: string;
      state: "token_issued";
      interactionToken: string;
      expiresAt: string;
    }>
  >;
  commitInteraction(
    session: SessionResponse,
    instanceId: string,
    command: { interactionId: string; interactionToken: string },
  ): Promise<UiInstanceServiceResult<UiInteractionResult>>;
};

export function createUiInstanceService(options: {
  workspace: WorkspaceService;
  auth: AuthService;
  interactionTokenSecret: string;
  sql?: SqlClient;
}): UiInstanceService {
  const { workspace, auth, interactionTokenSecret, sql } = options;

  async function authorizeInstance(session: SessionResponse, instanceId: string) {
    if (!sql) {
      return {
        ok: false as const,
        error: {
          code: "provider_unavailable" as const,
          message: "UIInstance persistence requires SQL-backed storage.",
        },
      };
    }
    let bundle: Awaited<ReturnType<typeof loadUiInstanceReplayBundle>>;
    try {
      bundle = await loadUiInstanceReplayBundle(sql, instanceId);
    } catch (error) {
      console.error("ui_instance_authorization_load_failed", {
        instanceId,
        error: error instanceof Error ? error.message : "unknown database error",
      });
      return {
        ok: false as const,
        error: {
          code: "provider_unavailable" as const,
          message: "UIInstance persistence is temporarily unavailable.",
        },
      };
    }
    if (!bundle) {
      return {
        ok: false as const,
        error: { code: "not_found" as const, message: "UIInstance not found." },
      };
    }
    if (bundle.workspaceId !== session.workspace_id) {
      return {
        ok: false as const,
        error: { code: "forbidden" as const, message: "UIInstance is outside this workspace." },
      };
    }
    let channel: Awaited<ReturnType<WorkspaceService["getChannel"]>>;
    try {
      channel = await workspace.getChannel(session, bundle.channelId);
    } catch (error) {
      console.error("ui_instance_channel_authorization_failed", {
        instanceId,
        channelId: bundle.channelId,
        error: error instanceof Error ? error.message : "unknown channel store error",
      });
      return {
        ok: false as const,
        error: {
          code: "provider_unavailable" as const,
          message: "UIInstance channel authorization is temporarily unavailable.",
        },
      };
    }
    if (!channel.ok) {
      return {
        ok: false as const,
        error: { code: channel.error.code as ErrorCode, message: channel.error.message },
      };
    }
    return { ok: true as const, bundle };
  }

  return {
    async getReplay(session, instanceId) {
      if (!sql) {
        return {
          ok: false,
          error: {
            code: "provider_unavailable",
            message: "UIInstance replay requires SQL-backed persistence.",
          },
        };
      }

      let bundle: Awaited<ReturnType<typeof loadUiInstanceReplayBundle>>;
      try {
        bundle = await loadUiInstanceReplayBundle(sql, instanceId);
      } catch (error) {
        console.error("ui_instance_replay_load_failed", {
          instanceId,
          error: error instanceof Error ? error.message : "unknown database error",
        });
        return {
          ok: false,
          error: {
            code: "provider_unavailable",
            message: "UIInstance replay persistence is temporarily unavailable.",
          },
        };
      }
      if (!bundle) {
        return {
          ok: false,
          error: { code: "not_found", message: "UIInstance not found." },
        };
      }

      if (bundle.workspaceId !== session.workspace_id) {
        return {
          ok: false,
          error: { code: "forbidden", message: "UIInstance is outside this workspace." },
        };
      }

      let channel: Awaited<ReturnType<WorkspaceService["getChannel"]>>;
      try {
        channel = await workspace.getChannel(session, bundle.channelId);
      } catch (error) {
        console.error("ui_instance_replay_channel_authorization_failed", {
          instanceId,
          channelId: bundle.channelId,
          error: error instanceof Error ? error.message : "unknown channel store error",
        });
        return {
          ok: false,
          error: {
            code: "provider_unavailable",
            message: "UIInstance channel authorization is temporarily unavailable.",
          },
        };
      }
      if (!channel.ok) {
        return {
          ok: false,
          error: {
            code: channel.error.code,
            message: channel.error.message,
          },
        };
      }

      const requestId = randomOpaqueId("req");
      if (!bundle.renderGrant) {
        return {
          ok: false,
          error: {
            code: "validation_failed",
            message: "UIInstance replay is unavailable because its render grant is missing.",
          },
        };
      }
      let replay: UiInstanceReplayResponse;
      try {
        replay = toUiInstanceReplayResponse(bundle, requestId);
      } catch {
        return {
          ok: false,
          error: {
            code: "validation_failed",
            message: "UIInstance replay is unavailable because persisted state is invalid.",
          },
        };
      }
      return { ok: true, value: { replay } };
    },

    async issueInteractionToken(session, instanceId, request, cookieValue) {
      const authorized = await authorizeInstance(session, instanceId);
      if (!authorized.ok) {
        return authorized;
      }
      const disclosedGrant = authorized.bundle.actionGrants.find(
        (grant) => grant.id === request.actionGrantId,
      );
      let parsedGrant: ReturnType<typeof actionGrantSchema.safeParse> | null = null;
      if (disclosedGrant) {
        let grantBody: unknown = disclosedGrant.grant_body_redacted_json;
        if (typeof grantBody === "string") {
          try {
            grantBody = JSON.parse(grantBody);
          } catch {
            grantBody = null;
          }
        }
        parsedGrant = actionGrantSchema.safeParse(grantBody);
      }
      if (parsedGrant?.success && parsedGrant.data.requires_recent_auth) {
        const recent = await auth.assertRecentAuth(cookieValue);
        if (!recent.ok) {
          return {
            ok: false,
            error: { code: "forbidden", message: "Recent authentication required." },
          };
        }
      }
      if (!sql) {
        return {
          ok: false,
          error: {
            code: "provider_unavailable",
            message: "UIInstance persistence requires SQL-backed storage.",
          },
        };
      }
      try {
        const result = await issueUiInteractionToken(sql, {
          instanceId,
          workspaceId: session.workspace_id,
          actorUserId: session.user.id,
          request,
          interactionTokenSecret,
        });
        if (!result.ok) {
          return { ok: false, error: result.error };
        }
        const response = {
          request_id: randomOpaqueId("req"),
          interactionId: result.value.interactionId,
          state: "token_issued" as const,
          interactionToken: result.value.interactionToken,
          expiresAt: result.value.expiresAt,
        };
        return {
          ok: true,
          value: uiInteractionTokenResponseSchema.parse(response),
        };
      } catch (error) {
        console.error("ui_interaction_token_issue_failed", {
          instanceId,
          error: error instanceof Error ? error.message : "unknown database error",
        });
        return {
          ok: false,
          error: {
            code: "provider_unavailable",
            message: "Interaction token issuance is temporarily unavailable.",
          },
        };
      }
    },

    async commitInteraction(session, instanceId, command) {
      const authorized = await authorizeInstance(session, instanceId);
      if (!authorized.ok) {
        return authorized;
      }
      if (!sql) {
        return {
          ok: false,
          error: {
            code: "provider_unavailable",
            message: "UIInstance persistence requires SQL-backed storage.",
          },
        };
      }
      try {
        const result = await commitUiInteraction(sql, {
          instanceId,
          workspaceId: session.workspace_id,
          actorUserId: session.user.id,
          interactionId: command.interactionId,
          interactionToken: command.interactionToken,
        });
        if (!result.ok) {
          return { ok: false, error: result.error };
        }
        const response = uiInteractionResultSchema.parse({
          request_id: randomOpaqueId("req"),
          schemaVersion: 1 as const,
          interactionId: result.value.interactionId,
          state: result.value.state,
          result: result.value.result,
          resultRef: result.value.resultRef,
          renderRevision: result.value.renderRevision,
          stateRevision: result.value.stateRevision,
        });
        return { ok: true, value: response };
      } catch (error) {
        console.error("ui_interaction_commit_failed", {
          instanceId,
          interactionId: command.interactionId,
          error: error instanceof Error ? error.message : "unknown database error",
        });
        return {
          ok: false,
          error: {
            code: "provider_unavailable",
            message: "Interaction commit is temporarily unavailable.",
          },
        };
      }
    },
  };
}
