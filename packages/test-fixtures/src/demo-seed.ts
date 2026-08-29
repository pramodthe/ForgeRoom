import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import {
  createSql,
  databaseUrl,
  migrate,
  publishWorkspaceRegistry,
  setComponentGrant,
} from "@forgeroom/db";
import { materializeTaskGrantFromOperations, P0_CONTROLLED_REGISTRY } from "@forgeroom/domain";
import { P0_COMPOSIO_ENABLED_TOOLS } from "@forgeroom/composio";
import type postgres from "postgres";
import { assertP0FeatureProfileFrozen, readProviderFixtureJson } from "./index";

type SqlClient = postgres.Sql;

const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: string,
  keylen: number,
  options: { N: number; r: number; p: number },
) => Promise<Buffer>;

/** Stable demo fixture IDs — configuration data, not product classes. */
export const DEMO_FIXTURE_IDS = {
  channelId: "ch_demo_general",
  channelName: "general",
  coworkerId: "cw_demo_operator",
  coworkerVersionId: "av_demo_operator_v1",
  taskGrantId: "tgrant_demo_operator_general",
  channelCreatedEventId: "cevt_demo_channel_created",
} as const;

export type SeededOperatorFixture = {
  fixtureRole: string;
  coworker: {
    name: string;
    handle: string;
    title: string;
    standing_instructions: string;
    model_provider: string;
    model_preset: string | null;
    native_subagents_enabled: boolean;
    sandbox: boolean;
    budget: { max_turn_tokens: number; max_tool_calls: number };
  };
};

export type ResearchDraftFixture = {
  prompt: string;
  expectedProposal: {
    name: string;
    handle: string;
    model_preset: string | null;
  };
  expectedPermissionPreview: {
    exactDiff: {
      grants: Array<{ directToolSlug: string; role: string }>;
      denials: Array<{ code: string }>;
    } | null;
  };
};

export type SyntheticProviderFixture = {
  owner: string;
  repo: string;
  issueNumber: number;
  syntheticMarker: { kind: string; value: string };
  resetToolSlug: string;
};

export type PinnedAccountFixture = {
  redactedSuffix: string;
  envVar: string;
  composioToolkitSlug: string;
};

export type DemoFixtureBundle = {
  operator: SeededOperatorFixture;
  researchDraft: ResearchDraftFixture;
  syntheticProvider: SyntheticProviderFixture;
  pinnedAccount: PinnedAccountFixture;
  taskTitle: string;
};

export type DemoSeedEnv = {
  databaseUrl: string;
  ownerUserId: string;
  ownerEmail: string;
  ownerDisplayName: string;
  ownerPasswordHash: string | null;
  ownerPassword: string | null;
  workspaceId: string;
  workspaceName: string;
  workspaceSlug: string;
  composioApiKey: string | null;
  composioConnectedAccountId: string | null;
  composioUserId: string | null;
};

export type DemoSeedResult = {
  ownerUserId: string;
  workspaceId: string;
  channelId: string;
  coworkerId: string;
  coworkerHandle: string;
  researchPrompt: string;
  taskTitle: string;
  modelPreset: string | null;
};

