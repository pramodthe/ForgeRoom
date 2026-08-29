import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  P0_COMPOSIO_DESCRIPTOR_HASHES,
  P0_COMPOSIO_TRUEFORGE_CONNECTOR_NAME,
} from "@forgeroom/composio";
import { publishArtifactRecord } from "@forgeroom/db";
import { HASH, seedRuntime, withMigratedDatabase } from "@forgeroom/db/test-harness";
import {
  captureTrueForgeRequiredActions,
  persistAgUiSandboxArtifacts,
  recordAgUiArtifactProjectionFailure,
  type AgUiRunBootstrap,
} from "./run-service";
import { loadRunReceiptSnapshot } from "../runs/receipt";

const WRITE_TOOL = "GITHUB_ADD_LABELS_TO_AN_ISSUE";
const SECRET = "must-not-survive-capture";

const bootstrap: AgUiRunBootstrap = {
  threadId: "thread_1",
  aguiRunId: "agui_run_1",
  applicationRunId: "run_1",
  runStepId: "step_1",
  agentTurnId: "turn_1",
  messageId: "msg_1",
  channelId: "ch_1",
  coworkerId: "cw_1",
  trueforgeSessionId: "tf_sess_1",
  trueforgeTurnId: "tf_turn_1",
};

async function seedReviewedWriteBinding(sql: Parameters<typeof seedRuntime>[0]): Promise<void> {
  await sql`
    UPDATE agent_turns
    SET trueforge_turn_id = ${bootstrap.trueforgeTurnId}
    WHERE id = ${bootstrap.agentTurnId}
  `;
  await sql`
    UPDATE connector_bindings
    SET
      provider = 'composio',
      trueforge_connector_name = ${P0_COMPOSIO_TRUEFORGE_CONNECTOR_NAME},
      allowed_tools_json = ${sql.json([WRITE_TOOL])},
      acting_identity_json = ${sql.json({
        service: "github",
        account_display: "github-…1234",
        principal_type: "service_account",
        principal_display: "ForgeRoom workspace GitHub",
        principal_id_hash: HASH,
      })},
      status = 'active'
    WHERE id = 'cb_1'
  `;
  await sql`
    UPDATE session_revisions
    SET effective_config_redacted_json = ${sql.json({
      connectors: [
        {
          name: P0_COMPOSIO_TRUEFORGE_CONNECTOR_NAME,
          enabled_tools: [WRITE_TOOL],
          approval_required_tools: [WRITE_TOOL],
        },
      ],
    })}
    WHERE id = 'sr_1'
  `;
  await sql`
    INSERT INTO tool_grants (
      id, workspace_id, channel_id, agent_profile_id, connector_binding_id,
      tool_name, classification, approval_policy, observed_descriptor_hash,
      tool_policy_key, created_by, created_at
    ) VALUES (
      'tg_write_1', 'ws_1', 'ch_1', 'cw_1', 'cb_1',
      ${WRITE_TOOL}, 'write', 'required',
      ${P0_COMPOSIO_DESCRIPTOR_HASHES.GITHUB_ADD_LABELS_TO_AN_ISSUE},
      'p0.github.add-label', 'user_1', NOW()
    )
  `;
}

function approvalWire(toolName = WRITE_TOOL) {
  const source = {
    type: "model.message",
    id: "evt_model_approval",
    thread_id: bootstrap.threadId,
    tool_calls: [
      {
        id: "tool_call_1",
        function: {
          name: toolName,
          arguments: JSON.stringify({
            owner: "pramodthe",
            repo: "ForgeRoom",
            issue_number: 35,
            labels: ["provider-e2e"],
            access_token: SECRET,
          }),
        },
      },
    ],
  };
  const done = {
    type: "turn.done",
    id: "evt_done_approval",
    state: {
      required_actions: [
        {
          type: "tool.approval_required",
          tool_calls: [
            {
              id: "tool_call_1",
              source_event_id: source.id,
            },
          ],
        },
      ],
    },
  };
  return { source, done, rawEvents: [source, done] };
}

