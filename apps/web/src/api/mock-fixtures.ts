import {
  channelSchema,
  connectionStatusSchema,
  coworkerProfileSchema,
  sha256Schema,
  skillDraftSchema,
  skillVersionSchema,
  taskRecordV1Schema,
} from "@forgeroom/contracts";
import { DEMO_WORKSPACE_ID } from "../routes/paths";

export type ConnectionFixture = {
  schemaVersion: 1;
  id: string;
  workspace_id: string;
  provider: string;
  label: string;
  status: ReturnType<typeof connectionStatusSchema.parse>;
  descriptor_hash: ReturnType<typeof sha256Schema.parse>;
};

function parseConnectionFixture(value: ConnectionFixture): ConnectionFixture {
  if (value.schemaVersion !== 1) {
    throw new Error("connection fixture requires schemaVersion 1");
  }
  connectionStatusSchema.parse(value.status);
  sha256Schema.parse(value.descriptor_hash);
  return value;
}

export const MOCK_WORKSPACE_ID = DEMO_WORKSPACE_ID;

export const MOCK_CHANNELS = channelSchema.array().parse([
  {
    schemaVersion: 1,
    id: "ch_general_001",
    workspace_id: MOCK_WORKSPACE_ID,
    name: "General",
    mission_brief: "Primary demo channel for workspace coordination.",
    status: "active",
    next_sequence: 12,
    created_at: "2026-08-01T12:00:00+00:00",
    updated_at: "2026-08-26T12:00:00+00:00",
  },
  {
    schemaVersion: 1,
    id: "ch_ops_002",
    workspace_id: MOCK_WORKSPACE_ID,
    name: "Operations",
    mission_brief: "Operational updates and run summaries.",
    status: "active",
    next_sequence: 4,
    created_at: "2026-08-02T12:00:00+00:00",
    updated_at: "2026-08-25T12:00:00+00:00",
  },
]);

export const MOCK_COWORKERS = coworkerProfileSchema.array().parse([
  {
    schemaVersion: 1,
    id: "cw_operator_001",
    workspace_id: MOCK_WORKSPACE_ID,
    handle: "operator",
    name: "Operator",
    title: "Demo operator coworker",
    status: "active",
    native_subagents_enabled: false,
    current_version_id: "cwv_operator_v1",
    config_revision: 1,
  },
  {
    schemaVersion: 1,
    id: "cw_analyst_002",
    workspace_id: MOCK_WORKSPACE_ID,
    handle: "analyst",
    name: "Analyst",
    title: "Data review coworker",
    status: "active",
    native_subagents_enabled: false,
    current_version_id: "cwv_analyst_v1",
    config_revision: 1,
  },
]);

export const MOCK_TASKS = taskRecordV1Schema.array().parse([
  {
    schemaVersion: 1,
    id: "task_reconcile_001",
    workspace_id: MOCK_WORKSPACE_ID,
    channel_id: "ch_general_001",
    title: "Reconcile the synthetic demo record",
    description: "Publish a sandbox summary after reconciling fixture data.",
    status: "in_progress",
    assignee_type: "coworker",
    assignee_id: "cw_operator_001",
    source_message_id: "msg_seed_001",
    source_run_id: "run_seed_001",
    due_at: "2026-09-01T12:00:00+00:00",
    current_revision: 2,
    created_by_type: "human",
    created_by_id: "user_owner_001",
    created_at: "2026-08-20T12:00:00+00:00",
    updated_at: "2026-08-26T10:00:00+00:00",
  },
  {
    schemaVersion: 1,
    id: "task_review_002",
    workspace_id: MOCK_WORKSPACE_ID,
    channel_id: "ch_ops_002",
    title: "Review connector health",
    description: null,
    status: "todo",
    assignee_type: null,
    assignee_id: null,
    source_message_id: null,
    source_run_id: null,
    due_at: null,
    current_revision: 1,
    created_by_type: "human",
    created_by_id: "user_owner_001",
    created_at: "2026-08-24T12:00:00+00:00",
    updated_at: "2026-08-24T12:00:00+00:00",
  },
]);

export const MOCK_SKILL_DRAFTS = skillDraftSchema.array().parse([
  {
    schemaVersion: 1,
    id: "skill_draft_001",
    workspace_id: MOCK_WORKSPACE_ID,
    revision: 1,
    draft_hash: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    source_run_id: "run_seed_001",
    source_step_ids: ["step_seed_001"],
    source_content_hash: "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    when_to_use: "When reconciling demo records into a sandbox summary.",
    inputs: ["record_id"],
    method: ["Load fixture", "Validate fields", "Publish summary"],
    validation: "Summary artifact exists and references the reconciled record.",
    output: "Sandbox summary artifact id",
    failures: ["Missing record", "Validation mismatch"],
    required_tools: ["sandbox.publish_summary"],
    required_components: [],
    required_approvals: [],
    state: "draft",
    created_by: "user_owner_001",
    created_at: "2026-08-22T12:00:00+00:00",
  },
]);

export const MOCK_SKILL_VERSIONS = skillVersionSchema.array().parse([
  {
    schemaVersion: 1,
    id: "skill_version_001",
    skill_id: "skill_published_001",
    version: 1,
    state: "published",
    manifest_hash: "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
    content_hash: "sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
    source_run_id: "run_seed_002",
    source_step_ids: ["step_seed_002"],
    required_tools: ["sandbox.publish_summary"],
    required_components: [],
    required_approvals: [],
    created_by: "user_owner_001",
    created_at: "2026-08-10T12:00:00+00:00",
    published_at: "2026-08-11T12:00:00+00:00",
  },
]);

export const MOCK_CONNECTIONS: ConnectionFixture[] = [
  parseConnectionFixture({
    schemaVersion: 1,
    id: "conn_composio_001",
    workspace_id: MOCK_WORKSPACE_ID,
    provider: "composio",
    label: "Acting account (redacted)",
    status: "active",
    descriptor_hash: "sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
  }),
  parseConnectionFixture({
    schemaVersion: 1,
    id: "conn_trueforge_001",
    workspace_id: MOCK_WORKSPACE_ID,
    provider: "trueforge",
    label: "Sandbox runtime",
    status: "connecting",
    descriptor_hash: "sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
  }),
];

export const DEFAULT_CHANNEL_ID = MOCK_CHANNELS[0]?.id ?? "ch_general_001";

export function assertMockFixturesValid(): void {
  channelSchema.array().parse(MOCK_CHANNELS);
  coworkerProfileSchema.array().parse(MOCK_COWORKERS);
  taskRecordV1Schema.array().parse(MOCK_TASKS);
  skillDraftSchema.array().parse(MOCK_SKILL_DRAFTS);
  skillVersionSchema.array().parse(MOCK_SKILL_VERSIONS);
  for (const connection of MOCK_CONNECTIONS) {
    parseConnectionFixture(connection);
  }
}
