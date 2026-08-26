import { z } from "zod";
import {
  nonNegativeIntSchema,
  opaqueIdSchema,
  safeRecordSchema,
  schemaVersion1,
} from "./primitives";
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
  .strict()
  .superRefine((value, ctx) => {
    if (
      value.status === "building" &&
      (value.renderRevision !== null || value.stateRevision !== null)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "building UI projections cannot carry committed revisions",
      });
    }
    if (value.status === "ready" && value.renderRevision === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "ready UI projections require a committed render revision",
        path: ["renderRevision"],
      });
    }
  });

export const channelArtifactProjectionSchema = z
  .object({
    revision: z.number().int().positive(),
    mimeType: z.string().min(1),
    title: z.string().min(1),
  })
  .strict();

export const channelTaskProjectionSchema = z
  .object({
    revision: z.number().int().positive(),
    status: taskStatusSchema,
    title: z.string().min(1),
    assigneeId: opaqueIdSchema.optional(),
  })
  .strict();

export const pendingHumanActionProjectionSchema = z
  .object({
    id: opaqueIdSchema,
    kind: z.enum(["approval", "question", "ui_input", "component_input"]),
  })
  .strict();

export const threadPhaseSchema = z.enum([
  "idle",
  "queued",
  "running",
  "interrupted",
  "failed",
  "finished",
]);

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
    coworkers: safeRecordSchema(channelCoworkerProjectionSchema),
    runs: safeRecordSchema(channelRunProjectionSchema),
    artifacts: safeRecordSchema(channelArtifactProjectionSchema),
    tasks: safeRecordSchema(channelTaskProjectionSchema),
    uiInstances: safeRecordSchema(channelUiInstanceProjectionSchema),
    pendingHumanActions: z.array(pendingHumanActionProjectionSchema),
  })
  .strict();

export const threadUIStateV1Schema = z
  .object({
    schemaVersion: schemaVersion1,
    stateKind: z.literal("thread"),
    revision: nonNegativeIntSchema,
    coworkerId: opaqueIdSchema,
    logicalThreadId: opaqueIdSchema,
    phase: threadPhaseSchema,
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
