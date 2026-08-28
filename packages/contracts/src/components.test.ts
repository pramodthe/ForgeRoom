import { describe, expect, it } from "vitest";
import {
  actionGrantSchema,
  componentGrantCommandSchema,
  componentVersionSchema,
  dataGrantSchema,
  interpretP0ActionGrant,
  p0ControlledComponentSpecSchema,
  p0RenderManifestV1Schema,
  renderGrantSchema,
  uiInstanceReplayResponseSchema,
  uiInstanceSchema,
  uiInteractionCommitCommandSchema,
  uiInteractionResultSchema,
  uiInteractionTokenRequestSchema,
  uiInteractionTokenResponseSchema,
  uiDataFunctionCommandSchema,
} from "./components";
import { HASH, NOW } from "./test-helpers";

const limits = {
  max_render_revisions: 20,
  min_promotion_interval_ms: 500,
  max_serialized_bytes: 262_144,
  max_nodes: 150,
  max_depth: 8,
  max_text_bytes: 65_536,
  max_table_rows: 200,
  max_table_columns: 20,
  max_chart_series: 8,
  max_chart_points: 1_000,
  max_images: 1,
  max_image_pixels: 16_000_000,
  max_form_fields: 8,
  max_field_characters: 0,
  max_data_snapshots: 8,
  max_data_bytes: 1_048_576,
};

const grantBase = {
  schemaVersion: 1 as const,
  workspace_id: "ws_1",
  channel_id: "ch_1",
  surface_id: "ui_1",
  policy_revision: 7,
  issued_by: "application_policy" as const,
  expires_at: NOW,
  revoked_at: null,
  grant_scope_hash: HASH,
  created_at: NOW,
};

const actionBase = {
  ...grantBase,
  id: "uag_1",
  kind: "action" as const,
  bound_render_revision: 2,
  bound_manifest_hash: HASH,
  action_ref: "select_row",
  handler_key: "controlled_ui.select_row.v1",
  input_schema: {
    type: "object",
    additionalProperties: false,
    properties: { rowId: { type: "string" } },
    required: ["rowId"],
  },
  input_schema_hash: HASH,
  allowed_render_node_ids: ["node_7"],
  requires_recent_auth: false,
  requires_trusted_confirmation: false as const,
  max_uses: 3,
  use_count: 0,
};

