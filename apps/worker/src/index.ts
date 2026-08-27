import { internalWorkerCommandSchema, type InternalWorkerCommand } from "@forgeroom/contracts";
import {
  bindTrueForgeTurnId,
  claimPauseGroupResume,
  claimTurnQueueItem,
  completePauseResume,
  createSql,
  derivePausePayloadKey,
  ingestNormalizedTrueForgeEvent,
  loadPauseResumeForCreate,
  lockAgentTurnForCreate,
  markActiveTurnsNeedsAttentionOnRestart,
  markAgentTurnUncertain,
  markCancelCalled,
  markPauseResumeCreating,
  markPauseResumeUncertain,
  requestRunStepStop,
  settleCancelledStep,
  type ClaimPauseGroupResumeResult,
  type ClaimTurnQueueItemResult,
  type IngestRunEventResult,
  type RequestStopResult,
} from "@forgeroom/db";
import {
  evaluateTurnDoneOutcome,
  normalizeTrueForgeEvent,
  startWorker,
} from "@forgeroom/orchestration";
import {
  createOrReconcileTurn,
  type CreateOrReconcileTurnResult,
} from "@forgeroom/orchestration/create-or-reconcile-turn";
import {
  createOrReconcileResponseTurn,
  type CreateOrReconcileResponseTurnResult,
} from "@forgeroom/orchestration/create-or-reconcile-response-turn";
import {
  createTrueForgeDownloadAdapter,
  executePublishSandboxArtifactCommand,
  type PublishSandboxArtifactCommand,
  type SandboxArtifactPublishAdapters,
  type SandboxArtifactPublishInput,
} from "@forgeroom/orchestration/artifact-extraction";
import { TrueForgeClient, type TrueForgeClient as TrueForgeClientType } from "@forgeroom/trueforge";

export function parseWorkerCommand(input: unknown): InternalWorkerCommand {
  return internalWorkerCommandSchema.parse(input);
}

export type WorkerCommandExecutor = (command: InternalWorkerCommand) => void | Promise<void>;

export type WorkerDispatchResult = {
  command: InternalWorkerCommand;
  claim?: ClaimTurnQueueItemResult;
  pauseResumeClaim?: ClaimPauseGroupResumeResult;
  createOrReconcile?: CreateOrReconcileTurnResult | { ok: false; reason: "unavailable" };
  createOrReconcileResponse?:
    | CreateOrReconcileResponseTurnResult
    | { ok: false; reason: "unavailable" };
  ingest?: IngestRunEventResult | { ok: false; reason: "unavailable" };
  publishSandboxArtifact?: Awaited<ReturnType<typeof executePublishSandboxArtifactCommand>>;
};

export type WorkerProcessOptions = {
  executeCommand?: WorkerCommandExecutor;
  /** When set, DB-backed commands run against this client. */
  sql?: ReturnType<typeof createSql>;
  databaseUrl?: string;
  trueforge?: Pick<
    TrueForgeClientType,
    "createTurn" | "listTurns" | "cancelSession" | "downloadSandboxFile"
  >;
  pausePayloadEncryptionSecret?: string;
  loadTurnCreateContext?: (agentTurnId: string) => Promise<{
    applicationRunToken: string;
    content: string;
    previousTrueforgeTurnId: string | null;
    localTrueforgeTurnId: string | null;
    trueforgeSessionId: string;
  } | null>;
  loadArtifactDiscovery?: (
    artifactId: string,
  ) => Promise<SandboxArtifactPublishInput | null>;
  publishArtifact?: SandboxArtifactPublishAdapters["publishArtifact"];
  /** When true (default with sql), mark active turns needs_attention on start. */
  markNeedsAttentionOnStart?: boolean;
  workspaceId?: string;
};

export async function executeClaimQueueItem(
  sql: ReturnType<typeof createSql>,
  command: Extract<InternalWorkerCommand, { name: "claim_queue_item" }>,
): Promise<ClaimTurnQueueItemResult> {
  return claimTurnQueueItem(sql, {
    queueItemId: command.payload.queue_item_id,
    workerId: command.payload.worker_id,
    leaseExpiresAt: command.payload.lease_expires_at,
    expectedState: command.payload.expected_state,
  });
}

