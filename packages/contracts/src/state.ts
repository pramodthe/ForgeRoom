import { z } from "zod";
import { nonNegativeIntSchema, opaqueIdSchema, schemaVersion1 } from "./primitives";
import { runActivityCountersSchema, runLifecycleSchema } from "./runs";
import { p0AgentToolComponentNameSchema, uiInstanceStatusSchema } from "./components";
import { taskStatusSchema } from "./tasks";

export const channelCoworkerProjectionSchema = z
  .object({
    availability: z.string().min(1),
    currentAssignment: z.string().optional(),
    activeRunStepIds: z.array(opaqueIdSchema),
  })
  .strict();

export const channelRunProjectionSchema = z
  .object({
    lifecycle: runLifecycleSchema,
    counters: runActivityCountersSchema,
  })
  .strict();

export const channelUiInstanceProjectionSchema = z
  .object({
    rail: z.literal("registry_v1"),
    componentName: p0AgentToolComponentNameSchema,
    componentVersion: z.string().min(1),
    status: uiInstanceStatusSchema,
    renderRevision: z.number().int().nonnegative().nullable(),
    stateRevision: z.number().int().nonnegative().nullable(),
  })
  .strict();

export const channelUIStateV1Schema = z
  .object({
    schemaVersion: schemaVersion1,
    stateKind: z.literal("channel"),
    revision: nonNegativeIntSchema,
    channel: z
      .object({
        id: opaqueIdSchema,
        name: z.string().min(1),
        archived: z.boolean(),
      })
      .strict(),
    coworkers: z.record(z.string(), channelCoworkerProjectionSchema),
    runs: z.record(z.string(), channelRunProjectionSchema),
    artifacts: z.record(
      z.string(),
      z
        .object({
          revision: z.number().int().positive(),
          mimeType: z.string().min(1),
          title: z.string().min(1),
        })
        .strict(),
    ),
    tasks: z.record(
      z.string(),
      z
        .object({
          revision: z.number().int().positive(),
          status: taskStatusSchema,
          title: z.string().min(1),
          assigneeId: opaqueIdSchema.optional(),
        })
        .strict(),
    ),
    uiInstances: z.record(z.string(), channelUiInstanceProjectionSchema),
    pendingHumanActions: z.array(
      z
        .object({
          id: opaqueIdSchema,
          kind: z.enum(["approval", "question", "ui_input", "component_input"]),
        })
        .strict(),
    ),
  })
  .strict();

export const threadUIStateV1Schema = z
  .object({
    schemaVersion: schemaVersion1,
    stateKind: z.literal("thread"),
    revision: nonNegativeIntSchema,
    coworkerId: opaqueIdSchema,
    logicalThreadId: opaqueIdSchema,
    phase: z.enum(["idle", "queued", "running", "interrupted", "failed", "finished"]),
    activeAguiRunId: opaqueIdSchema.optional(),
    activeRunStepIds: z.array(opaqueIdSchema),
    surfaceIds: z.array(opaqueIdSchema),
  })
  .strict();

export const uiStateSchema = z.discriminatedUnion("stateKind", [
  channelUIStateV1Schema,
  threadUIStateV1Schema,
]);

export type ChannelUIStateV1 = z.infer<typeof channelUIStateV1Schema>;
export type ThreadUIStateV1 = z.infer<typeof threadUIStateV1Schema>;
