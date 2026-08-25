import { z } from "zod";
import {
  isoDateTimeSchema,
  nonNegativeIntSchema,
  opaqueIdSchema,
  safeJsonValueSchema,
  schemaVersion1,
  sha256Schema,
} from "./primitives";
import { interpretP0Capability, unsupportedCapability } from "./unsupported";

export const p0UiRailSchema = z.literal("registry_v1");
export const componentExposureSchema = z.enum(["agent_tool", "server_only"]);
export const confirmationPolicySchema = z.enum(["none", "trusted_host"]);

export const p0AgentToolComponentNameSchema = z.enum([
  "DataTable",
  "BarLineChart",
  "TaskCard",
  "ArtifactCard",
  "ChoiceForm",
]);

export const p0ServerOnlyComponentNameSchema = z.enum([
  "ApprovalCard",
  "RequiredQuestion",
  "ConnectionCard",
]);

export const p0ComponentNameSchema = z.union([
  p0AgentToolComponentNameSchema,
  p0ServerOnlyComponentNameSchema,
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

export const componentVersionSchema = z
  .object({
    schemaVersion: schemaVersion1,
    id: opaqueIdSchema,
    stable_name: p0ComponentNameSchema,
    semantic_version: z.string().min(1),
    exposure: componentExposureSchema,
    confirmation_policy: confirmationPolicySchema,
    model_description: z.string().min(1),
    argument_schema: z.record(z.string(), safeJsonValueSchema),
    renderer_key: z.string().min(1),
    descriptor_hash: sha256Schema,
    declared_data_functions: z.array(z.string().min(1)),
    declared_interaction_intents: z.array(z.string().min(1)),
  })
  .strict()
  .superRefine((value, ctx) => {
    const agentTool = p0AgentToolComponentNameSchema.safeParse(value.stable_name).success;
    if (agentTool && value.exposure !== "agent_tool") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "agent-tool components must use agent_tool exposure",
      });
    }
    if (!agentTool && value.exposure !== "server_only") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "approval/question/connection cards must be server_only",
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
    component_version_id: opaqueIdSchema,
    rail: p0UiRailSchema,
    status: uiInstanceStatusSchema,
    render_revision: z.number().int().nonnegative().nullable(),
    state_revision: z.number().int().nonnegative().nullable(),
    text_alternative: z.string().min(1),
    renderer_hash: sha256Schema,
    created_at: isoDateTimeSchema,
  })
  .strict();

export const uiInteractionTokenRequestSchema = z
  .object({
    schemaVersion: schemaVersion1,
    surfaceId: opaqueIdSchema,
    renderNodeId: z.string().min(1),
    renderRevision: nonNegativeIntSchema,
    expectedStateRevision: nonNegativeIntSchema,
    actionGrantId: opaqueIdSchema,
    actionRef: z.string().min(1),
    input: safeJsonValueSchema,
    clientKind: uiClientKindSchema,
    actionMode: actionGrantModeSchema,
  })
  .strict();

export function interpretUiRail(input: unknown) {
  if (input === "registry_v1") {
    return { ok: true as const, rail: "registry_v1" as const };
  }
  const capability = typeof input === "string" ? input : JSON.stringify(input);
  const interpreted = interpretP0Capability(capability);
  if (!interpreted.ok) {
    return interpreted;
  }
  return unsupportedCapability(capability);
}

export type ComponentVersion = z.infer<typeof componentVersionSchema>;
export type UiInstance = z.infer<typeof uiInstanceSchema>;