export async function executeCreateOrReconcileTurn(
  options: {
    sql: ReturnType<typeof createSql>;
    client: Pick<TrueForgeClientType, "createTurn" | "listTurns">;
    loadContext: NonNullable<WorkerProcessOptions["loadTurnCreateContext"]>;
  },
  command: Extract<InternalWorkerCommand, { name: "create_or_reconcile_turn" }>,
): Promise<CreateOrReconcileTurnResult> {
  const context = await options.loadContext(command.payload.agent_turn_id);
  if (!context) {
    return { ok: false, reason: "create_failed" };
  }
  if (context.applicationRunToken !== command.payload.application_run_token) {
    return { ok: false, reason: "create_failed" };
  }
  const forceReconcile =
    command.payload.expected_turn_state === "uncertain" ||
    command.payload.expected_turn_state === "creating";

  await options.sql`
    SELECT pg_advisory_lock(
      ('x' || substr(md5(${command.payload.agent_turn_id}), 1, 8))::bit(32)::int,
      ('x' || substr(md5(${command.payload.agent_turn_id}), 9, 8))::bit(32)::int
    )
  `;
  try {
    return await createOrReconcileTurn(
      {
        client: options.client,
        lockForCreate: async () =>
          lockAgentTurnForCreate(options.sql, {
            agentTurnId: command.payload.agent_turn_id,
            expectedStates: ["intended", "acquiring", "creating", "uncertain"],
          }),
        bindTurn: async (input) => {
          await bindTrueForgeTurnId(options.sql, {
            agentTurnId: input.agentTurnId,
            trueforgeTurnId: input.trueforgeTurnId,
            previousTrueforgeTurnId: input.previousTrueforgeTurnId,
            expectedStates: ["creating", "uncertain"],
            nextState: "streaming",
          });
        },
        markUncertain: async (input) => {
          await markAgentTurnUncertain(options.sql, {
            ...input,
            expectedStates: ["intended", "acquiring", "creating", "uncertain"],
          });
        },
      },
      {
        agentTurnId: command.payload.agent_turn_id,
        trueforgeSessionId: context.trueforgeSessionId,
        applicationRunToken: context.applicationRunToken,
        content: context.content,
        previousTrueforgeTurnId: context.previousTrueforgeTurnId,
        localTrueforgeTurnId: context.localTrueforgeTurnId,
        forceReconcile,
      },
    );
  } finally {
    await options.sql`
      SELECT pg_advisory_unlock(
        ('x' || substr(md5(${command.payload.agent_turn_id}), 1, 8))::bit(32)::int,
        ('x' || substr(md5(${command.payload.agent_turn_id}), 9, 8))::bit(32)::int
      )
    `;
  }
}

export async function executeIngestTrueForgeEvent(
  sql: ReturnType<typeof createSql>,
  command: Extract<InternalWorkerCommand, { name: "ingest_trueforge_event" }>,
): Promise<IngestRunEventResult> {
  const event = normalizeTrueForgeEvent({
    ...command.payload.event_payload,
    type: command.payload.upstream_event_type,
    id: command.payload.upstream_event_id,
  });
  const turnDoneOutcome =
    event.normalizedType === "turn.done" ? evaluateTurnDoneOutcome(event.payloadRedacted) : null;
  // Parent Run lifecycle is refreshed inside the ingest transaction from the locked step.
  return ingestNormalizedTrueForgeEvent(sql, {
    agentTurnId: command.payload.agent_turn_id,
    expectedTurnStates: [command.payload.expected_turn_state, "streaming", "creating"],
    event,
    turnDoneOutcome,
  });
}

export async function executePublishSandboxArtifact(
  options: {
    client: Pick<TrueForgeClientType, "downloadSandboxFile">;
    loadDiscovery: NonNullable<WorkerProcessOptions["loadArtifactDiscovery"]>;
    publishArtifact: NonNullable<WorkerProcessOptions["publishArtifact"]>;
  },
  command: PublishSandboxArtifactCommand,
) {
  return executePublishSandboxArtifactCommand(
    {
      downloadSandboxFile: createTrueForgeDownloadAdapter(options.client),
      loadDiscovery: options.loadDiscovery,
      publishArtifact: options.publishArtifact,
    },
    command,
  );
}

export async function executeStopCancelOnce(
  options: {
    sql: ReturnType<typeof createSql>;
    client: Pick<TrueForgeClientType, "cancelSession">;
  },
  input: { runStepId: string },
): Promise<
  | { ok: true; stop: Extract<RequestStopResult, { ok: true }>; cancelCalled: boolean }
  | { ok: false; reason: "not_found" | "run_not_stoppable" }
> {
  const stop = await requestRunStepStop(options.sql, { runStepId: input.runStepId });
  if (!stop.ok) {
    return stop;
  }
  let cancelCalled = false;
  if (stop.decision.callCancel && stop.trueforgeSessionId) {
    await options.client.cancelSession(stop.trueforgeSessionId);
    cancelCalled = true;
    if (stop.agentTurnId) {
      await markCancelCalled(options.sql, { agentTurnId: stop.agentTurnId });
    }
  }
  return { ok: true, stop, cancelCalled };
}

export async function executeRestartNeedsAttention(
  sql: ReturnType<typeof createSql>,
): Promise<{ marked: number }> {
  return markActiveTurnsNeedsAttentionOnRestart(sql);
}

