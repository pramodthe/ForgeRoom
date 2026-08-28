import { createHash } from "node:crypto";
import { componentGrantCommandSchema, type SessionResponse } from "@forgeroom/contracts";
import {
  applyComponentGrantChange,
  hasActiveComponentGrant,
  publishWorkspaceRegistry,
  type createSql,
  type PublishedComponentVersion,
} from "@forgeroom/db";
import {
  canOfferToCoworker,
  getRegistryDefinition,
  P0_CONTROLLED_REGISTRY,
} from "@forgeroom/domain";
import type { WorkspaceService, WorkspaceServiceResult } from "../workspace/service";

export type ComponentVersionDisclosure = {
  id: string;
  stable_name: string;
  semantic_version: string;
  kind: string;
  exposure: "agent_tool" | "server_only";
  confirmation_policy: "none" | "trusted_host";
  model_description: string;
  renderer_key: string;
  descriptor_hash: string;
  offerable: boolean;
};

export type CoworkerComponentGrantDisclosure = ComponentVersionDisclosure & {
  granted: boolean;
};

type SqlClient = ReturnType<typeof createSql>;

export type CoworkerComponentGrantCommand = {
  granted: boolean;
  expected_component_version: string;
  expected_descriptor_hash: string;
  idempotency_key: string;
};

export function parseCoworkerComponentGrantCommand(
  input: unknown,
): { ok: true; value: CoworkerComponentGrantCommand } | { ok: false } {
  if (!input || typeof input !== "object") {
    return { ok: false };
  }
  const record = input as Record<string, unknown>;
  const parsed = componentGrantCommandSchema.safeParse({
    granted: record.granted,
    expected_component_version: record.expected_component_version,
    expected_descriptor_hash: record.expected_descriptor_hash,
  });
  if (!parsed.success) {
    return { ok: false };
  }
  if (
    typeof record.idempotency_key !== "string" ||
    record.idempotency_key.length < 1 ||
    record.idempotency_key.length > 128
  ) {
    return { ok: false };
  }
  return {
    ok: true,
    value: {
      ...parsed.data,
      idempotency_key: record.idempotency_key,
    },
  };
}

function idempotencyKeyHash(key: string): string {
  return `sha256:${createHash("sha256").update(key).digest("hex")}`;
}

function parseAuditPayload(payload: unknown): Record<string, unknown> | null {
  if (!payload || typeof payload !== "object") {
    if (typeof payload === "string") {
      try {
        const parsed = JSON.parse(payload) as unknown;
        return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
      } catch {
        return null;
      }
    }
    return null;
  }
  return payload as Record<string, unknown>;
}

function componentFromAuditPayload(
  payload: Record<string, unknown>,
): ComponentVersionDisclosure | null {
  const component = payload.component;
  if (!component || typeof component !== "object") {
    return null;
  }
  const row = component as Record<string, unknown>;
  if (
    typeof row.id !== "string" ||
    typeof row.stable_name !== "string" ||
    typeof row.semantic_version !== "string" ||
    typeof row.kind !== "string" ||
    typeof row.exposure !== "string" ||
    typeof row.confirmation_policy !== "string" ||
    typeof row.model_description !== "string" ||
    typeof row.renderer_key !== "string" ||
    typeof row.descriptor_hash !== "string" ||
    typeof row.offerable !== "boolean"
  ) {
    return null;
  }
  return row as ComponentVersionDisclosure;
}
function toRegistryDefinitions() {
  return P0_CONTROLLED_REGISTRY.map((definition) => ({
    stableName: definition.name,
    kind: definition.kind,
    semanticVersion: definition.version,
    exposure: definition.exposure,
    confirmationPolicy: definition.confirmation,
    modelDescription: definition.modelDescription,
    argumentSchema: definition.parameterSchema as Record<string, unknown>,
    rendererKey: definition.rendererKey,
    previewProps: definition.previewProps as Record<string, unknown>,
    declaredDataFunctions: definition.declaredDataFunctions,
    declaredInteractionIntents: definition.declaredInteractionIntents,
    descriptorHash: definition.descriptorHash,
  }));
}