describe("independent controlled-UI grants", () => {
  it("accepts only a positive registry_v1 render allowlist", () => {
    const grant = renderGrantSchema.parse({
      ...grantBase,
      id: "urg_1",
      kind: "render",
      rail: "registry_v1",
      registry_version: "registry-1",
      allowed_component_types: ["table", "chart", "form"],
      limits,
    });
    expect(grant.allowed_component_types).toEqual(["table", "chart", "form"]);

    expect(
      renderGrantSchema.safeParse({
        ...grant,
        allowed_component_types: ["table", "approval_card"],
      }).success,
    ).toBe(false);
    expect(
      renderGrantSchema.safeParse({
        ...grant,
        allowed_component_types: ["table", "table"],
      }).success,
    ).toBe(false);
    expect(renderGrantSchema.safeParse({ ...grant, rail: "iframe_v1" }).success).toBe(false);
  });

  it("binds a DataGrant to one revision, manifest and retained redacted source", () => {
    const grant = dataGrantSchema.parse({
      ...grantBase,
      id: "udg_1",
      kind: "data",
      bound_render_revision: 2,
      bound_manifest_hash: HASH,
      data_ref: "report_rows",
      source: { kind: "artifact_revision", artifact_id: "artifact_1", revision: 3 },
      classification: "workspace_safe",
      classification_provenance: "workspace connector read classified by policy-7",
      snapshot_schema_hash: HASH,
      allowed_field_paths: [
        ["rows", "id"],
        ["rows", "status"],
      ],
      max_rows: 200,
      max_bytes: 65_536,
      redaction_policy_key: "workspace-safe-v1",
      retained_snapshot_blob_key: "snapshots/sha256/fixture",
      immutable_snapshot_hash: HASH,
    });
    expect(grant.bound_render_revision).toBe(2);

    expect(
      dataGrantSchema.safeParse({
        ...grant,
        allowed_field_paths: [
          ["rows", "id"],
          ["rows", "id"],
        ],
      }).success,
    ).toBe(false);
    expect(
      dataGrantSchema.safeParse({
        ...grant,
        allowed_field_paths: [["__proto__", "polluted"]],
      }).success,
    ).toBe(false);
    expect(
      dataGrantSchema.safeParse({
        ...grant,
        source: { kind: "query_snapshot", query_key: "fixed", snapshot_id: "snap_1", url: "x" },
      }).success,
    ).toBe(false);
  });

  it("uses a closed mode union with mode-specific authority", () => {
    expect(
      actionGrantSchema.parse({
        ...actionBase,
        mode: "server_read",
        data_grant_id: "udg_1",
        data_ref: "report_rows",
        allowed_selection_paths: [["rows", "id"]],
      }).mode,
    ).toBe("server_read");
    expect(
      actionGrantSchema.parse({
        ...actionBase,
        id: "uag_2",
        mode: "complete_component_interrupt",
        component_interrupt_id: "uci_1",
      }).mode,
    ).toBe("complete_component_interrupt");

    expect(
      actionGrantSchema.safeParse({
        ...actionBase,
        mode: "local_state",
        data_grant_id: "udg_1",
      }).success,
    ).toBe(false);
    expect(
      actionGrantSchema.safeParse({
        ...actionBase,
        mode: "local_state",
        allowed_render_node_ids: ["constructor"],
      }).success,
    ).toBe(false);
    expect(
      actionGrantSchema.safeParse({
        ...actionBase,
        mode: "request_agent_turn",
        target_coworker_id: "cw_1",
      }).success,
    ).toBe(false);
    expect(
      actionGrantSchema.safeParse({
        ...actionBase,
        mode: "local_state",
        use_count: 4,
      }).success,
    ).toBe(false);
    expect(
      actionGrantSchema.safeParse({
        ...actionBase,
        mode: "local_state",
        allowed_render_node_ids: ["node_7", "node_7"],
      }).success,
    ).toBe(false);
    expect(
      actionGrantSchema.safeParse({
        ...actionBase,
        mode: "local_state",
        input_schema: null,
      }).success,
    ).toBe(false);
    expect(
      actionGrantSchema.safeParse({
        ...actionBase,
        mode: "local_state",
        input_schema: 42,
      }).success,
    ).toBe(false);
  });

  it("returns typed unsupported results for retained P1 action modes", () => {
    expect(interpretP0ActionGrant({ ...actionBase, mode: "request_agent_turn" })).toEqual({
      ok: false,
      capability: "request_agent_turn",
      reason: "unsupported_in_p0",
    });
    expect(interpretP0ActionGrant({ ...actionBase, mode: "open_existing_hitl" })).toEqual({
      ok: false,
      capability: "open_existing_hitl",
      reason: "unsupported_in_p0",
    });
    expect(interpretP0ActionGrant({ ...actionBase, mode: "local_state" }).ok).toBe(true);
    expect(interpretP0ActionGrant({ ...actionBase, mode: "unknown" })).toEqual({
      ok: false,
      capability: "action_grant",
      reason: "invalid_contract",
    });
  });
});