export async function executeClaimPauseGroupResume(
  options: {
    sql: ReturnType<typeof createSql>;
    client: Pick<TrueForgeClientType, "createTurn" | "listTurns">;
    encryptionKey: Buffer;
    workspaceId: string;
  },
  command: Extract<InternalWorkerCommand, { name: "claim_pause_group_resume" }>,
): Promise<{
  claim: ClaimPauseGroupResumeResult;
  createOrReconcileResponse?: CreateOrReconcileResponseTurnResult;
}> {
  const claim = await claimPauseGroupResume(options.sql, {
    pauseGroupId: command.payload.pause_group_id,
    workspaceId: options.workspaceId,
    workerId: command.payload.worker_id,
    encryptionKey: options.encryptionKey,
    resumeClaimToken: command.payload.resume_claim_token,
    applicationRunToken: command.payload.application_run_token,
  });

  if (!claim.ok) {
    // Competing worker: observe existing resume and never create another intent.
    if (claim.reason === "already_resuming" && claim.existingPauseResumeId) {
      const existing = await loadPauseResumeForCreate(options.sql, {
        pauseResumeId: claim.existingPauseResumeId,
        encryptionKey: options.encryptionKey,
      });
      if (!existing.ok) {
        return { claim };
      }
      if (existing.responsePayloadHash !== command.payload.response_payload_hash) {
        return { claim };
      }
      if (existing.trueforgeResumeTurnId) {
        return { claim };
      }
      await markPauseResumeCreating(options.sql, { pauseResumeId: existing.pauseResumeId });
      const createOrReconcileResponse = await createOrReconcileResponseTurn(
        {
          client: options.client,
          lockForCreate: async () => ({ ok: true }),
          bindResumeTurn: async () => undefined,
          markUncertain: async ({ pauseResumeId, error }) => {
            await markPauseResumeUncertain(options.sql, { pauseResumeId, error });
          },
        },
        {
          pauseResumeId: existing.pauseResumeId,
          trueforgeSessionId: existing.trueforgeSessionId,
          applicationRunToken: existing.applicationRunToken,
          previousTrueforgeTurnId: existing.previousTrueforgeTurnId,
          responses: existing.plaintext.responses,
          localTrueforgeResumeTurnId: existing.trueforgeResumeTurnId,
          forceReconcile: existing.state === "uncertain" || Boolean(existing.trueforgeResumeTurnId),
        },
      );
      if (createOrReconcileResponse.ok) {
        await completePauseResume(options.sql, {
          pauseResumeId: existing.pauseResumeId,
          trueforgeResumeTurnId: createOrReconcileResponse.trueforgeTurnId,
          reconciled: !createOrReconcileResponse.created,
        });
      }
      return { claim, createOrReconcileResponse };
    }
    return { claim };
  }

  // First winner: durable ciphertext already persisted; network create follows.
  if (claim.responsePayloadHash !== command.payload.response_payload_hash) {
    // Command hash was a stale preview; durable row hash is authoritative after CAS.
  }

  const loaded = await loadPauseResumeForCreate(options.sql, {
    pauseResumeId: claim.pauseResumeId,
    encryptionKey: options.encryptionKey,
  });
  if (!loaded.ok) {
    await markPauseResumeUncertain(options.sql, {
      pauseResumeId: claim.pauseResumeId,
      error: { reason: "decrypt_failed" },
    });
    return { claim: { ok: false, reason: "missing_binding" } };
  }

  await markPauseResumeCreating(options.sql, { pauseResumeId: claim.pauseResumeId });
  const createOrReconcileResponse = await createOrReconcileResponseTurn(
    {
      client: options.client,
      lockForCreate: async () => ({ ok: true }),
      bindResumeTurn: async () => undefined,
      markUncertain: async ({ pauseResumeId, error }) => {
        await markPauseResumeUncertain(options.sql, { pauseResumeId, error });
      },
    },
    {
      pauseResumeId: claim.pauseResumeId,
      trueforgeSessionId: claim.trueforgeSessionId,
      applicationRunToken: claim.applicationRunToken,
      previousTrueforgeTurnId: claim.previousTrueforgeTurnId,
      responses: loaded.plaintext.responses,
      localTrueforgeResumeTurnId: loaded.trueforgeResumeTurnId,
      forceReconcile: false,
    },
  );
  if (createOrReconcileResponse.ok) {
    await completePauseResume(options.sql, {
      pauseResumeId: claim.pauseResumeId,
      trueforgeResumeTurnId: createOrReconcileResponse.trueforgeTurnId,
      reconciled: !createOrReconcileResponse.created,
    });
  }
  return { claim, createOrReconcileResponse };
}

