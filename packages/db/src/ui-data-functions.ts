import type postgres from "postgres";
import { dataGrantSchema } from "@forgeroom/contracts";
import { DataGrantLimitExceededError, loadRetainedDataGrantSnapshot } from "./retained-data-grants";
import { executeUiDataFunctionHandler } from "./ui-data-function-handlers";

type SqlClient = postgres.Sql;

function parseJson(value: unknown): unknown {
  if (typeof value !== "string") {
    return value;
  }
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

export type InvokeUiDataFunctionInput = {
  instanceId: string;
  workspaceId: string;
  actorUserId: string;
  functionName: string;
  renderRevision: number;
  dataGrantId: string;
  expectedManifestHash: string;
  arguments: Record<string, unknown>;
  now: string;
};

export type InvokeUiDataFunctionResult =
  | { ok: true; data: unknown }
  | {
      ok: false;
      code: "not_found" | "forbidden" | "validation_failed" | "ui_interaction_not_allowed";
      message: string;
    };

export async function invokeUiDataFunction(
  sql: SqlClient,
  input: InvokeUiDataFunctionInput,
): Promise<InvokeUiDataFunctionResult> {
  const instances = await sql<
    {
      workspace_id: string;
      channel_id: string;
      component_version_id: string;
      creator_agent_id: string;
      status: string;
      current_render_revision: number | null;
    }[]
  >`
    SELECT workspace_id, channel_id, component_version_id, creator_agent_id, status,
           current_render_revision
    FROM ui_instances
    WHERE id = ${input.instanceId}
    LIMIT 1
  `;
  const instance = instances[0];
  if (!instance) {
    return { ok: false, code: "not_found", message: "UIInstance not found." };
  }
  if (instance.workspace_id !== input.workspaceId) {
    return { ok: false, code: "forbidden", message: "UIInstance is outside this workspace." };
  }
  if (instance.status !== "ready" || instance.current_render_revision !== input.renderRevision) {
    return {
      ok: false,
      code: "ui_interaction_not_allowed",
      message: "UIInstance render revision is stale.",
    };
  }

  const revisions = await sql<{ manifest_hash: string | null }[]>`
    SELECT manifest_hash
    FROM ui_instance_revisions
    WHERE ui_instance_id = ${input.instanceId}
      AND revision_kind = 'render'
      AND revision = ${input.renderRevision}
      AND validation_state = 'valid'
      AND promoted_at IS NOT NULL
    LIMIT 1
  `;
  const manifestHash = revisions[0]?.manifest_hash;
  if (!manifestHash || manifestHash !== input.expectedManifestHash) {
    return {
      ok: false,
      code: "ui_interaction_not_allowed",
      message: "DataGrant binding is invalid.",
    };
  }

  const registryGrants = await sql<{ id: string }[]>`
    SELECT id
    FROM ui_data_function_grants
    WHERE component_version_id = ${instance.component_version_id}
      AND function_name = ${input.functionName}
      AND workspace_id = ${input.workspaceId}
      AND revoked_at IS NULL
      AND (channel_id IS NULL OR channel_id = ${instance.channel_id})
      AND (agent_profile_id IS NULL OR agent_profile_id = ${instance.creator_agent_id})
    LIMIT 1
  `;
  if (!registryGrants[0]) {
    return {
      ok: false,
      code: "ui_interaction_not_allowed",
      message: "Data-function grant is missing.",
    };
  }

  const dataGrants = await sql<{ data_ref: string | null; grant_body_redacted_json: unknown }[]>`
    SELECT data_ref, grant_body_redacted_json
    FROM ui_surface_grants
    WHERE id = ${input.dataGrantId}
      AND ui_instance_id = ${input.instanceId}
      AND grant_kind = 'data'
      AND revoked_at IS NULL
      AND expires_at > ${input.now}
    LIMIT 1
  `;
  const dataGrantRow = dataGrants[0];
  if (!dataGrantRow?.data_ref) {
    return {
      ok: false,
      code: "ui_interaction_not_allowed",
      message: "DataGrant is inactive.",
    };
  }
  const parsedDataGrant = dataGrantSchema.safeParse(
    parseJson(dataGrantRow.grant_body_redacted_json),
  );
  if (!parsedDataGrant.success) {
    return {
      ok: false,
      code: "ui_interaction_not_allowed",
      message: "DataGrant authority is invalid.",
    };
  }

  const startedAtMs = Date.now();
  const retained = await loadRetainedDataGrantSnapshot(sql, {
    uiInstanceId: input.instanceId,
    dataGrantId: input.dataGrantId,
    expectedRenderRevision: input.renderRevision,
    expectedManifestHash: input.expectedManifestHash,
    expectedDataRef: dataGrantRow.data_ref,
    now: input.now,
  });
  if (!retained.ok) {
    return {
      ok: false,
      code: retained.code === "not_found" ? "not_found" : "ui_interaction_not_allowed",
      message: retained.message,
    };
  }

  if (Date.now() - startedAtMs > retained.dataGrant.max_time_ms) {
    return {
      ok: false,
      code: "ui_interaction_not_allowed",
      message: "DataGrant time_ms limit exceeded.",
    };
  }

  if (retained.dataGrant.data_ref !== input.functionName) {
    return {
      ok: false,
      code: "ui_interaction_not_allowed",
      message: "DataGrant binding is invalid.",
    };
  }

  let data: unknown;
  try {
    data = executeUiDataFunctionHandler(input.functionName, {
      snapshot: retained.snapshot,
      dataGrant: retained.dataGrant,
      arguments: input.arguments,
      startedAtMs,
    });
  } catch (error) {
    if (error instanceof DataGrantLimitExceededError) {
      return {
        ok: false,
        code: "ui_interaction_not_allowed",
        message: `DataGrant ${error.limit} limit exceeded.`,
      };
    }
    throw error;
  }
  if (data === null) {
    return {
      ok: false,
      code: "ui_interaction_not_allowed",
      message: "Data-function handler is not registered.",
    };
  }

  void input.actorUserId;

  return { ok: true, data };
}
