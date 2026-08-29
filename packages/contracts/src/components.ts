import { z } from "zod";
import {
  isoDateTimeSchema,
  nonNegativeIntSchema,
  opaqueIdSchema,
  safeJsonObjectSchema,
  safeJsonValueSchema,
  schemaVersion1,
  sha256Schema,
} from "./primitives";
import { interpretP0Capability, unsupportedCapability } from "./unsupported";

export const p0UiRailSchema = z.literal("registry_v1");
export const p0RegistryVersionSchema = z.literal("registry-1");
export const componentExposureSchema = z.enum(["agent_tool", "server_only"]);
export const confirmationPolicySchema = z.enum(["none", "trusted_host"]);

export const p0AgentToolComponentNameSchema = z.enum([
  "DataTable",
  "BarOrLineChart",
  "TaskCard",
  "ArtifactCard",
  "ChoiceForm",
]);

export const p0ServerOnlyComponentNameSchema = z.enum([
  "ApprovalCard",
  "RequiredQuestionCard",
  "ConnectionCard",
]);

export const p0ComponentNameSchema = z.union([
  p0AgentToolComponentNameSchema,
  p0ServerOnlyComponentNameSchema,
]);

export const componentKindSchema = z.enum([
  "metric",
  "table",
  "chart",
  "graph",
  "timeline",
  "image",
  "report",
  "form",
  "hitl",
  "composite",
]);

export const uiInstanceStatusSchema = z.enum([
  "building",
  "ready",
  "degraded",
  "failed",
  "revoked",
  "closed",
]);

export const actionGrantModeSchema = z.enum([
  "local_state",
  "server_read",
  "complete_component_interrupt",
]);

export const uiClientKindSchema = z.literal("registry");

const uniqueStringsSchema = z.array(z.string().min(1)).superRefine((values, ctx) => {
  if (new Set(values).size !== values.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "values must be unique" });
  }
});

const componentKindByName: Record<
  z.infer<typeof p0ComponentNameSchema>,
  z.infer<typeof componentKindSchema>
> = {
  DataTable: "table",
  BarOrLineChart: "chart",
  TaskCard: "report",
  ArtifactCard: "report",
  ChoiceForm: "form",
  ApprovalCard: "hitl",
  RequiredQuestionCard: "hitl",
  ConnectionCard: "hitl",
};