export { settleCancelledStep, requestRunStepStop };

export function startWorkerProcess(options: WorkerProcessOptions | WorkerCommandExecutor = {}) {
  const resolved: WorkerProcessOptions =
    typeof options === "function" ? { executeCommand: options } : options;
  const worker = startWorker({ embedded: false });
  let sql = resolved.sql;
  const canUseDb = Boolean(resolved.sql || resolved.databaseUrl);
  const trueforge =
    resolved.trueforge ??
    (canUseDb
      ? new TrueForgeClient({
          baseUrl: process.env.TRUEFORGE_BASE_URL ?? "http://127.0.0.1:8790",
          apiKey: process.env.TRUEFORGE_API_KEY,
        })
      : undefined);

  const startup =
    canUseDb && resolved.markNeedsAttentionOnStart === true
      ? (async () => {
          sql ??= createSql(resolved.databaseUrl);
          return executeRestartNeedsAttention(sql);
        })()
      : Promise.resolve({ marked: 0 });

  return {
    ...worker,
    startup,
    async dispatchCommand(input: unknown): Promise<WorkerDispatchResult> {
      const command = parseWorkerCommand(input);

      if (command.name === "claim_queue_item") {
        if (!canUseDb) {
          return { command, claim: { ok: false, reason: "not_found" } };
        }
        sql ??= createSql(resolved.databaseUrl);
        const claim = await executeClaimQueueItem(sql, command);
        if (claim.ok) {
          await resolved.executeCommand?.(command);
        }
        return { command, claim };
      }

      if (command.name === "create_or_reconcile_turn") {
        if (!canUseDb || !trueforge || !resolved.loadTurnCreateContext) {
          return { command, createOrReconcile: { ok: false, reason: "unavailable" } };
        }
        sql ??= createSql(resolved.databaseUrl);
        const createOrReconcile = await executeCreateOrReconcileTurn(
          { sql, client: trueforge, loadContext: resolved.loadTurnCreateContext },
          command,
        );
        if (createOrReconcile.ok) {
          await resolved.executeCommand?.(command);
        }
        return { command, createOrReconcile };
      }

      if (command.name === "claim_pause_group_resume") {
        if (!canUseDb || !trueforge) {
          return {
            command,
            pauseResumeClaim: { ok: false, reason: "not_found" },
            createOrReconcileResponse: { ok: false, reason: "unavailable" },
          };
        }
        sql ??= createSql(resolved.databaseUrl);
        const encryptionKey = derivePausePayloadKey(
          (() => {
            const secret =
              resolved.pausePayloadEncryptionSecret ??
              process.env.PAUSE_PAYLOAD_ENCRYPTION_SECRET?.trim() ??
              process.env.OWNER_PASSWORD_HASH?.trim() ??
              null;
            if (!secret) {
              if ((process.env.NODE_ENV ?? "development") === "production") {
                throw new Error(
                  "PAUSE_PAYLOAD_ENCRYPTION_SECRET (or OWNER_PASSWORD_HASH) is required in production",
                );
              }
              return "forgeroom-dev-pause-payload-secret";
            }
            return secret;
          })(),
        );
        const workspaceId =
          resolved.workspaceId ?? process.env.WORKSPACE_ID ?? "workspace_1";
        const result = await executeClaimPauseGroupResume(
          { sql, client: trueforge, encryptionKey, workspaceId },
          command,
        );
        if (result.claim.ok) {
          await resolved.executeCommand?.(command);
        }
        return {
          command,
          pauseResumeClaim: result.claim,
          createOrReconcileResponse: result.createOrReconcileResponse,
        };
      }

      if (command.name === "ingest_trueforge_event") {
        if (!canUseDb) {
          return { command, ingest: { ok: false, reason: "unavailable" } };
        }
        sql ??= createSql(resolved.databaseUrl);
        const ingest = await executeIngestTrueForgeEvent(sql, command);
        if (ingest.ok) {
          await resolved.executeCommand?.(command);
        }
        return { command, ingest };
      }

      if (command.name === "publish_sandbox_artifact") {
        if (!trueforge || !resolved.loadArtifactDiscovery || !resolved.publishArtifact) {
          return { command, publishSandboxArtifact: { ok: false, kind: "not_found", reason: "unavailable", events: [] } };
        }
        const publishSandboxArtifact = await executePublishSandboxArtifact(
          {
            client: trueforge,
            loadDiscovery: resolved.loadArtifactDiscovery,
            publishArtifact: resolved.publishArtifact,
          },
          command,
        );
        if (publishSandboxArtifact.ok) {
          await resolved.executeCommand?.(command);
        }
        return { command, publishSandboxArtifact };
      }

      await resolved.executeCommand?.(command);
      return { command };
    },
  };
}
