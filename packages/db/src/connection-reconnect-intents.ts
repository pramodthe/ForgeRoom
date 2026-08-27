import type { createSql } from "./client";

type SqlClient = ReturnType<typeof createSql>;

export type StoredReconnectIntent = {
  intentId: string;
  connectionId: string;
  workspaceId: string;
  actorUserId: string;
  idempotencyKey: string;
  expectedConnectedAccountId: string;
  redirectUrl: string;
  expiresAt: string;
  provisionalConnectedAccountId: string | null;
  createdAt: string;
};

type IntentRow = {
  id: string;
  workspace_id: string;
  connection_id: string;
  actor_user_id: string;
  idempotency_key: string;
  expected_connected_account_id: string;
  redirect_url: string;
  expires_at: string | Date;
  provisional_connected_account_id: string | null;
  created_at: string | Date;
};

function toIso(value: string | Date): string {
  if (value instanceof Date) {
    return value.toISOString();
  }
  const parsed = Date.parse(value);
  if (Number.isFinite(parsed)) {
    return new Date(parsed).toISOString();
  }
  return value;
}

function rowToIntent(row: IntentRow): StoredReconnectIntent {
  return {
    intentId: row.id,
    connectionId: row.connection_id,
    workspaceId: row.workspace_id,
    actorUserId: row.actor_user_id,
    idempotencyKey: row.idempotency_key,
    expectedConnectedAccountId: row.expected_connected_account_id,
    redirectUrl: row.redirect_url,
    expiresAt: toIso(row.expires_at),
    provisionalConnectedAccountId: row.provisional_connected_account_id,
    createdAt: toIso(row.created_at),
  };
}

export async function deleteExpiredConnectionReconnectIntents(
  sql: SqlClient,
  now?: string,
): Promise<number> {
  const cutoff = now ?? new Date().toISOString();
  const deleted = await sql`
    DELETE FROM connection_reconnect_intents
    WHERE expires_at <= ${cutoff}
    RETURNING id
  `;
  return deleted.length;
}

export async function findReconnectIntentByIdempotencyKey(
  sql: SqlClient,
  input: {
    workspaceId: string;
    connectionId: string;
    actorUserId: string;
    idempotencyKey: string;
  },
): Promise<StoredReconnectIntent | null> {
  const rows = await sql<IntentRow[]>`
    SELECT
      id,
      workspace_id,
      connection_id,
      actor_user_id,
      idempotency_key,
      expected_connected_account_id,
      redirect_url,
      expires_at,
      provisional_connected_account_id,
      created_at
    FROM connection_reconnect_intents
    WHERE workspace_id = ${input.workspaceId}
      AND connection_id = ${input.connectionId}
      AND actor_user_id = ${input.actorUserId}
      AND idempotency_key = ${input.idempotencyKey}
    LIMIT 1
  `;
  const row = rows[0];
  return row ? rowToIntent(row) : null;
}

export async function findActiveReconnectIntentForActor(
  sql: SqlClient,
  input: {
    workspaceId: string;
    connectionId: string;
    actorUserId: string;
    now?: string;
  },
): Promise<StoredReconnectIntent | null> {
  const now = input.now ?? new Date().toISOString();
  const rows = await sql<IntentRow[]>`
    SELECT
      id,
      workspace_id,
      connection_id,
      actor_user_id,
      idempotency_key,
      expected_connected_account_id,
      redirect_url,
      expires_at,
      provisional_connected_account_id,
      created_at
    FROM connection_reconnect_intents
    WHERE workspace_id = ${input.workspaceId}
      AND connection_id = ${input.connectionId}
      AND actor_user_id = ${input.actorUserId}
      AND expires_at > ${now}
    ORDER BY created_at DESC
    LIMIT 1
  `;
  const row = rows[0];
  return row ? rowToIntent(row) : null;
}

export async function findLatestReconnectIntentForConnection(
  sql: SqlClient,
  input: {
    workspaceId: string;
    connectionId: string;
    now?: string;
  },
): Promise<StoredReconnectIntent | null> {
  const now = input.now ?? new Date().toISOString();
  const rows = await sql<IntentRow[]>`
    SELECT
      id,
      workspace_id,
      connection_id,
      actor_user_id,
      idempotency_key,
      expected_connected_account_id,
      redirect_url,
      expires_at,
      provisional_connected_account_id,
      created_at
    FROM connection_reconnect_intents
    WHERE workspace_id = ${input.workspaceId}
      AND connection_id = ${input.connectionId}
      AND expires_at > ${now}
    ORDER BY created_at DESC
    LIMIT 1
  `;
  const row = rows[0];
  return row ? rowToIntent(row) : null;
}

export async function saveConnectionReconnectIntent(
  sql: SqlClient,
  input: StoredReconnectIntent,
): Promise<StoredReconnectIntent> {
  await sql`
    INSERT INTO connection_reconnect_intents (
      id,
      workspace_id,
      connection_id,
      actor_user_id,
      idempotency_key,
      expected_connected_account_id,
      redirect_url,
      expires_at,
      provisional_connected_account_id,
      created_at
    )
    VALUES (
      ${input.intentId},
      ${input.workspaceId},
      ${input.connectionId},
      ${input.actorUserId},
      ${input.idempotencyKey},
      ${input.expectedConnectedAccountId},
      ${input.redirectUrl},
      ${input.expiresAt},
      ${input.provisionalConnectedAccountId},
      ${input.createdAt}
    )
    ON CONFLICT (workspace_id, connection_id, actor_user_id, idempotency_key) DO NOTHING
  `;
  const loaded = await findReconnectIntentByIdempotencyKey(sql, {
    workspaceId: input.workspaceId,
    connectionId: input.connectionId,
    actorUserId: input.actorUserId,
    idempotencyKey: input.idempotencyKey,
  });
  if (!loaded) {
    throw new Error("Failed to load reconnect intent after save");
  }
  return loaded;
}
