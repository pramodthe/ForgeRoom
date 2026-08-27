-- Short-lived Composio reconnect intents shared across API instances.
CREATE TABLE connection_reconnect_intents (
  id text PRIMARY KEY,
  workspace_id text NOT NULL REFERENCES workspaces (id),
  connection_id text NOT NULL REFERENCES connector_bindings (id),
  actor_user_id text NOT NULL REFERENCES users (id),
  idempotency_key text NOT NULL,
  expected_connected_account_id text NOT NULL,
  redirect_url text NOT NULL,
  expires_at timestamptz NOT NULL,
  provisional_connected_account_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT connection_reconnect_intents_idempotency_uidx
    UNIQUE (workspace_id, connection_id, actor_user_id, idempotency_key)
);

CREATE INDEX connection_reconnect_intents_active_idx
  ON connection_reconnect_intents (workspace_id, connection_id, expires_at DESC);