describe("AG-UI raw TrueForge required-action capture", () => {
  it("materializes one trusted, redacted approval bound to generation and connector identity", async () => {
    await withMigratedDatabase(async (sql) => {
      await seedRuntime(sql);
      await seedReviewedWriteBinding(sql);

      const wire = approvalWire();
      const first = await captureTrueForgeRequiredActions({
        sql,
        bootstrap,
        raw: wire.done,
        rawEvents: wire.rawEvents,
      });
      expect(first).toEqual({ ok: true, inserted: true });

      const replay = await captureTrueForgeRequiredActions({
        sql,
        bootstrap,
        raw: wire.done,
        rawEvents: wire.rawEvents,
      });
      expect(replay).toEqual({ ok: true, inserted: false });

      const proposals = await sql<
        Array<{
          connector_binding_id: string;
          session_generation_id: string;
          approval_policy_hash: string;
          tool_name: string;
          observed_descriptor_hash: string;
          acting_identity_json: Record<string, unknown>;
          normalized_arguments_redacted_json: Record<string, unknown>;
          target_redacted_json: Record<string, unknown>;
        }>
      >`
        SELECT
          connector_binding_id, session_generation_id, approval_policy_hash,
          tool_name, observed_descriptor_hash, acting_identity_json,
          normalized_arguments_redacted_json, target_redacted_json
        FROM action_proposals
      `;
      expect(proposals).toHaveLength(1);
      expect(proposals[0]).toMatchObject({
        connector_binding_id: "cb_1",
        session_generation_id: "gen_1",
        approval_policy_hash: HASH,
        tool_name: WRITE_TOOL,
        observed_descriptor_hash: P0_COMPOSIO_DESCRIPTOR_HASHES.GITHUB_ADD_LABELS_TO_AN_ISSUE,
        acting_identity_json: {
          service: "github",
          principal_type: "service_account",
          principal_id_hash: HASH,
        },
        normalized_arguments_redacted_json: {
          owner: "pramodthe",
          repo: "ForgeRoom",
          issue_number: 35,
          labels: ["provider-e2e"],
          access_token: "[REDACTED]",
        },
        target_redacted_json: {
          kind: "github_issue",
          display: "pramodthe/ForgeRoom#35",
        },
      });

      const serialized = JSON.stringify(
        await sql`SELECT payload_redacted_json FROM required_actions`,
      );
      expect(serialized).not.toContain(SECRET);
      const lifecycle = await sql<Array<{ turn_state: string; step_state: string }>>`
        SELECT turn.state AS turn_state, step.state AS step_state
        FROM agent_turns AS turn
        JOIN run_steps AS step ON step.id = turn.run_step_id
        WHERE turn.id = ${bootstrap.agentTurnId}
      `;
      expect(lifecycle[0]).toEqual({
        turn_state: "required_actions",
        step_state: "awaiting_approval",
      });
    });
  }, 60_000);

  it("fails closed for an unreviewed tool and a stale generation binding", async () => {
    await withMigratedDatabase(async (sql) => {
      await seedRuntime(sql);
      await seedReviewedWriteBinding(sql);

      const unknownWire = approvalWire("GITHUB_CREATE_ISSUE");
      const unknown = await captureTrueForgeRequiredActions({
        sql,
        bootstrap,
        raw: unknownWire.done,
        rawEvents: unknownWire.rawEvents,
      });
      expect(unknown).toEqual({
        ok: false,
        reason: "unreviewed_approval_tool:GITHUB_CREATE_ISSUE",
      });

      const wire = approvalWire();
      const stale = await captureTrueForgeRequiredActions({
        sql,
        bootstrap: { ...bootstrap, trueforgeSessionId: "tf_sess_replaced" },
        raw: wire.done,
        rawEvents: wire.rawEvents,
      });
      expect(stale).toEqual({
        ok: false,
        reason: `invalid_live_tool_binding:${WRITE_TOOL}`,
      });
      const groups = await sql<
        Array<{ count: number }>
      >`SELECT COUNT(*)::int AS count FROM pause_groups`;
      expect(groups[0]?.count).toBe(0);
    });
  }, 60_000);

  it("projects sandbox lifecycle, publishes a discovered file, and links it into the receipt", async () => {
    await withMigratedDatabase(async (sql) => {
      await seedRuntime(sql);
      await sql`
        UPDATE agent_turns
        SET trueforge_turn_id = ${bootstrap.trueforgeTurnId}
        WHERE id = ${bootstrap.agentTurnId}
      `;
      const content = Buffer.from("demo-rec-001 → open\n", "utf8");
      const rawEvents = [
        { type: "sandbox.created", id: "evt_sandbox", sandbox_id: "sb_daytona_1" },
        {
          type: "model.message",
          id: "evt_model_tool",
          tool_calls: [
            {
              id: "tc_sandbox",
              function: { name: "run_sandbox_command", arguments: "sensitive raw command" },
              tool_info: { type: "truefoundry-system", name: "run_sandbox_command" },
            },
          ],
        },
        {
          type: "tool.response",
          id: "evt_tool_response",
          tool_call_id: "tc_sandbox",
          content: "raw provider response must not persist",
        },
        {
          type: "model.message",
          id: "evt_sandbox_artifacts",
          content:
            "Generated artifact:\n```sandbox_artifacts\n[forgeroom-p0-probe-sample.md](/home/daytona/forgeroom-p0-probe-sample.md)\n```",
        },
      ];

      const result = await persistAgUiSandboxArtifacts({
        sql,
        bootstrap,
        rawEvents,
        trueforgeClient: {
          async downloadSandboxFile(_sessionId, _turnId, path) {
            expect(path).toBe("/home/daytona/forgeroom-p0-probe-sample.md");
            return content;
          },
        },
        artifacts: {
          async publishArtifact(input) {
            const sha256 = `sha256:${createHash("sha256").update(input.content).digest("hex")}`;
            const record = await publishArtifactRecord(sql, {
              id: input.id!,
              workspaceId: input.workspaceId,
              channelId: input.channelId,
              runId: input.runId,
              runStepId: input.runStepId,
              creatorAgentId: input.creatorAgentId,
              kind: input.kind,
              name: input.name,
              mimeType: input.mimeType,
              storageKey: `ws/${input.workspaceId}/ch/${input.channelId}/sha/${sha256.slice(7)}/r1`,
              byteSize: input.content.byteLength,
              sha256,
              sourceSandboxId: input.sourceSandboxId,
              sourceSandboxPath: input.sourceSandboxPath,
              revision: input.revision,
              metadataJson: input.metadataJson,
              createdAt: new Date().toISOString(),
            });
            if (!record.ok) {
              return {
                ok: false as const,
                error: { code: "conflict" as const, message: record.reason },
              };
            }
            return {
              ok: true as const,
              value: {
                artifact: {
                  schemaVersion: 1 as const,
                  id: record.artifact.id,
                  workspace_id: record.artifact.workspaceId,
                  channel_id: record.artifact.channelId,
                  run_id: record.artifact.runId,
                  run_step_id: record.artifact.runStepId,
                  creator_coworker_id: record.artifact.creatorAgentId,
                  kind: record.artifact.kind,
                  name: record.artifact.name,
                  mime_type: record.artifact.mimeType,
                  byte_size: record.artifact.byteSize,
                  sha256: record.artifact.sha256,
                  revision: record.artifact.revision,
                  created_at: record.artifact.createdAt,
                },
                created: record.created,
                storageKey: record.artifact.storageKey,
              },
            };
          },
        },
      });
      expect(result).toEqual({ discovered: 1, published: 1 });

      const artifactRows = await sql<Array<{ id: string; source_sandbox_path: string }>>`
        SELECT id, source_sandbox_path FROM artifacts WHERE run_id = 'run_1'
      `;
      expect(artifactRows).toHaveLength(1);
      expect(artifactRows[0]?.source_sandbox_path).toBe("forgeroom-p0-probe-sample.md");
      const projected = await sql<
        Array<{ normalized_type: string; normalized_payload_redacted_json: unknown }>
      >`
        SELECT normalized_type, normalized_payload_redacted_json
        FROM run_events
        WHERE agent_turn_id = 'turn_1'
        ORDER BY first_seen_at, id
      `;
      expect(projected.map((row) => row.normalized_type)).toEqual(
        expect.arrayContaining([
          "sandbox.created",
          "sandbox.command_started",
          "sandbox.command_completed",
          "artifact.discovered",
          "artifact.published",
        ]),
      );
      expect(JSON.stringify(projected)).not.toContain("sensitive raw command");
      expect(JSON.stringify(projected)).not.toContain("raw provider response must not persist");

      const receipt = await loadRunReceiptSnapshot(sql, "run_1");
      expect(receipt?.artifact_id).toBe(artifactRows[0]?.id);
    });
  }, 60_000);

  it("persists a redacted retry marker when artifact projection fails", async () => {
    await withMigratedDatabase(async (sql) => {
      await seedRuntime(sql);
      await sql`
        UPDATE agent_turns
        SET trueforge_turn_id = ${bootstrap.trueforgeTurnId}
        WHERE id = ${bootstrap.agentTurnId}
      `;
      const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
      try {
        await recordAgUiArtifactProjectionFailure({
          sql,
          bootstrap,
          terminalEventId: "evt_done_artifact_failure",
        });
      } finally {
        error.mockRestore();
      }
      const events = await sql<
        Array<{ normalized_type: string; normalized_payload_redacted_json: unknown }>
      >`
        SELECT normalized_type, normalized_payload_redacted_json
        FROM run_events
        WHERE agent_turn_id = ${bootstrap.agentTurnId}
          AND normalized_type = 'artifact.publication_failed'
      `;
      expect(events).toHaveLength(1);
      expect(events[0]?.normalized_type).toBe("artifact.publication_failed");
      expect(JSON.parse(String(events[0]?.normalized_payload_redacted_json))).toEqual({
        reason: "artifact_projection_failed",
        retryable: true,
      });
    });
  }, 60_000);
});