describe("closed P0 controlled component manifests", () => {
  it("uses the canonical chart name and never accepts privileged agent components", () => {
    const chartVersion = componentVersionSchema.parse({
      schemaVersion: 1,
      id: "componentv_chart",
      stable_name: "BarOrLineChart",
      semantic_version: "1.0.0",
      kind: "chart",
      exposure: "agent_tool",
      confirmation_policy: "none",
      model_description: "A bounded accessible bar or line chart",
      argument_schema: { type: "object" },
      renderer_key: "BarOrLineChart@1.0.0",
      preview_props: { title: "Preview" },
      descriptor_hash: HASH,
      declared_data_functions: ["series"],
      declared_interaction_intents: ["select"],
    });
    expect(chartVersion.stable_name).toBe("BarOrLineChart");
    const withoutKind: Record<string, unknown> = { ...chartVersion };
    const withoutPreview: Record<string, unknown> = { ...chartVersion };
    delete withoutKind.kind;
    delete withoutPreview.preview_props;
    expect(componentVersionSchema.safeParse(withoutKind).success).toBe(false);
    expect(componentVersionSchema.safeParse(withoutPreview).success).toBe(false);
    expect(
      componentVersionSchema.safeParse({
        schemaVersion: 1,
        id: "componentv_old",
        stable_name: "BarLineChart",
        semantic_version: "1.0.0",
        exposure: "agent_tool",
        confirmation_policy: "none",
        model_description: "Old name",
        argument_schema: {},
        renderer_key: "old",
        descriptor_hash: HASH,
        declared_data_functions: [],
        declared_interaction_intents: [],
      }).success,
    ).toBe(false);
    expect(
      componentVersionSchema.safeParse({
        schemaVersion: 1,
        id: "componentv_question",
        stable_name: "RequiredQuestionCard",
        semantic_version: "1.0.0",
        kind: "hitl",
        exposure: "server_only",
        confirmation_policy: "none",
        model_description: "Trusted question",
        argument_schema: {},
        renderer_key: "RequiredQuestionCard@1.0.0",
        descriptor_hash: HASH,
        declared_data_functions: [],
        declared_interaction_intents: [],
      }).success,
    ).toBe(false);
  });

  it("accepts only closed, data-free props for the five model-authorable components", () => {
    const chart = {
      schemaVersion: 1,
      componentName: "BarOrLineChart",
      props: {
        title: "Issues by state",
        description: null,
        chart_type: "bar",
        x_axis_label: "State",
        y_axis_label: "Issues",
        series: [{ key: "count", label: "Count" }],
        accessible_table_caption: "Issue counts by state",
      },
    };
    expect(p0ControlledComponentSpecSchema.safeParse(chart).success).toBe(true);
    expect(
      p0ControlledComponentSpecSchema.safeParse({
        ...chart,
        props: { ...chart.props, points: [{ x: "done", y: 4 }] },
      }).success,
    ).toBe(false);
    for (const [fieldId, optionId] of [
      ["__proto__", "safe-option"],
      ["safe-field", "constructor"],
    ]) {
      expect(
        p0ControlledComponentSpecSchema.safeParse({
          schemaVersion: 1,
          componentName: "ChoiceForm",
          props: {
            title: "Choose",
            description: null,
            submit_label: "Apply",
            cancel_label: "Cancel",
            fields: [
              {
                id: fieldId,
                label: "Safe choice",
                description: null,
                required: true,
                kind: "single_choice",
                options: [{ id: optionId, label: "Option", description: null }],
              },
            ],
          },
        }).success,
      ).toBe(false);
    }
    expect(
      p0ControlledComponentSpecSchema.safeParse({
        schemaVersion: 1,
        componentName: "ApprovalCard",
        props: {},
      }).success,
    ).toBe(false);
    expect(
      p0ControlledComponentSpecSchema.safeParse({
        schemaVersion: 1,
        componentName: "ChoiceForm",
        props: {
          title: "Choose",
          description: null,
          submit_label: "Apply",
          cancel_label: "Cancel",
          fields: [
            {
              id: "secret",
              label: "Password",
              description: null,
              required: true,
              kind: "password",
            },
          ],
        },
      }).success,
    ).toBe(false);
  });

  it("pins every registry render hash and rejects iframe-only fields", () => {
    const manifest = p0RenderManifestV1Schema.parse({
      schemaVersion: 1,
      surfaceId: "ui_1",
      renderRevision: 2,
      baseRenderRevision: 1,
      rail: "registry_v1",
      renderGrantScopeSha256: HASH,
      registryVersion: "registry-1",
      buildProfile: null,
      renderPayloadSha256: HASH,
      renderNodeSetSha256: HASH,
      stateSchemaSha256: HASH,
      behaviorManifestSha256: HASH,
      interactionManifestSha256: HASH,
      dataBindingManifestSha256: HASH,
      argumentSchemaSha256: HASH,
      validatedArgsSha256: HASH,
      dataSnapshotManifestSha256: HASH,
      componentDescriptorSha256: HASH,
      sourceSha256: null,
      rendererProfileSha256: HASH,
      sanitizerPolicySha256: null,
      bootstrapSha256: null,
      cspSha256: null,
      deliveryHeadersSha256: null,
    });
    expect(manifest.registryVersion).toBe("registry-1");
    expect(p0RenderManifestV1Schema.safeParse({ ...manifest, sourceSha256: HASH }).success).toBe(
      false,
    );
    expect(
      p0RenderManifestV1Schema.safeParse({
        ...manifest,
        baseRenderRevision: manifest.renderRevision,
      }).success,
    ).toBe(false);
  });
});

