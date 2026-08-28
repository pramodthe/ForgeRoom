import type { ErrorCode, SessionResponse, UiInstanceReplayResponse } from "@forgeroom/contracts";
import {
  loadUiInstanceReplayBundle,
  toUiInstanceReplayResponse,
  type createSql,
} from "@forgeroom/db";
import { randomOpaqueId } from "../auth/crypto";
import type { WorkspaceService } from "../workspace/service";

type SqlClient = ReturnType<typeof createSql>;

export type UiInstanceServiceResult<T> =
  { ok: true; value: T } | { ok: false; error: { code: ErrorCode; message: string } };

export type UiInstanceService = {
  getReplay(
    session: SessionResponse,
    instanceId: string,
  ): Promise<UiInstanceServiceResult<{ replay: UiInstanceReplayResponse }>>;
};

export function createUiInstanceService(options: {
  workspace: WorkspaceService;
  sql?: SqlClient;
}): UiInstanceService {
  const { workspace, sql } = options;

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
      } catch {
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

      const channel = await workspace.getChannel(session, bundle.channelId);
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
  };
}