const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEYLEN = 64;

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("base64url");
  const derived = await scryptAsync(password, salt, KEYLEN, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
  });
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt}$${derived.toString("base64url")}`;
}

function specHash(config: Record<string, unknown>): string {
  return `sha256:${createHash("sha256").update(JSON.stringify(config)).digest("hex")}`;
}

export function loadDemoEnv(env: NodeJS.ProcessEnv = process.env): DemoSeedEnv {
  return {
    databaseUrl: env.DATABASE_URL && env.DATABASE_URL.length > 0 ? env.DATABASE_URL : databaseUrl(),
    ownerUserId: env.OWNER_USER_ID ?? "user_owner",
    ownerEmail: (env.OWNER_EMAIL ?? "owner@example.test").toLowerCase(),
    ownerDisplayName: env.OWNER_DISPLAY_NAME ?? "Owner",
    ownerPasswordHash: env.OWNER_PASSWORD_HASH?.trim() || null,
    ownerPassword: env.OWNER_PASSWORD?.trim() || null,
    workspaceId: env.WORKSPACE_ID ?? "workspace_1",
    workspaceName: env.WORKSPACE_NAME ?? "ForgeRoom",
    workspaceSlug: env.WORKSPACE_SLUG ?? "forgeroom",
    composioApiKey: env.COMPOSIO_API_KEY?.trim() || null,
    composioConnectedAccountId: env.COMPOSIO_CONNECTED_ACCOUNT_ID?.trim() || null,
    composioUserId: env.COMPOSIO_USER_ID?.trim() || null,
  };
}

export function loadDemoFixtureBundle(): DemoFixtureBundle {
  assertP0FeatureProfileFrozen();
  const operator = readProviderFixtureJson<SeededOperatorFixture>(
    "coworkers/seeded-operator.candidate.json",
  );
  const researchDraft = readProviderFixtureJson<ResearchDraftFixture>(
    "coworkers/conversational-research-draft.candidate.json",
  );
  const tools = readProviderFixtureJson<{
    syntheticProviderFixture: SyntheticProviderFixture;
  }>("composio/tools.candidate.json");
  const accounts = readProviderFixtureJson<{
    accounts: PinnedAccountFixture[];
  }>("composio/accounts.verified.json");
  const task = readProviderFixtureJson<{
    demoTaskTitle: string;
  }>("tasks/task-record.candidate.json");

  if (operator.fixtureRole !== "Operator") {
    throw new Error("Operator fixtureRole must remain configuration data labeled Operator");
  }
  if (operator.coworker.native_subagents_enabled !== false) {
    throw new Error("Seeded Operator must keep native_subagents_enabled false");
  }
  if (operator.coworker.handle !== "operator") {
    throw new Error("Seeded Operator handle must be operator");
  }
  const pinned = accounts.accounts[0];
  if (!pinned?.redactedSuffix) {
    throw new Error("Pinned Composio account redacted suffix missing");
  }

  return {
    operator,
    researchDraft,
    syntheticProvider: tools.syntheticProviderFixture,
    pinnedAccount: pinned,
    taskTitle: task.demoTaskTitle,
  };
}

export function assertProviderResetTargetAllowed(input: {
  connectedAccountId: string;
  pinned: PinnedAccountFixture;
  synthetic: SyntheticProviderFixture;
  owner: string;
  repo: string;
  issueNumber: number;
  label: string;
}): void {
  if (!input.connectedAccountId.endsWith(input.pinned.redactedSuffix)) {
    throw new Error(
      `Refusing provider reset: connected account does not end with pinned suffix ${input.pinned.redactedSuffix}`,
    );
  }
  if (
    input.owner !== input.synthetic.owner ||
    input.repo !== input.synthetic.repo ||
    input.issueNumber !== input.synthetic.issueNumber ||
    input.label !== input.synthetic.syntheticMarker.value
  ) {
    throw new Error(
      "Refusing provider reset: target is not the verified synthetic provider fixture record",
    );
  }
  if (input.synthetic.resetToolSlug !== "GITHUB_REMOVE_A_LABEL_FROM_AN_ISSUE") {
    throw new Error("Refusing provider reset: unexpected reset tool slug");
  }
}

async function resolveOwnerPasswordHash(sql: SqlClient, env: DemoSeedEnv): Promise<string> {
  if (env.ownerPasswordHash) {
    return env.ownerPasswordHash;
  }
  if (env.ownerPassword) {
    return hashPassword(env.ownerPassword);
  }
  const existing = await sql<{ password_hash: string }[]>`
    SELECT password_hash FROM users WHERE id = ${env.ownerUserId} LIMIT 1
  `;
  if (existing[0]?.password_hash) {
    return existing[0].password_hash;
  }
  throw new Error(
    "OWNER_PASSWORD_HASH or OWNER_PASSWORD required for first demo seed (or pre-seed owner via API boot)",
  );
}

async function upsertOwnerWorkspace(
  sql: SqlClient,
  env: DemoSeedEnv,
  passwordHash: string,
  now: string,
): Promise<void> {
  await sql.begin(async (tx) => {
    await tx`
      INSERT INTO users (id, email, display_name, password_hash, created_at)
      VALUES (${env.ownerUserId}, ${env.ownerEmail}, ${env.ownerDisplayName}, ${passwordHash}, ${now})
      ON CONFLICT (id) DO UPDATE SET
        email = EXCLUDED.email,
        display_name = EXCLUDED.display_name,
        password_hash = EXCLUDED.password_hash
    `;
    await tx`
      INSERT INTO workspaces (id, name, slug, policy_json, created_by, created_at)
      VALUES (${env.workspaceId}, ${env.workspaceName}, ${env.workspaceSlug}, '{}'::jsonb, ${env.ownerUserId}, ${now})
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        slug = EXCLUDED.slug
    `;
    await tx`
      INSERT INTO memberships (workspace_id, user_id, role, status, created_at)
      VALUES (${env.workspaceId}, ${env.ownerUserId}, 'owner', 'active', ${now})
      ON CONFLICT (workspace_id, user_id) DO UPDATE SET
        role = 'owner',
        status = 'active'
    `;
  });
}

async function upsertDemoChannel(sql: SqlClient, env: DemoSeedEnv, now: string): Promise<void> {
  const existing = await sql<{ id: string }[]>`
    SELECT id FROM channels WHERE id = ${DEMO_FIXTURE_IDS.channelId} LIMIT 1
  `;
  if (existing[0]) {
    await sql`
      UPDATE channels
      SET
        workspace_id = ${env.workspaceId},
        name = ${DEMO_FIXTURE_IDS.channelName},
        mission_brief = ${"Demo channel for ForgeRoom P0 fixtures"},
        status = 'active',
        updated_at = ${now}
      WHERE id = ${DEMO_FIXTURE_IDS.channelId}
    `;
  } else {
    await sql.begin(async (tx) => {
      await tx`
        INSERT INTO channels (
          id, workspace_id, name, mission_brief, summary, policy_json,
          next_sequence, status, created_by, created_at, updated_at
        ) VALUES (
          ${DEMO_FIXTURE_IDS.channelId}, ${env.workspaceId}, ${DEMO_FIXTURE_IDS.channelName},
          ${"Demo channel for ForgeRoom P0 fixtures"}, NULL, '{}'::jsonb,
          0, 'active', ${env.ownerUserId}, ${now}, ${now}
        )
      `;
      await tx`
        INSERT INTO channel_events (
          id, channel_id, sequence, type, actor_type, actor_id, run_id,
          payload_json, created_at
        ) VALUES (
          ${DEMO_FIXTURE_IDS.channelCreatedEventId}, ${DEMO_FIXTURE_IDS.channelId}, 0,
          'channel.created', 'human', ${env.ownerUserId}, NULL,
          ${JSON.stringify({ name: DEMO_FIXTURE_IDS.channelName })}::jsonb, ${now}
        )
      `;
      await tx`
        UPDATE channels
        SET next_sequence = 1, updated_at = ${now}
        WHERE id = ${DEMO_FIXTURE_IDS.channelId}
      `;
    });
  }

  await sql`
    INSERT INTO channel_participants (
      channel_id, participant_type, participant_id, role, joined_at, removed_at
    ) VALUES (
      ${DEMO_FIXTURE_IDS.channelId}, 'human', ${env.ownerUserId}, 'owner', ${now}, NULL
    )
    ON CONFLICT (channel_id, participant_type, participant_id) DO UPDATE SET
      role = 'owner',
      removed_at = NULL
  `;
}

async function upsertOperatorCoworker(
  sql: SqlClient,
  env: DemoSeedEnv,
  operator: SeededOperatorFixture,
  componentVersionIds: string[],
  now: string,
): Promise<void> {
  const taskGrantOperations = ["create", "update_status"] as const;
  const taskGrant = materializeTaskGrantFromOperations(taskGrantOperations);
  const config = {
    standing_instructions: operator.coworker.standing_instructions,
    model_provider: operator.coworker.model_provider,
    model_preset: operator.coworker.model_preset,
    sandbox: operator.coworker.sandbox,
    budget: operator.coworker.budget,
    channel_ids: [DEMO_FIXTURE_IDS.channelId],
    task_record_grants: [
      {
        channel_id: DEMO_FIXTURE_IDS.channelId,
        operations: taskGrantOperations,
      },
    ],
    tool_grants: [...P0_COMPOSIO_ENABLED_TOOLS],
    skill_version_ids: [] as string[],
    component_version_ids: componentVersionIds,
    name: operator.coworker.name,
    handle: operator.coworker.handle,
    title: operator.coworker.title,
    native_subagents_enabled: false,
  };
  const hash = specHash(config);

  await sql.begin(async (tx) => {
    await tx`
      INSERT INTO agent_profiles (
        id, workspace_id, handle, name, title, avatar_seed, visibility, status,
        editable_config_json, current_version_id, config_revision,
        native_subagents_enabled, created_at, updated_at
      ) VALUES (
        ${DEMO_FIXTURE_IDS.coworkerId}, ${env.workspaceId}, ${operator.coworker.handle},
        ${operator.coworker.name}, ${operator.coworker.title}, NULL, 'workspace', 'active',
        ${JSON.stringify(config)}::jsonb, NULL, 1, false, ${now}, ${now}
      )
      ON CONFLICT (id) DO UPDATE SET
        workspace_id = EXCLUDED.workspace_id,
        handle = EXCLUDED.handle,
        name = EXCLUDED.name,
        title = EXCLUDED.title,
        status = 'active',
        editable_config_json = EXCLUDED.editable_config_json,
        config_revision = 1,
        native_subagents_enabled = false,
        updated_at = EXCLUDED.updated_at
    `;
    await tx`
      INSERT INTO agent_versions (
        id, agent_profile_id, version, config_json, spec_hash, created_by, created_at
      ) VALUES (
        ${DEMO_FIXTURE_IDS.coworkerVersionId}, ${DEMO_FIXTURE_IDS.coworkerId}, 1,
        ${JSON.stringify(config)}::jsonb, ${hash}, ${env.ownerUserId}, ${now}
      )
      ON CONFLICT (id) DO UPDATE SET
        config_json = EXCLUDED.config_json,
        spec_hash = EXCLUDED.spec_hash
    `;
    await tx`
      UPDATE agent_profiles
      SET current_version_id = ${DEMO_FIXTURE_IDS.coworkerVersionId}, updated_at = ${now}
      WHERE id = ${DEMO_FIXTURE_IDS.coworkerId}
    `;
    await tx`
      INSERT INTO task_grants (
        id, task_id, channel_id, subject_type, subject_id,
        allowed_operations_json, allowed_fields_json, allowed_transitions_json,
        policy_revision, granted_by, created_at, revoked_at
      ) VALUES (
        ${DEMO_FIXTURE_IDS.taskGrantId}, NULL, ${DEMO_FIXTURE_IDS.channelId}, 'coworker',
        ${DEMO_FIXTURE_IDS.coworkerId}, ${tx.json(taskGrant.allowedOperations)},
        ${tx.json(taskGrant.allowedFields)}, ${tx.json(taskGrant.allowedTransitions)},
        1, ${env.ownerUserId}, ${now}, NULL
      )
      ON CONFLICT (id) DO UPDATE SET
        task_id = NULL,
        channel_id = EXCLUDED.channel_id,
        subject_type = 'coworker',
        subject_id = EXCLUDED.subject_id,
        allowed_operations_json = EXCLUDED.allowed_operations_json,
        allowed_fields_json = EXCLUDED.allowed_fields_json,
        allowed_transitions_json = EXCLUDED.allowed_transitions_json,
        policy_revision = EXCLUDED.policy_revision,
        granted_by = EXCLUDED.granted_by,
        revoked_at = NULL
    `;
  });

  await sql`
    INSERT INTO channel_participants (
      channel_id, participant_type, participant_id, role, joined_at, removed_at
    ) VALUES (
      ${DEMO_FIXTURE_IDS.channelId}, 'coworker', ${DEMO_FIXTURE_IDS.coworkerId}, 'coworker', ${now}, NULL
    )
    ON CONFLICT (channel_id, participant_type, participant_id) DO UPDATE SET
      role = 'coworker',
      removed_at = NULL
  `;
}

/** Clear mutable demo-channel rows that are safe to remove.
 * Does not delete messages/runs: messages are referenced by runs, and runs may be
 * referenced by append-only channel_events (no UPDATE/DELETE allowed).
 */
async function clearMutableDemoChannelState(sql: SqlClient): Promise<void> {
  const channelId = DEMO_FIXTURE_IDS.channelId;
  await sql`DELETE FROM channel_pins WHERE channel_id = ${channelId}`;
  await sql`
    UPDATE tasks
    SET source_message_id = NULL, updated_at = now()
    WHERE channel_id = ${channelId}
  `;
  await sql`
    DELETE FROM task_grants
    WHERE task_id IN (SELECT id FROM tasks WHERE channel_id = ${channelId})
  `;
  await sql`
    DELETE FROM task_revisions
    WHERE task_id IN (SELECT id FROM tasks WHERE channel_id = ${channelId})
  `;
  await sql`
    DELETE FROM tasks
    WHERE channel_id = ${channelId}
      AND (source_run_id IS NULL OR NOT EXISTS (
        SELECT 1 FROM channel_events WHERE channel_events.run_id = tasks.source_run_id
      ))
  `;
  await sql`
    UPDATE channel_participants
    SET removed_at = now()
    WHERE channel_id = ${channelId}
      AND NOT (
        (participant_type = 'human' AND role = 'owner')
        OR (participant_type = 'coworker' AND participant_id = ${DEMO_FIXTURE_IDS.coworkerId})
      )
      AND removed_at IS NULL
  `;
}

export async function seedDemoFixtures(
  options: { env?: DemoSeedEnv; sql?: SqlClient; migrateFirst?: boolean } = {},
): Promise<DemoSeedResult> {
  const env = options.env ?? loadDemoEnv();
  const bundle = loadDemoFixtureBundle();
  const ownedSql = !options.sql;
  const sql = options.sql ?? createSql(env.databaseUrl);
  try {
    if (options.migrateFirst !== false) {
      await migrate(sql);
    }
    const now = new Date().toISOString();
    const passwordHash = await resolveOwnerPasswordHash(sql, env);
    await upsertOwnerWorkspace(sql, env, passwordHash, now);
    await upsertDemoChannel(sql, env, now);
    const publishedComponents = await publishWorkspaceRegistry(sql, {
      workspaceId: env.workspaceId,
      publishedByUserId: env.ownerUserId,
      definitions: P0_CONTROLLED_REGISTRY.map((definition) => ({
        stableName: definition.name,
        kind: definition.kind,
        semanticVersion: definition.version,
        exposure: definition.exposure,
        confirmationPolicy: definition.confirmation,
        modelDescription: definition.modelDescription,
        argumentSchema: definition.parameterSchema,
        rendererKey: definition.rendererKey,
        previewProps: definition.previewProps,
        declaredDataFunctions: [...definition.declaredDataFunctions],
        declaredInteractionIntents: [...definition.declaredInteractionIntents],
        descriptorHash: definition.descriptorHash,
      })),
      now,
    });
    const agentToolComponents = publishedComponents.filter(
      (component) => component.exposure === "agent_tool",
    );
    await upsertOperatorCoworker(
      sql,
      env,
      bundle.operator,
      agentToolComponents.map((component) => component.id),
      now,
    );
    for (const component of agentToolComponents) {
      await setComponentGrant(sql, {
        id: `ucg_demo_operator_${component.stableName.toLowerCase()}`,
        componentVersionId: component.id,
        workspaceId: env.workspaceId,
        channelId: DEMO_FIXTURE_IDS.channelId,
        agentProfileId: DEMO_FIXTURE_IDS.coworkerId,
        grantedBy: env.ownerUserId,
      });
    }

    return {
      ownerUserId: env.ownerUserId,
      workspaceId: env.workspaceId,
      channelId: DEMO_FIXTURE_IDS.channelId,
      coworkerId: DEMO_FIXTURE_IDS.coworkerId,
      coworkerHandle: bundle.operator.coworker.handle,
      researchPrompt: bundle.researchDraft.prompt,
      taskTitle: bundle.taskTitle,
      modelPreset: bundle.operator.coworker.model_preset,
    };
  } finally {
    if (ownedSql) {
      await sql.end({ timeout: 5 });
    }
  }
}

export async function resetDemoFixtures(
  options: {
    env?: DemoSeedEnv;
    sql?: SqlClient;
    migrateFirst?: boolean;
    providerReset?: boolean;
  } = {},
): Promise<DemoSeedResult & { providerReset: "skipped" | "ok" | "already_clean" }> {
  const env = options.env ?? loadDemoEnv();
  const bundle = loadDemoFixtureBundle();
  const ownedSql = !options.sql;
  const sql = options.sql ?? createSql(env.databaseUrl);
  try {
    if (options.migrateFirst !== false) {
      await migrate(sql);
    }
    await clearMutableDemoChannelState(sql);
    const seeded = await seedDemoFixtures({
      env,
      sql,
      migrateFirst: false,
    });

    let providerReset: "skipped" | "ok" | "already_clean" = "skipped";
    if (options.providerReset !== false) {
      providerReset = await resetSyntheticProviderLabel({
        env,
        pinned: bundle.pinnedAccount,
        synthetic: bundle.syntheticProvider,
      });
    }

    return { ...seeded, providerReset };
  } finally {
    if (ownedSql) {
      await sql.end({ timeout: 5 });
    }
  }
}

export async function resetSyntheticProviderLabel(input: {
  env: DemoSeedEnv;
  pinned: PinnedAccountFixture;
  synthetic: SyntheticProviderFixture;
}): Promise<"ok" | "already_clean" | "skipped"> {
  const { env, pinned, synthetic } = input;
  if (!env.composioApiKey || !env.composioConnectedAccountId) {
    return "skipped";
  }
  if (!env.composioUserId) {
    throw new Error(
      "COMPOSIO_USER_ID is required for provider fixture reset with a connected account",
    );
  }
  assertProviderResetTargetAllowed({
    connectedAccountId: env.composioConnectedAccountId,
    pinned,
    synthetic,
    owner: synthetic.owner,
    repo: synthetic.repo,
    issueNumber: synthetic.issueNumber,
    label: synthetic.syntheticMarker.value,
  });

  const response = await fetch(
    `https://backend.composio.dev/api/v3.1/tools/execute/${encodeURIComponent(synthetic.resetToolSlug)}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": env.composioApiKey,
      },
      body: JSON.stringify({
        connected_account_id: env.composioConnectedAccountId,
        user_id: env.composioUserId,
        arguments: {
          owner: synthetic.owner,
          repo: synthetic.repo,
          issue_number: synthetic.issueNumber,
          name: synthetic.syntheticMarker.value,
        },
      }),
    },
  );

  const bodyText = await response.text();
  let payload: unknown = bodyText;
  try {
    payload = JSON.parse(bodyText);
  } catch {
    // keep text
  }

  if (response.ok) {
    return "ok";
  }

  const asString = typeof payload === "string" ? payload : JSON.stringify(payload);
  if (/not found|does not exist|Label does not exist|404/i.test(asString)) {
    return "already_clean";
  }
  throw new Error(`Provider fixture reset failed (${response.status}): ${asString.slice(0, 400)}`);
}

/** Test helper: timing-safe compare unused but keeps crypto import honest for future verify. */
export function passwordsEqual(a: Buffer, b: Buffer): boolean {
  if (a.length !== b.length) {
    return false;
  }
  return timingSafeEqual(a, b);
}