export const componentVersionSchema = z
  .object({
    schemaVersion: schemaVersion1,
    id: opaqueIdSchema,
    stable_name: p0ComponentNameSchema,
    semantic_version: z.string().min(1),
    kind: componentKindSchema,
    exposure: componentExposureSchema,
    confirmation_policy: confirmationPolicySchema,
    model_description: z.string().min(1),
    argument_schema: safeJsonObjectSchema,
    renderer_key: z.string().min(1),
    preview_props: safeJsonObjectSchema,
    descriptor_hash: sha256Schema,
    declared_data_functions: uniqueStringsSchema,
    declared_interaction_intents: uniqueStringsSchema,
  })
  .strict()
  .superRefine((value, ctx) => {
    const agentTool = p0AgentToolComponentNameSchema.safeParse(value.stable_name).success;
    const expectedKind = componentKindByName[value.stable_name];

    if (agentTool && value.exposure !== "agent_tool") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "agent-tool components must use agent_tool exposure",
      });
    }
    if (agentTool && value.confirmation_policy !== "none") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "P0 agent-tool components must use the none confirmation policy",
      });
    }
    if (!agentTool && value.exposure !== "server_only") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "approval/question/connection cards must be server_only",
      });
    }
    if (!agentTool && value.confirmation_policy !== "trusted_host") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "server-only components must use trusted_host confirmation",
      });
    }
    if (value.kind !== expectedKind) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${value.stable_name} must use component kind ${expectedKind}`,
        path: ["kind"],
      });
    }
  });

/** Registry node types needed by the five reviewed P0 renderers. */
export const p0RegistryComponentTypeSchema = z.enum([
  "stack",
  "grid",
  "card",
  "section",
  "tabs",
  "text",
  "heading",
  "badge",
  "callout",
  "divider",
  "table",
  "chart",
  "image",
  "form",
  "button",
  "choice",
  "filter",
  "pagination",
  "artifact_link",
  "source_list",
]);

export const p0UiLimitsSchema = z
  .object({
    max_render_revisions: nonNegativeIntSchema,
    min_promotion_interval_ms: nonNegativeIntSchema,
    max_serialized_bytes: nonNegativeIntSchema,
    max_nodes: nonNegativeIntSchema,
    max_depth: nonNegativeIntSchema,
    max_text_bytes: nonNegativeIntSchema,
    max_table_rows: nonNegativeIntSchema,
    max_table_columns: nonNegativeIntSchema,
    max_chart_series: nonNegativeIntSchema,
    max_chart_points: nonNegativeIntSchema,
    max_images: nonNegativeIntSchema,
    max_image_pixels: nonNegativeIntSchema,
    max_form_fields: nonNegativeIntSchema,
    max_field_characters: nonNegativeIntSchema,
    max_data_snapshots: nonNegativeIntSchema,
    max_data_bytes: nonNegativeIntSchema,
  })
  .strict();

const grantBaseShape = {
  schemaVersion: schemaVersion1,
  id: opaqueIdSchema,
  workspace_id: opaqueIdSchema,
  channel_id: opaqueIdSchema,
  surface_id: opaqueIdSchema,
  policy_revision: nonNegativeIntSchema,
  issued_by: z.literal("application_policy"),
  expires_at: isoDateTimeSchema,
  revoked_at: isoDateTimeSchema.nullable(),
  grant_scope_hash: sha256Schema,
  created_at: isoDateTimeSchema,
};

export const renderGrantSchema = z
  .object({
    ...grantBaseShape,
    kind: z.literal("render"),
    rail: p0UiRailSchema,
    registry_version: p0RegistryVersionSchema,
    allowed_component_types: z.array(p0RegistryComponentTypeSchema).min(1),
    limits: p0UiLimitsSchema,
  })
  .strict()
  .superRefine((value, ctx) => {
    if (new Set(value.allowed_component_types).size !== value.allowed_component_types.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "allowed_component_types must be a unique positive allowlist",
        path: ["allowed_component_types"],
      });
    }
  });

const safePathSegmentSchema = z
  .string()
  .min(1)
  .max(128)
  .refine(
    (value) => !["__proto__", "prototype", "constructor"].includes(value.toLowerCase()),
    "prototype path segments are forbidden",
  );

export const literalFieldPathSchema = z.array(safePathSegmentSchema).min(1).max(32);

function addDuplicatePathIssue(paths: string[][], ctx: z.RefinementCtx): void {
  const keys = paths.map((path) => JSON.stringify(path));
  if (new Set(keys).size !== keys.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "field paths must be unique" });
  }
}

const dataGrantSourceSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("artifact_revision"),
      artifact_id: opaqueIdSchema,
      revision: z.number().int().positive(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("query_snapshot"),
      query_key: z.string().min(1),
      snapshot_id: opaqueIdSchema,
    })
    .strict(),
  z.object({ kind: z.literal("run_output"), run_event_id: opaqueIdSchema }).strict(),
]);

export const dataGrantSchema = z
  .object({
    ...grantBaseShape,
    kind: z.literal("data"),
    bound_render_revision: nonNegativeIntSchema,
    bound_manifest_hash: sha256Schema,
    data_ref: z.string().min(1),
    source: dataGrantSourceSchema,
    classification: z.enum(["synthetic", "public", "workspace_safe"]),
    classification_provenance: z.string().min(1),
    snapshot_schema_hash: sha256Schema,
    allowed_field_paths: z.array(literalFieldPathSchema).min(1),
    max_rows: nonNegativeIntSchema,
    max_bytes: nonNegativeIntSchema,
    max_time_ms: z.number().int().positive().default(1_000),
    redaction_policy_key: z.string().min(1),
    retained_snapshot_blob_key: z.string().min(1),
    immutable_snapshot_hash: sha256Schema,
  })
  .strict()
  .superRefine((value, ctx) => addDuplicatePathIssue(value.allowed_field_paths, ctx));

const actionGrantCommonShape = {
  ...grantBaseShape,
  kind: z.literal("action"),
  bound_render_revision: nonNegativeIntSchema,
  bound_manifest_hash: sha256Schema,
  action_ref: z.string().min(1),
  handler_key: z.string().min(1),
  input_schema: safeJsonObjectSchema,
  input_schema_hash: sha256Schema,
  allowed_render_node_ids: z.array(safePathSegmentSchema).min(1),
  requires_recent_auth: z.boolean(),
  requires_trusted_confirmation: z.literal(false),
  max_uses: z.number().int().positive(),
  use_count: nonNegativeIntSchema,
};

const localStateActionGrantSchema = z
  .object({ ...actionGrantCommonShape, mode: z.literal("local_state") })
  .strict();

const serverReadActionGrantSchema = z
  .object({
    ...actionGrantCommonShape,
    mode: z.literal("server_read"),
    data_grant_id: opaqueIdSchema,
    data_ref: z.string().min(1),
    allowed_selection_paths: z.array(literalFieldPathSchema),
  })
  .strict();

const completeComponentInterruptActionGrantSchema = z
  .object({
    ...actionGrantCommonShape,
    mode: z.literal("complete_component_interrupt"),
    component_interrupt_id: opaqueIdSchema,
  })
  .strict();

export const actionGrantSchema = z
  .discriminatedUnion("mode", [
    localStateActionGrantSchema,
    serverReadActionGrantSchema,
    completeComponentInterruptActionGrantSchema,
  ])
  .superRefine((value, ctx) => {
    if (new Set(value.allowed_render_node_ids).size !== value.allowed_render_node_ids.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "allowed_render_node_ids must be unique",
        path: ["allowed_render_node_ids"],
      });
    }
    if (value.use_count > value.max_uses) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "use_count cannot exceed max_uses",
        path: ["use_count"],
      });
    }
    if (value.mode === "server_read") {
      addDuplicatePathIssue(value.allowed_selection_paths, ctx);
    }
  });

export type InvalidActionGrantResult = {
  ok: false;
  capability: "action_grant";
  reason: "invalid_contract";
};

/**
 * Interpret an ActionGrant at the P0 boundary without collapsing known P1 modes
 * into an opaque validation error.
 */
export function interpretP0ActionGrant(input: unknown) {
  const mode =
    typeof input === "object" && input !== null && "mode" in input
      ? (input as { mode?: unknown }).mode
      : undefined;

  if (mode === "request_agent_turn" || mode === "open_existing_hitl") {
    return unsupportedCapability(mode);
  }

  const parsed = actionGrantSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false as const,
      capability: "action_grant" as const,
      reason: "invalid_contract" as const,
    } satisfies InvalidActionGrantResult;
  }
  return { ok: true as const, grant: parsed.data };
}

const boundedLabelSchema = z.string().min(1).max(256);
const optionalDescriptionSchema = z.string().max(2_000).nullable();

export const dataTablePropsSchema = z
  .object({
    caption: boundedLabelSchema,
    description: optionalDescriptionSchema,
    empty_text: boundedLabelSchema,
    columns: z
      .array(
        z
          .object({
            key: safePathSegmentSchema,
            label: boundedLabelSchema,
            align: z.enum(["start", "center", "end"]),
          })
          .strict(),
      )
      .min(1),
  })
  .strict();

export const barOrLineChartPropsSchema = z
  .object({
    title: boundedLabelSchema,
    description: optionalDescriptionSchema,
    chart_type: z.enum(["bar", "line"]),
    x_axis_label: boundedLabelSchema,
    y_axis_label: boundedLabelSchema,
    series: z
      .array(z.object({ key: safePathSegmentSchema, label: boundedLabelSchema }).strict())
      .min(1),
    accessible_table_caption: boundedLabelSchema,
  })
  .strict();

export const taskCardPropsSchema = z
  .object({
    heading: boundedLabelSchema,
    show_description: z.boolean(),
    show_assignee: z.boolean(),
    show_due_date: z.boolean(),
    show_history: z.boolean(),
  })
  .strict();

export const artifactCardPropsSchema = z
  .object({
    heading: boundedLabelSchema,
    show_preview: z.boolean(),
    show_source: z.boolean(),
    download_label: boundedLabelSchema,
  })
  .strict();

const choiceOptionSchema = z
  .object({
    id: safePathSegmentSchema,
    label: boundedLabelSchema,
    description: optionalDescriptionSchema,
  })
  .strict();

const choiceFieldCommonShape = {
  id: safePathSegmentSchema,
  label: boundedLabelSchema,
  description: optionalDescriptionSchema,
  required: z.boolean(),
};

const choiceFieldSchema = z.discriminatedUnion("kind", [
  z
    .object({
      ...choiceFieldCommonShape,
      kind: z.literal("number"),
      minimum: z.number().finite().nullable(),
      maximum: z.number().finite().nullable(),
      step: z.number().finite().positive().nullable(),
    })
    .strict(),
  z
    .object({
      ...choiceFieldCommonShape,
      kind: z.literal("date"),
      minimum: z.string().date().nullable(),
      maximum: z.string().date().nullable(),
    })
    .strict(),
  z
    .object({
      ...choiceFieldCommonShape,
      kind: z.literal("single_choice"),
      options: z.array(choiceOptionSchema).min(1),
    })
    .strict(),
  z
    .object({
      ...choiceFieldCommonShape,
      kind: z.literal("multiple_choice"),
      options: z.array(choiceOptionSchema).min(1),
      max_selections: z.number().int().positive(),
    })
    .strict(),
  z.object({ ...choiceFieldCommonShape, kind: z.literal("checkbox") }).strict(),
  z
    .object({
      ...choiceFieldCommonShape,
      kind: z.literal("display"),
      value: z.string().max(2_000),
      required: z.literal(false),
    })
    .strict(),
]);

export const choiceFormPropsSchema = z
  .object({
    title: boundedLabelSchema,
    description: optionalDescriptionSchema,
    submit_label: boundedLabelSchema,
    cancel_label: boundedLabelSchema,
    fields: z.array(choiceFieldSchema).min(1).max(50),
  })
  .strict()
  .superRefine((value, ctx) => {
    const fieldIds = value.fields.map((field) => field.id);
    if (new Set(fieldIds).size !== fieldIds.length) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "field ids must be unique" });
    }
    for (const [fieldIndex, field] of value.fields.entries()) {
      if (field.kind === "number") {
        if (field.minimum !== null && field.maximum !== null && field.minimum > field.maximum) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "minimum cannot exceed maximum",
            path: ["fields", fieldIndex],
          });
        }
        continue;
      }
      if (field.kind === "date") {
        if (field.minimum !== null && field.maximum !== null && field.minimum > field.maximum) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "minimum cannot exceed maximum",
            path: ["fields", fieldIndex],
          });
        }
        continue;
      }
      if (field.kind !== "single_choice" && field.kind !== "multiple_choice") {
        continue;
      }
      const optionIds = field.options.map((option) => option.id);
      if (new Set(optionIds).size !== optionIds.length) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "option ids must be unique within a field",
          path: ["fields", fieldIndex, "options"],
        });
      }
      if (field.kind === "multiple_choice" && field.max_selections > field.options.length) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "max_selections cannot exceed the number of options",
          path: ["fields", fieldIndex, "max_selections"],
        });
      }
    }
  });

export const p0ControlledComponentSpecSchema = z.discriminatedUnion("componentName", [
  z
    .object({
      schemaVersion: schemaVersion1,
      componentName: z.literal("DataTable"),
      props: dataTablePropsSchema,
    })
    .strict(),
  z
    .object({
      schemaVersion: schemaVersion1,
      componentName: z.literal("BarOrLineChart"),
      props: barOrLineChartPropsSchema,
    })
    .strict(),
  z
    .object({
      schemaVersion: schemaVersion1,
      componentName: z.literal("TaskCard"),
      props: taskCardPropsSchema,
    })
    .strict(),
  z
    .object({
      schemaVersion: schemaVersion1,
      componentName: z.literal("ArtifactCard"),
      props: artifactCardPropsSchema,
    })
    .strict(),
  z
    .object({
      schemaVersion: schemaVersion1,
      componentName: z.literal("ChoiceForm"),
      props: choiceFormPropsSchema,
    })
    .strict(),
]);

/** Canonical registry_v1 render-manifest hash bindings used for promotion/replay. */
export const p0RenderManifestV1Schema = z
  .object({
    schemaVersion: schemaVersion1,
    surfaceId: opaqueIdSchema,
    renderRevision: nonNegativeIntSchema,
    baseRenderRevision: nonNegativeIntSchema.nullable(),
    rail: p0UiRailSchema,
    renderGrantScopeSha256: sha256Schema,
    registryVersion: p0RegistryVersionSchema,
    buildProfile: z.null(),
    renderPayloadSha256: sha256Schema,
    renderNodeSetSha256: sha256Schema,
    stateSchemaSha256: sha256Schema,
    behaviorManifestSha256: sha256Schema,
    interactionManifestSha256: sha256Schema,
    dataBindingManifestSha256: sha256Schema,
    argumentSchemaSha256: sha256Schema,
    validatedArgsSha256: sha256Schema,
    dataSnapshotManifestSha256: sha256Schema,
    componentDescriptorSha256: sha256Schema,
    sourceSha256: z.null(),
    rendererProfileSha256: sha256Schema,
    sanitizerPolicySha256: z.null(),
    bootstrapSha256: z.null(),
    cspSha256: z.null(),
    deliveryHeadersSha256: z.null(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.baseRenderRevision !== null && value.baseRenderRevision >= value.renderRevision) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "baseRenderRevision must precede renderRevision",
        path: ["baseRenderRevision"],
      });
    }
  });

export const uiInstanceSchema = z
  .object({
    schemaVersion: schemaVersion1,
    id: opaqueIdSchema,
    workspace_id: opaqueIdSchema,
    channel_id: opaqueIdSchema,
    run_id: opaqueIdSchema,
    run_step_id: opaqueIdSchema,
    agent_turn_id: opaqueIdSchema,
    logical_thread_id: opaqueIdSchema,
    tool_call_id: opaqueIdSchema,
    activity_message_id: opaqueIdSchema,
    source_event_id: opaqueIdSchema,
    creator_agent_id: opaqueIdSchema,
    title: z.string().min(1),
    component_version_id: opaqueIdSchema,
    component_name: p0AgentToolComponentNameSchema,
    component_semantic_version: z.string().min(1),
    component_descriptor_hash: sha256Schema,
    renderer_key: z.string().min(1),
    renderer_profile_hash: sha256Schema,
    rail: p0UiRailSchema,
    render_grant_id: opaqueIdSchema,
    data_grant_ids: z.array(opaqueIdSchema),
    action_grant_ids: z.array(opaqueIdSchema),
    status: uiInstanceStatusSchema,
    current_render_revision: nonNegativeIntSchema.nullable(),
    last_good_render_revision: nonNegativeIntSchema.nullable(),
    current_state_revision: nonNegativeIntSchema.nullable(),
    render_manifest_hash: sha256Schema.nullable(),
    validated_props_hash: sha256Schema.nullable(),
    scoped_state_hash: sha256Schema.nullable(),
    text_alternative: z.string().min(1),
    replaces_ui_instance_id: opaqueIdSchema.nullable(),
    interaction_enabled: z.boolean(),
    created_at: isoDateTimeSchema,
    updated_at: isoDateTimeSchema,
    ready_at: isoDateTimeSchema.nullable(),
    quarantined_at: isoDateTimeSchema.nullable(),
  })
  .strict()
  .superRefine((value, ctx) => {
    for (const field of ["data_grant_ids", "action_grant_ids"] as const) {
      if (new Set(value[field]).size !== value[field].length) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${field} must be unique`,
          path: [field],
        });
      }
    }

    const hasRenderRevision = value.current_render_revision !== null;
    for (const [field, fieldValue] of [
      ["render_manifest_hash", value.render_manifest_hash],
      ["validated_props_hash", value.validated_props_hash],
    ] as const) {
      if (hasRenderRevision !== (fieldValue !== null)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${field} must be present exactly when a render revision is committed`,
          path: [field],
        });
      }
    }

    if ((value.current_state_revision !== null) !== (value.scoped_state_hash !== null)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "scoped_state_hash must be present exactly when a state revision is committed",
        path: ["scoped_state_hash"],
      });
    }
    if (
      value.last_good_render_revision !== null &&
      (value.current_render_revision === null ||
        value.last_good_render_revision > value.current_render_revision)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "last_good_render_revision cannot exceed the current render revision",
        path: ["last_good_render_revision"],
      });
    }

    if (value.status === "building") {
      for (const [field, fieldValue] of [
        ["current_render_revision", value.current_render_revision],
        ["last_good_render_revision", value.last_good_render_revision],
        ["current_state_revision", value.current_state_revision],
        ["render_manifest_hash", value.render_manifest_hash],
        ["validated_props_hash", value.validated_props_hash],
        ["scoped_state_hash", value.scoped_state_hash],
        ["ready_at", value.ready_at],
      ] as const) {
        if (fieldValue !== null) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `building instances must not carry ${field}`,
            path: [field],
          });
        }
      }
    }

    if (value.status === "ready") {
      for (const [field, fieldValue] of [
        ["current_render_revision", value.current_render_revision],
        ["last_good_render_revision", value.last_good_render_revision],
        ["render_manifest_hash", value.render_manifest_hash],
        ["validated_props_hash", value.validated_props_hash],
        ["ready_at", value.ready_at],
      ] as const) {
        if (fieldValue === null) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `ready instances require ${field}`,
            path: [field],
          });
        }
      }
      if (value.current_render_revision !== value.last_good_render_revision) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "ready instances must point to their last good render revision",
          path: ["last_good_render_revision"],
        });
      }
    }

    if (
      value.quarantined_at !== null &&
      (value.status === "building" || value.status === "ready")
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "quarantined instances cannot be building or ready",
        path: ["quarantined_at"],
      });
    }
    if (value.status !== "ready" && value.interaction_enabled) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "interactions are enabled only for ready instances",
        path: ["interaction_enabled"],
      });
    }
  });

/** Browser-safe grant projections. Internal grant records retain policy and blob metadata. */
export const renderGrantDisclosureSchema = z
  .object({
    id: opaqueIdSchema,
    rail: p0UiRailSchema,
    registryVersion: p0RegistryVersionSchema,
    allowedComponentTypes: z.array(p0RegistryComponentTypeSchema).min(1),
    policyRevision: nonNegativeIntSchema,
    grantScopeHash: sha256Schema,
    expiresAt: isoDateTimeSchema,
    revoked: z.boolean(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (new Set(value.allowedComponentTypes).size !== value.allowedComponentTypes.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "allowedComponentTypes must be unique",
        path: ["allowedComponentTypes"],
      });
    }
  });

export const uiReplaySourceRefSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("artifactRevision"),
      artifactId: opaqueIdSchema,
      revision: z.number().int().positive(),
      contentHash: sha256Schema,
    })
    .strict(),
  z
    .object({
      kind: z.literal("runEvent"),
      eventId: opaqueIdSchema,
      eventHash: sha256Schema,
    })
    .strict(),
  z
    .object({
      kind: z.literal("querySnapshot"),
      snapshotId: opaqueIdSchema,
      snapshotHash: sha256Schema,
    })
    .strict(),
]);

export const dataGrantDisclosureSchema = z
  .object({
    id: opaqueIdSchema,
    boundRenderRevision: nonNegativeIntSchema,
    boundManifestHash: sha256Schema,
    dataRef: z.string().min(1),
    source: uiReplaySourceRefSchema,
    classification: z.enum(["synthetic", "public", "workspace_safe"]),
    snapshotSchemaHash: sha256Schema,
    allowedFieldPaths: z.array(literalFieldPathSchema).min(1),
    maxRows: nonNegativeIntSchema,
    maxBytes: nonNegativeIntSchema,
    maxTimeMs: z.number().int().positive(),
    immutableSnapshotHash: sha256Schema,
    expiresAt: isoDateTimeSchema,
    revoked: z.boolean(),
  })
  .strict()
  .superRefine((value, ctx) => addDuplicatePathIssue(value.allowedFieldPaths, ctx));

const actionGrantDisclosureCommonShape = {
  id: opaqueIdSchema,
  boundRenderRevision: nonNegativeIntSchema,
  boundManifestHash: sha256Schema,
  actionRef: z.string().min(1),
  inputSchemaHash: sha256Schema,
  allowedRenderNodeIds: z.array(safePathSegmentSchema).min(1),
  requiresRecentAuth: z.boolean(),
  maxUses: z.number().int().positive(),
  useCount: nonNegativeIntSchema,
  expiresAt: isoDateTimeSchema,
  revoked: z.boolean(),
};

export const actionGrantDisclosureSchema = z
  .discriminatedUnion("mode", [
    z
      .object({
        ...actionGrantDisclosureCommonShape,
        mode: z.literal("local_state"),
      })
      .strict(),
    z
      .object({
        ...actionGrantDisclosureCommonShape,
        mode: z.literal("server_read"),
        dataGrantId: opaqueIdSchema,
        dataRef: z.string().min(1),
      })
      .strict(),
    z
      .object({
        ...actionGrantDisclosureCommonShape,
        mode: z.literal("complete_component_interrupt"),
        componentInterruptId: opaqueIdSchema,
      })
      .strict(),
  ])
  .superRefine((value, ctx) => {
    if (new Set(value.allowedRenderNodeIds).size !== value.allowedRenderNodeIds.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "allowedRenderNodeIds must be unique",
        path: ["allowedRenderNodeIds"],
      });
    }
    if (value.useCount > value.maxUses) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "useCount cannot exceed maxUses",
        path: ["useCount"],
      });
    }
  });

/** Closed camelCase response for deterministic controlled-UI browser replay. */
export const uiInstanceReplayResponseSchema = z
  .object({
    request_id: opaqueIdSchema,
    schemaVersion: schemaVersion1,
    instanceId: opaqueIdSchema,
    workspaceId: opaqueIdSchema,
    channelId: opaqueIdSchema,
    runId: opaqueIdSchema,
    runStepId: opaqueIdSchema,
    agentTurnId: opaqueIdSchema,
    logicalThreadId: opaqueIdSchema,
    componentVersionId: opaqueIdSchema,
    componentName: p0AgentToolComponentNameSchema,
    componentVersion: z.string().min(1),
    componentDescriptorHash: sha256Schema,
    rendererKey: z.string().min(1),
    rendererProfileHash: sha256Schema,
    rail: p0UiRailSchema,
    status: uiInstanceStatusSchema,
    renderRevision: nonNegativeIntSchema.nullable(),
    lastGoodRenderRevision: nonNegativeIntSchema.nullable(),
    baseRenderRevision: nonNegativeIntSchema.nullable(),
    stateRevision: nonNegativeIntSchema.nullable(),
    baseStateRevision: nonNegativeIntSchema.nullable(),
    renderManifestHash: sha256Schema.nullable(),
    validatedPropsHash: sha256Schema.nullable(),
    scopedStateHash: sha256Schema.nullable(),
    validatedProps: safeJsonObjectSchema.nullable(),
    scopedState: safeJsonObjectSchema.nullable(),
    textAlternative: z.string().min(1),
    interactionEnabled: z.boolean(),
    renderGrant: renderGrantDisclosureSchema,
    dataGrants: z.array(dataGrantDisclosureSchema),
    actionGrants: z.array(actionGrantDisclosureSchema),
    sourceRefs: z.array(uiReplaySourceRefSchema),
    lastChannelSequence: nonNegativeIntSchema,
    createdAt: isoDateTimeSchema,
    updatedAt: isoDateTimeSchema,
  })
  .strict()
  .superRefine((value, ctx) => {
    for (const [field, grants] of [
      ["dataGrants", value.dataGrants],
      ["actionGrants", value.actionGrants],
    ] as const) {
      const ids = grants.map((grant) => grant.id);
      if (new Set(ids).size !== ids.length) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${field} IDs must be unique`,
          path: [field],
        });
      }
    }

    const renderFields = [
      value.lastGoodRenderRevision,
      value.renderManifestHash,
      value.validatedPropsHash,
      value.validatedProps,
    ];
    if (value.renderRevision === null && renderFields.some((field) => field !== null)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "uncommitted replay responses cannot carry render payloads or hashes",
        path: ["renderRevision"],
      });
    }
    if (value.renderRevision !== null && renderFields.some((field) => field === null)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "committed replay responses require complete render payloads and hashes",
        path: ["renderRevision"],
      });
    }
    if (value.renderRevision === null && value.baseRenderRevision !== null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "baseRenderRevision requires a committed render",
        path: ["baseRenderRevision"],
      });
    }
    if (
      value.baseRenderRevision !== null &&
      value.renderRevision !== null &&
      value.baseRenderRevision >= value.renderRevision
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "baseRenderRevision must precede renderRevision",
        path: ["baseRenderRevision"],
      });
    }

    const stateFields = [value.baseStateRevision, value.scopedStateHash, value.scopedState];
    if (value.stateRevision === null && stateFields.some((field) => field !== null)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "uncommitted replay responses cannot carry state payloads or hashes",
        path: ["stateRevision"],
      });
    }
    if (
      value.stateRevision !== null &&
      (value.scopedStateHash === null || value.scopedState === null)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "committed state requires its payload and hash",
        path: ["stateRevision"],
      });
    }
    if (
      value.baseStateRevision !== null &&
      value.stateRevision !== null &&
      value.baseStateRevision >= value.stateRevision
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "baseStateRevision must precede stateRevision",
        path: ["baseStateRevision"],
      });
    }

    if (value.status === "building") {
      if (value.renderRevision !== null || value.stateRevision !== null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "building replay responses cannot carry committed revisions",
          path: ["status"],
        });
      }
    }
    if (value.status === "ready") {
      if (value.renderRevision === null || value.lastGoodRenderRevision !== value.renderRevision) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "ready replay responses require their last good render",
          path: ["lastGoodRenderRevision"],
        });
      }
    }
    if (value.status !== "ready" && value.interactionEnabled) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "interactions are enabled only for ready replay responses",
        path: ["interactionEnabled"],
      });
    }
    if (value.renderGrant.revoked && value.interactionEnabled) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "revoked render authority permits historical replay only",
        path: ["interactionEnabled"],
      });
    }

    if (value.renderRevision !== null && value.renderManifestHash !== null) {
      for (const [field, grants] of [
        ["dataGrants", value.dataGrants],
        ["actionGrants", value.actionGrants],
      ] as const) {
        for (const [index, grant] of grants.entries()) {
          if (
            grant.boundRenderRevision !== value.renderRevision ||
            grant.boundManifestHash !== value.renderManifestHash
          ) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: "grant disclosure must bind the replayed render revision and manifest",
              path: [field, index],
            });
          }
        }
      }
    }
  });