function discloseVersion(row: PublishedComponentVersion): ComponentVersionDisclosure | null {
  const definition = getRegistryDefinition(row.stableName);
  if (!definition) {
    return null;
  }
  return {
    id: row.id,
    stable_name: row.stableName,
    semantic_version: row.semanticVersion,
    kind: definition.kind,
    exposure: row.exposure,
    confirmation_policy: definition.confirmation,
    model_description: definition.modelDescription,
    renderer_key: definition.rendererKey,
    descriptor_hash: row.descriptorHash,
    offerable: canOfferToCoworker(definition),
  };
}

async function ensurePublished(sql: SqlClient, workspaceId: string, userId: string) {
  return publishWorkspaceRegistry(sql, {
    workspaceId,
    publishedByUserId: userId,
    definitions: toRegistryDefinitions(),
  });
}

export function createComponentService(options: {
  sql?: SqlClient;
  workspace: WorkspaceService;
  rotateGrantSessions?: (input: {
    workspaceId: string;
    coworkerId: string;
    sessionIds: readonly string[];
    createdBy: string;
    granted: boolean;
  }) => Promise<void>;
}) {
  const { sql, workspace, rotateGrantSessions } = options;

  return {
    async listWorkspaceComponents(
      session: SessionResponse,
      workspaceId: string,
    ): Promise<WorkspaceServiceResult<{ components: ComponentVersionDisclosure[] }>> {
      if (!sql) {
        return {
          ok: false,
          error: {
            code: "validation_failed",
            message: "Component registry requires SQL-backed persistence.",
          },
        };
      }
      const coworkers = await workspace.listCoworkers(session, workspaceId);
      if (!coworkers.ok) {
        return coworkers;
      }
      const published = await ensurePublished(sql, workspaceId, session.user.id);
      const components = published
        .map(discloseVersion)
        .filter((row): row is ComponentVersionDisclosure => row !== null)
        .sort((a, b) => a.stable_name.localeCompare(b.stable_name));
      return { ok: true, value: { components } };
    },

    async listCoworkerComponentGrants(
      session: SessionResponse,
      coworkerId: string,
    ): Promise<WorkspaceServiceResult<{ components: CoworkerComponentGrantDisclosure[] }>> {
      if (!sql) {
        return {
          ok: false,
          error: {
            code: "validation_failed",
            message: "Component registry requires SQL-backed persistence.",
          },
        };
      }
      const coworker = await workspace.getCoworker(session, coworkerId);
      if (!coworker.ok) {
        return coworker;
      }
      const workspaceId = coworker.value.workspace_id;
      const published = await ensurePublished(sql, workspaceId, session.user.id);
      const components: CoworkerComponentGrantDisclosure[] = [];
      for (const row of published) {
        const disclosed = discloseVersion(row);
        if (!disclosed) {
          continue;
        }
        const granted =
          disclosed.exposure === "agent_tool" &&
          (await hasActiveComponentGrant(sql, {
            componentVersionId: row.id,
            workspaceId,
            agentProfileId: coworkerId,
          }));
        components.push({ ...disclosed, granted });
      }
      components.sort((a, b) => a.stable_name.localeCompare(b.stable_name));
      return { ok: true, value: { components } };
    },

    async setCoworkerComponentGrant(
      session: SessionResponse,
      coworkerId: string,
      command: CoworkerComponentGrantCommand,
    ): Promise<
      WorkspaceServiceResult<{
        grant_id: string;
        action: "granted" | "revoked" | "noop";
        component: ComponentVersionDisclosure;
        session_rotations: string[];
      }>
    > {
      if (!sql) {
        return {
          ok: false,
          error: {
            code: "validation_failed",
            message: "Component registry requires SQL-backed persistence.",
          },
        };
      }
      const coworker = await workspace.getCoworker(session, coworkerId);
      if (!coworker.ok) {
        return coworker;
      }
      const workspaceId = coworker.value.workspace_id;
      const published = await ensurePublished(sql, workspaceId, session.user.id);
      const match = published.find(
        (row) =>
          row.descriptorHash === command.expected_descriptor_hash &&
          row.semanticVersion === command.expected_component_version,
      );
      if (!match) {
        return {
          ok: false,
          error: {
            code: "validation_failed",
            message: "Component version/descriptor does not match the published registry.",
            details: {
              reason: "component_version_mismatch",
              expected_component_version: command.expected_component_version,
              expected_descriptor_hash: command.expected_descriptor_hash,
            },
          },
        };
      }
      if (match.exposure === "server_only") {
        return {
          ok: false,
          error: {
            code: "forbidden",
            message: "Server-only HITL components cannot receive coworker grants.",
            details: { stable_name: match.stableName },
          },
        };
      }

      const disclosed = discloseVersion(match);
      if (!disclosed) {
        return {
          ok: false,
          error: { code: "not_found", message: "Component definition missing from code registry." },
        };
      }

      const keyHash = idempotencyKeyHash(command.idempotency_key);
      const [priorAudit] = await sql<{ redacted_payload_json: unknown }[]>`
        SELECT redacted_payload_json
        FROM audit_events
        WHERE workspace_id = ${workspaceId}
          AND action IN ('component.grant', 'component.revoke')
          AND redacted_payload_json->>'coworker_id' = ${coworkerId}
          AND redacted_payload_json->>'idempotency_key_hash' = ${keyHash}
        ORDER BY created_at DESC
        LIMIT 1
      `;
      if (priorAudit) {
        const payload = parseAuditPayload(priorAudit.redacted_payload_json);
        if (payload) {
          const replayComponent = componentFromAuditPayload(payload);
          const grantId = payload.grant_id;
          const action = payload.action;
          const sessionRotations = payload.session_rotations;
          if (
            typeof grantId === "string" &&
            (action === "granted" || action === "revoked" || action === "noop") &&
            replayComponent &&
            Array.isArray(sessionRotations) &&
            sessionRotations.every((row) => typeof row === "string")
          ) {
            return {
              ok: true,
              value: {
                grant_id: grantId,
                action,
                component: replayComponent,
                session_rotations: sessionRotations,
              },
            };
          }
        }
      }

      let applied;
      try {
        applied = await applyComponentGrantChange(sql, {
          grantInput: {
            componentVersionId: match.id,
            workspaceId,
            channelId: null,
            agentProfileId: coworkerId,
            grantedBy: session.user.id,
            granted: command.granted,
          },
          audit: {
            workspaceId,
            actorUserId: session.user.id,
            action: command.granted ? "component.grant" : "component.revoke",
            targetType: "ui_component_grant",
            targetId: "",
            payload: {
              coworker_id: coworkerId,
              component_version_id: match.id,
              stable_name: match.stableName,
              descriptor_hash: match.descriptorHash,
              granted: command.granted,
              idempotency_key_hash: keyHash,
              component: disclosed,
            },
          },
          sessionAgentProfileId: coworkerId,
        });
      } catch (error) {
        return {
          ok: false,
          error: {
            code: "forbidden",
            message: error instanceof Error ? error.message : "Component grant rejected.",
          },
        };
      }

      const result = applied.grant;

      if (result.changed && applied.sessionRotations.length > 0 && rotateGrantSessions) {
        try {
          await rotateGrantSessions({
            workspaceId,
            coworkerId,
            sessionIds: applied.sessionRotations,
            createdBy: session.user.id,
            granted: command.granted,
          });
        } catch (error) {
          return {
            ok: false,
            error: {
              code: "provider_unavailable",
              message: "Component grant saved but session rotation failed; retry or refresh.",
              details: {
                reason: "session_rotation_failed",
                message: error instanceof Error ? error.message : String(error),
              },
            },
          };
        }
      }

      return {
        ok: true,
        value: {
          grant_id: result.grantId,
          action: result.action,
          component: disclosed,
          session_rotations: applied.sessionRotations,
        },
      };
    },
  };
}

export type ComponentService = ReturnType<typeof createComponentService>;
