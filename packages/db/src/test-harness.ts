import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { getRegistryDefinition } from "@forgeroom/domain";
import { createSql, databaseUrl } from "./client";
import { migrate } from "./migrate";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");

const DOCKER_CANDIDATES = [
  "/usr/local/bin/docker",
  "/opt/homebrew/bin/docker",
  "/Applications/Docker.app/Contents/Resources/bin/docker",
];

function dockerBin(): string {
  try {
    const found = execSync("command -v docker", {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    if (found.length > 0) {
      return found;
    }
  } catch {
    // PATH may omit Docker Desktop's binary.
  }
  const installed = DOCKER_CANDIDATES.find((candidate) => existsSync(candidate));
  if (installed) {
    return installed;
  }
  throw new Error(
    "PostgreSQL is not reachable and docker was not found. Start infra/compose.yaml or set DATABASE_URL.",
  );
}

export const HASH = `sha256:${"ab".repeat(32)}`;
export const NOW = "2026-08-25T23:00:00.000Z";
export const DATA_TABLE_DESCRIPTOR_HASH =
  getRegistryDefinition("DataTable")?.descriptorHash ?? HASH;

function adminUrl(url: string): string {
  const parsed = new URL(url);
  parsed.pathname = "/postgres";
  return parsed.toString();
}

async function ping(url: string): Promise<void> {
  const sql = postgres(url, {
    max: 1,
    prepare: false,
    connect_timeout: 2,
    onnotice: () => undefined,
  });
  try {
    await sql`SELECT 1`;
  } finally {
    await sql.end({ timeout: 1 });
  }
}

function postgresCandidates(): string[] {
  const seen = new Set<string>();
  const candidates: string[] = [];
  const push = (url: string | undefined) => {
    if (!url || seen.has(url)) {
      return;
    }
    seen.add(url);
    candidates.push(url);
  };
  push(process.env.DATABASE_URL);
  push(databaseUrl());
  push(`postgres://${encodeURIComponent(process.env.USER ?? "postgres")}@127.0.0.1:5432/postgres`);
  return candidates;
}

let cachedPostgresUrl: string | null | undefined;

/** Fast reachability probe — never starts Docker. */
export async function resolvePostgresTestUrl(): Promise<string | null> {
  if (cachedPostgresUrl !== undefined) {
    return cachedPostgresUrl;
  }
  for (const url of postgresCandidates()) {
    try {
      await ping(url);
      cachedPostgresUrl = url;
      return url;
    } catch {
      // Try the next candidate.
    }
  }
  cachedPostgresUrl = null;
  return null;
}

async function bootstrapDockerPostgres(): Promise<string> {
  try {
    execSync(`${dockerBin()} compose -f infra/compose.yaml up -d postgres`, {
      cwd: repoRoot,
      stdio: "pipe",
    });
  } catch (error) {
    const lastError = error;
    const deadline = Date.now() + 40_000;
    while (Date.now() < deadline) {
      for (const url of postgresCandidates()) {
        try {
          await ping(url);
          return url;
        } catch {
          // keep waiting
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    throw lastError;
  }

  const deadline = Date.now() + 40_000;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      await ping(databaseUrl());
      return databaseUrl();
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  throw lastError;
}

export async function ensureLocalPostgres(): Promise<string> {
  const existing = await resolvePostgresTestUrl();
  if (existing) {
    return existing;
  }
  if (process.env.FORGEROOM_TEST_DOCKER_POSTGRES === "1") {
    const bootstrapped = await bootstrapDockerPostgres();
    cachedPostgresUrl = bootstrapped;
    return bootstrapped;
  }
  throw new Error(
    "PostgreSQL is not reachable. Set DATABASE_URL, start infra/compose.yaml, or set FORGEROOM_TEST_DOCKER_POSTGRES=1.",
  );
}

async function skipIntegrationTestWhenUnavailable(): Promise<void> {
  const { getCurrentTest } = await import("vitest/suite");
  const test = getCurrentTest();
  if (test?.context && "skip" in test.context && typeof test.context.skip === "function") {
    test.context.skip(true, "PostgreSQL not available");
  }
}

export async function withTemporaryDatabase<T>(fn: (url: string) => Promise<T>): Promise<T> {
  const url = await resolvePostgresTestUrl();
  if (!url) {
    await skipIntegrationTestWhenUnavailable();
    throw new Error(
      "PostgreSQL is not reachable. Set DATABASE_URL, start infra/compose.yaml, or set FORGEROOM_TEST_DOCKER_POSTGRES=1.",
    );
  }
  const admin = postgres(adminUrl(url), { max: 1, prepare: false, onnotice: () => undefined });
  const dbName = `forgeroom_p0103_${process.pid}_${Date.now()}`;
  try {
    await admin.unsafe(`CREATE DATABASE ${dbName}`);
    const testUrl = new URL(url);
    testUrl.pathname = `/${dbName}`;
    return await fn(testUrl.toString());
  } finally {
    await admin.unsafe(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
    await admin.end({ timeout: 5 });
  }
}

export async function withMigratedDatabase<T>(fn: (sql: postgres.Sql) => Promise<T>): Promise<T> {
  const url = await resolvePostgresTestUrl();
  if (!url) {
    await skipIntegrationTestWhenUnavailable();
    throw new Error(
      "PostgreSQL is not reachable. Set DATABASE_URL, start infra/compose.yaml, or set FORGEROOM_TEST_DOCKER_POSTGRES=1.",
    );
  }
  return withTemporaryDatabase(async (testUrl) => {
    const sql = createSql(testUrl);
    try {
      await migrate(sql);
      return await fn(sql);
    } finally {
      await sql.end({ timeout: 5 });
    }
  });
}

export async function seedRuntime(sql: postgres.Sql): Promise<void> {
  await sql`
    INSERT INTO users (id, email, display_name, password_hash, created_at)
    VALUES ('user_1', 'owner@example.test', 'Owner', 'hash', ${NOW})
  `;
  await sql`
    INSERT INTO workspaces (id, name, slug, created_by, created_at)
    VALUES ('ws_1', 'Demo', 'demo', 'user_1', ${NOW})
  `;
  await sql`
    INSERT INTO memberships (workspace_id, user_id, role, status, created_at)
    VALUES ('ws_1', 'user_1', 'owner', 'active', ${NOW})
  `;
  await sql`
    INSERT INTO agent_profiles (
      id, workspace_id, handle, name, title, visibility, status,
      editable_config_json, config_revision, native_subagents_enabled, created_at, updated_at
    )
    VALUES (
      'cw_1', 'ws_1', 'research', 'Research', 'Reader', 'workspace', 'active',
      '{}'::jsonb, 1, false, ${NOW}, ${NOW}
    )
  `;
  await sql`
    INSERT INTO agent_versions (id, agent_profile_id, version, config_json, spec_hash, created_by, created_at)
    VALUES ('av_1', 'cw_1', 1, '{}'::jsonb, ${HASH}, 'user_1', ${NOW})
  `;
  await sql`UPDATE agent_profiles SET current_version_id = 'av_1' WHERE id = 'cw_1'`;
  await sql`
    INSERT INTO session_revisions (
      id, agent_profile_id, source_config_revision, effective_config_redacted_json,
      effective_spec_hash, approval_policy_hash, created_by, created_at
    )
    VALUES ('sr_1', 'cw_1', 1, '{}'::jsonb, ${HASH}, ${HASH}, 'user_1', ${NOW})
  `;
  await sql`
    INSERT INTO channels (
      id, workspace_id, name, mission_brief, next_sequence, status, created_by, created_at, updated_at
    )
    VALUES ('ch_1', 'ws_1', 'Demo', 'Inspect the fixture', 1, 'active', 'user_1', ${NOW}, ${NOW})
  `;
  await sql`
    INSERT INTO channel_events (
      id, channel_id, sequence, type, actor_type, actor_id, payload_json, created_at
    )
    VALUES ('evt_1', 'ch_1', 0, 'message.created', 'human', 'user_1', '{}'::jsonb, ${NOW})
  `;
  await sql`
    INSERT INTO messages (id, channel_id, event_id, author_type, author_id, body, created_at)
    VALUES ('msg_1', 'ch_1', 'evt_1', 'human', 'user_1', 'Please inspect', ${NOW})
  `;
  await sql`
    INSERT INTO channel_agent_sessions (
      id, workspace_id, channel_id, agent_profile_id, logical_agui_thread_id,
      last_delivered_channel_sequence, state, created_at, updated_at
    )
    VALUES ('cas_1', 'ws_1', 'ch_1', 'cw_1', 'thread_1', 0, 'active', ${NOW}, ${NOW})
  `;
  await sql`
    INSERT INTO channel_agent_session_generations (
      id, channel_agent_session_id, generation, agent_version_id, session_revision_id,
      trueforge_session_id, effective_spec_hash, approval_policy_hash, state, created_at
    )
    VALUES ('gen_1', 'cas_1', 1, 'av_1', 'sr_1', 'tf_sess_1', ${HASH}, ${HASH}, 'ready', ${NOW})
  `;
  await sql`UPDATE channel_agent_sessions SET current_generation_id = 'gen_1' WHERE id = 'cas_1'`;
  await sql`
    INSERT INTO runs (
      id, channel_id, source_message_id, requested_by, routing_mode, goal, lifecycle,
      scheduling_paused, budget_json
    )
    VALUES ('run_1', 'ch_1', 'msg_1', 'user_1', 'direct', 'Inspect', 'active', false, '{}'::jsonb)
  `;
  await sql`
    INSERT INTO run_steps (
      id, run_id, assigned_agent_id, objective, context_refs_json, state, attempt
    )
    VALUES ('step_1', 'run_1', 'cw_1', 'Read', '[]'::jsonb, 'running', 1)
  `;
  await sql`
    INSERT INTO turn_queue_items (
      id, channel_agent_session_id, run_step_id, bound_session_generation_id, input_type,
      input_payload_redacted_json, fifo_sequence, state, created_at
    )
    VALUES ('q_1', 'cas_1', 'step_1', 'gen_1', 'normal', '{}'::jsonb, 0, 'claimed', ${NOW})
  `;
  await sql`
    INSERT INTO agent_turns (
      id, run_step_id, channel_agent_session_id, session_generation_id, queue_item_id,
      application_run_token, agui_run_id, input_type, state, started_at
    )
    VALUES (
      'turn_1', 'step_1', 'cas_1', 'gen_1', 'q_1', 'token_1', 'agui_run_1', 'normal', 'streaming', ${NOW}
    )
  `;
  await sql`
    INSERT INTO ui_components (
      id, workspace_id, stable_name, kind, status, created_by, created_at, updated_at
    )
    VALUES ('comp_1', 'ws_1', 'DataTable', 'table', 'active', 'user_1', ${NOW}, ${NOW})
  `;
  await sql`
    INSERT INTO ui_component_versions (
      id, component_id, semantic_version, exposure, confirmation_policy, model_description,
      argument_schema_json, renderer_key, descriptor_hash, published_by, published_at
    )
    VALUES (
      'compv_1', 'comp_1', '1.0.0', 'agent_tool', 'none', 'Table',
      '{}'::jsonb, 'DataTable@1.0.0', ${DATA_TABLE_DESCRIPTOR_HASH}, 'user_1', ${NOW}
    )
  `;
  await sql`
    UPDATE ui_components SET current_published_version_id = 'compv_1' WHERE id = 'comp_1'
  `;
  await sql`
    INSERT INTO ui_instances (
      id, workspace_id, channel_id, run_id, run_step_id, agent_turn_id, logical_thread_id,
      tool_call_id, component_version_id, activity_message_id, source_event_id, creator_agent_id,
      title, text_alternative, status, created_at, updated_at
    )
    VALUES (
      'ui_1', 'ws_1', 'ch_1', 'run_1', 'step_1', 'turn_1', 'thread_1',
      'tc_1', 'compv_1', 'act_1', 'evt_1', 'cw_1',
      'Results', 'A table of results', 'building', ${NOW}, ${NOW}
    )
  `;
  await sql`
    INSERT INTO ui_surface_grants (
      id, ui_instance_id, grant_kind, policy_revision, rail, allowed_component_types_json,
      limits_json, grant_scope_hash, issued_by, expires_at, created_at
    )
    VALUES (
      'rg_1', 'ui_1', 'render', 1, 'registry_v1', '["table"]'::jsonb,
      '{}'::jsonb, ${HASH}, 'application_policy', ${NOW}, ${NOW}
    )
  `;
  await sql`UPDATE ui_instances SET render_grant_id = 'rg_1' WHERE id = 'ui_1'`;
  await sql`
    INSERT INTO ui_surface_grants (
      id, ui_instance_id, grant_kind, policy_revision, bound_render_revision, bound_manifest_hash,
      action_ref, handler_key, action_mode, input_schema_json, input_schema_hash,
      allowed_render_node_ids_json, grant_scope_hash, max_uses, use_count, issued_by, expires_at, created_at
    )
    VALUES (
      'ag_1', 'ui_1', 'action', 1, 0, ${HASH},
      'select_row', 'select_row', 'local_state', '{}'::jsonb, ${HASH},
      '["node_1"]'::jsonb, ${HASH}, 3, 0, 'application_policy', ${NOW}, ${NOW}
    )
  `;
  await sql`
    INSERT INTO connector_bindings (
      id, workspace_id, provider, credential_owner_type, credential_owner_id,
      trueforge_connector_name, config_version, config_hash, allowed_tools_json,
      acting_identity_json, status, created_at, updated_at
    )
    VALUES (
      'cb_1', 'ws_1', 'github', 'workspace', 'ws_1',
      'github', 1, ${HASH}, '["GITHUB_READ"]'::jsonb,
      '{}'::jsonb, 'active', ${NOW}, ${NOW}
    )
  `;
}