describe("UIInstance replay and interactions", () => {
  const readyInstance = {
    schemaVersion: 1,
    id: "ui_1",
    workspace_id: "ws_1",
    channel_id: "ch_1",
    run_id: "run_1",
    run_step_id: "step_1",
    agent_turn_id: "turn_1",
    logical_thread_id: "thread_1",
    tool_call_id: "toolcall_1",
    activity_message_id: "msg_1",
    source_event_id: "event_1",
    creator_agent_id: "cw_1",
    title: "Issue state",
    component_version_id: "componentv_chart",
    component_name: "BarOrLineChart",
    component_semantic_version: "1.0.0",
    component_descriptor_hash: HASH,
    renderer_key: "BarOrLineChart@1.0.0",
    renderer_profile_hash: HASH,
    rail: "registry_v1",
    render_grant_id: "urg_1",
    data_grant_ids: ["udg_1"],
    action_grant_ids: ["uag_1"],
    status: "ready",
    current_render_revision: 2,
    last_good_render_revision: 2,
    current_state_revision: 4,
    render_manifest_hash: HASH,
    validated_props_hash: HASH,
    scoped_state_hash: HASH,
    text_alternative: "Four open and two completed issues.",
    replaces_ui_instance_id: null,
    interaction_enabled: true,
    created_at: NOW,
    updated_at: NOW,
    ready_at: NOW,
    quarantined_at: null,
  };

  it("requires complete replay lineage before an instance can be ready", () => {
    expect(uiInstanceSchema.safeParse(readyInstance).success).toBe(true);
    expect(
      uiInstanceSchema.safeParse({ ...readyInstance, render_manifest_hash: null }).success,
    ).toBe(false);
    expect(
      uiInstanceSchema.safeParse({ ...readyInstance, last_good_render_revision: 1 }).success,
    ).toBe(false);
    expect(
      uiInstanceSchema.safeParse({ ...readyInstance, component_name: "ApprovalCard" }).success,
    ).toBe(false);
    expect(
      uiInstanceSchema.safeParse({
        ...readyInstance,
        status: "revoked",
        interaction_enabled: true,
      }).success,
    ).toBe(false);
    expect(
      uiInstanceSchema.safeParse({
        ...readyInstance,
        status: "closed",
        interaction_enabled: false,
        quarantined_at: NOW,
      }).success,
    ).toBe(true);

    const buildingInstance = {
      ...readyInstance,
      status: "building",
      current_render_revision: null,
      last_good_render_revision: null,
      current_state_revision: null,
      render_manifest_hash: null,
      validated_props_hash: null,
      scoped_state_hash: null,
      interaction_enabled: false,
      ready_at: null,
    };
    expect(uiInstanceSchema.safeParse(buildingInstance).success).toBe(true);
    expect(
      uiInstanceSchema.safeParse({
        ...buildingInstance,
        current_state_revision: 0,
        scoped_state_hash: HASH,
      }).success,
    ).toBe(false);
  });

  it("exposes a closed camelCase replay projection without server-only grant fields", () => {
    const replay = {
      request_id: "req_1",
      schemaVersion: 1,
      instanceId: "ui_1",
      workspaceId: "ws_1",
      channelId: "ch_1",
      runId: "run_1",
      runStepId: "step_1",
      agentTurnId: "turn_1",
      logicalThreadId: "thread_1",
      componentVersionId: "componentv_chart",
      componentName: "BarOrLineChart",
      componentVersion: "1.0.0",
      componentDescriptorHash: HASH,
      rendererKey: "BarOrLineChart@1.0.0",
      rendererProfileHash: HASH,
      rail: "registry_v1",
      status: "ready",
      renderRevision: 2,
      lastGoodRenderRevision: 2,
      baseRenderRevision: 1,
      stateRevision: 4,
      baseStateRevision: 3,
      renderManifestHash: HASH,
      validatedPropsHash: HASH,
      scopedStateHash: HASH,
      validatedProps: { title: "Issue state" },
      scopedState: { selectedRowId: "row_1" },
      textAlternative: "Four open and two completed issues.",
      interactionEnabled: true,
      renderGrant: {
        id: "urg_1",
        rail: "registry_v1",
        registryVersion: "registry-1",
        allowedComponentTypes: ["chart", "table"],
        policyRevision: 7,
        grantScopeHash: HASH,
        expiresAt: NOW,
        revoked: false,
      },
      dataGrants: [
        {
          id: "udg_1",
          boundRenderRevision: 2,
          boundManifestHash: HASH,
          dataRef: "report_rows",
          source: {
            kind: "artifactRevision",
            artifactId: "artifact_1",
            revision: 3,
            contentHash: HASH,
          },
          classification: "workspace_safe",
          snapshotSchemaHash: HASH,
          allowedFieldPaths: [["rows", "id"]],
          maxRows: 200,
          maxBytes: 65_536,
          immutableSnapshotHash: HASH,
          expiresAt: NOW,
          revoked: false,
        },
      ],
      actionGrants: [
        {
          id: "uag_1",
          mode: "local_state",
          boundRenderRevision: 2,
          boundManifestHash: HASH,
          actionRef: "select_row",
          inputSchemaHash: HASH,
          allowedRenderNodeIds: ["node_7"],
          requiresRecentAuth: false,
          maxUses: 3,
          useCount: 0,
          expiresAt: NOW,
          revoked: false,
        },
      ],
      sourceRefs: [
        {
          kind: "artifactRevision",
          artifactId: "artifact_1",
          revision: 3,
          contentHash: HASH,
        },
      ],
      lastChannelSequence: 12,
      createdAt: NOW,
      updatedAt: NOW,
    };

    expect(uiInstanceReplayResponseSchema.safeParse(replay).success).toBe(true);
    expect(
      uiInstanceReplayResponseSchema.safeParse({ ...replay, workspace_id: "ws_leak" }).success,
    ).toBe(false);
    expect(
      uiInstanceReplayResponseSchema.safeParse({
        ...replay,
        dataGrants: [
          {
            ...replay.dataGrants[0],
            retained_snapshot_blob_key: "server-only/blob-key",
          },
        ],
      }).success,
    ).toBe(false);
    expect(
      uiInstanceReplayResponseSchema.safeParse({
        ...replay,
        actionGrants: [{ ...replay.actionGrants[0], interactionToken: "must-not-leak" }],
      }).success,
    ).toBe(false);
    expect(
      uiInstanceReplayResponseSchema.safeParse({
        ...replay,
        renderGrant: { ...replay.renderGrant, revoked: true },
      }).success,
    ).toBe(false);
  });

  it("derives action mode server-side and uses a nullable expected state revision", () => {
    const request = {
      schemaVersion: 1,
      surfaceId: "ui_1",
      renderNodeId: "node_7",
      renderRevision: 2,
      expectedStateRevision: null,
      actionGrantId: "uag_1",
      actionRef: "select_row",
      input: { rowId: "row_1" },
      clientKind: "registry",
      idempotencyKey: "interaction-test-1",
    };
    expect(uiInteractionTokenRequestSchema.safeParse(request).success).toBe(true);
    expect(
      uiInteractionTokenRequestSchema.safeParse({ ...request, renderNodeId: "constructor" })
        .success,
    ).toBe(false);
    expect(
      uiInteractionTokenRequestSchema.safeParse({
        ...request,
        actionMode: "complete_component_interrupt",
      }).success,
    ).toBe(false);
    expect(
      uiInteractionTokenResponseSchema.safeParse({
        request_id: "req_1",
        interactionId: "interaction_1",
        state: "token_issued",
        interactionToken: "a".repeat(48),
        expiresAt: NOW,
      }).success,
    ).toBe(true);
    expect(
      uiInteractionTokenResponseSchema.safeParse({
        request_id: "req_1",
        schemaVersion: 1,
        interactionId: "interaction_1",
        state: "token_issued",
        interactionToken: "a".repeat(48),
        expiresAt: NOW,
      }).success,
    ).toBe(false);
    expect(
      uiInteractionCommitCommandSchema.safeParse({
        schemaVersion: 1,
        interactionId: "interaction_1",
        interactionToken: "a".repeat(48),
        actionGrantId: "uag_attacker_selected",
      }).success,
    ).toBe(false);
    const interactionResult = {
      request_id: "req_1",
      schemaVersion: 1,
      interactionId: "interaction_1",
      state: "succeeded",
      result: { selectedRowId: "row_1" },
      resultRef: null,
      renderRevision: 2,
      stateRevision: 5,
    };
    expect(uiInteractionResultSchema.safeParse(interactionResult).success).toBe(true);
    const missingRequestId = Object.fromEntries(
      Object.entries(interactionResult).filter(([key]) => key !== "request_id"),
    );
    expect(uiInteractionResultSchema.safeParse(missingRequestId).success).toBe(false);
  });

  it("uses closed component-grant and bounded data-function commands", () => {
    expect(
      componentGrantCommandSchema.parse({
        granted: true,
        expected_component_version: "1.0.0",
        expected_descriptor_hash: HASH,
      }).granted,
    ).toBe(true);
    expect(
      componentGrantCommandSchema.safeParse({
        schemaVersion: 1,
        granted: true,
        expected_component_version: "1.0.0",
        expected_descriptor_hash: HASH,
        idempotency_key: "body-idempotency-is-not-canonical",
      }).success,
    ).toBe(false);
    expect(
      uiDataFunctionCommandSchema.parse({
        schemaVersion: 1,
        renderRevision: 2,
        dataGrantId: "udg_1",
        expectedManifestHash: HASH,
        arguments: { page: 1 },
      }).renderRevision,
    ).toBe(2);
    expect(
      uiDataFunctionCommandSchema.safeParse({
        schemaVersion: 1,
        renderRevision: 2,
        dataGrantId: "udg_1",
        expectedManifestHash: HASH,
        arguments: { refresh_token: "must-not-enter-read-command" },
      }).success,
    ).toBe(false);
  });
});