export const uiInteractionTokenRequestSchema = z
  .object({
    schemaVersion: schemaVersion1,
    surfaceId: opaqueIdSchema,
    renderNodeId: safePathSegmentSchema,
    renderRevision: nonNegativeIntSchema,
    expectedStateRevision: nonNegativeIntSchema.nullable(),
    actionGrantId: opaqueIdSchema,
    actionRef: z.string().min(1),
    input: safeJsonValueSchema,
    clientKind: uiClientKindSchema,
    idempotencyKey: z.string().min(1).max(512),
  })
  .strict();

export const uiInteractionTokenResponseSchema = z
  .object({
    request_id: opaqueIdSchema,
    interactionId: opaqueIdSchema,
    state: z.literal("token_issued"),
    interactionToken: z.string().min(32).max(1_024),
    expiresAt: isoDateTimeSchema,
  })
  .strict();

export const uiInteractionCommitCommandSchema = z
  .object({
    schemaVersion: schemaVersion1,
    interactionId: opaqueIdSchema,
    interactionToken: z.string().min(32).max(1_024),
  })
  .strict();

export const uiInteractionTerminalStateSchema = z.enum(["succeeded", "failed", "denied", "stale"]);

export const uiInteractionResultSchema = z
  .object({
    request_id: opaqueIdSchema,
    schemaVersion: schemaVersion1,
    interactionId: opaqueIdSchema,
    state: uiInteractionTerminalStateSchema,
    result: safeJsonValueSchema.nullable(),
    resultRef: opaqueIdSchema.nullable(),
    renderRevision: nonNegativeIntSchema,
    stateRevision: nonNegativeIntSchema.nullable(),
  })
  .strict();

export const componentGrantCommandSchema = z
  .object({
    granted: z.boolean(),
    expected_component_version: z.string().min(1),
    expected_descriptor_hash: sha256Schema,
  })
  .strict();

export const uiDataFunctionCommandSchema = z
  .object({
    schemaVersion: schemaVersion1,
    renderRevision: nonNegativeIntSchema,
    dataGrantId: opaqueIdSchema,
    expectedManifestHash: sha256Schema,
    arguments: safeJsonObjectSchema,
  })
  .strict();

export function interpretUiRail(input: unknown) {
  if (input === "registry_v1") {
    return { ok: true as const, rail: "registry_v1" as const };
  }
  const capability = typeof input === "string" ? input : "unknown_ui_rail";
  const interpreted = interpretP0Capability(capability);
  if (!interpreted.ok) {
    return interpreted;
  }
  return unsupportedCapability(capability);
}

export type ComponentVersion = z.infer<typeof componentVersionSchema>;
export type RenderGrant = z.infer<typeof renderGrantSchema>;
export type DataGrant = z.infer<typeof dataGrantSchema>;
export type ActionGrant = z.infer<typeof actionGrantSchema>;
export type RenderGrantDisclosure = z.infer<typeof renderGrantDisclosureSchema>;
export type DataGrantDisclosure = z.infer<typeof dataGrantDisclosureSchema>;
export type ActionGrantDisclosure = z.infer<typeof actionGrantDisclosureSchema>;
export type UiReplaySourceRef = z.infer<typeof uiReplaySourceRefSchema>;
export type UiInstance = z.infer<typeof uiInstanceSchema>;
export type UiInstanceReplayResponse = z.infer<typeof uiInstanceReplayResponseSchema>;
export type UiInteractionTokenRequest = z.infer<typeof uiInteractionTokenRequestSchema>;
export type UiInteractionResult = z.infer<typeof uiInteractionResultSchema>;
export type ComponentGrantCommand = z.infer<typeof componentGrantCommandSchema>;
export type UiDataFunctionCommand = z.infer<typeof uiDataFunctionCommandSchema>;
