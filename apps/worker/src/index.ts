import { internalWorkerCommandSchema, type InternalWorkerCommand } from "@forgeroom/contracts";
import {
  bindTrueForgeTurnId,
  claimTurnQueueItem,
  createSql,
  ingestNormalizedTrueForgeEvent,
  lockAgentTurnForCreate,
  markActiveTurnsNeedsAttentionOnRestart,
  markAgentTurnUncertain,
  markCancelCalled,
  refreshRunLifecycle,
  requestRunStepStop,
  settleCancelledStep,
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
import { TrueForgeClient, type TrueForgeClient as TrueForgeClientType } from "@forgeroom/trueforge";

export function parseWorkerCommand(input: unknown): InternalWorkerCommand {
  return internalWorkerCommandSchema.parse(input);
}

export type WorkerCommandExecutor = (command: InternalWorkerCommand) => void | Promise<void>;

export type WorkerDispatchResult = {
  command: InternalWorkerCommand;
  claim?: ClaimTurnQueueItemResult;
  createOrReconcile?: CreateOrReconcileTurnResult | { ok: false; reason: "unavailable" };
  ingest?: IngestRunEventResult | { ok: false; reason: "unavailable" };
};

export type WorkerProcessOptions = {
  executeCommand?: WorkerCommandExecutor;
  /** When set, DB-backed commands run against this client. */
  sql?: ReturnType<typeof createSql>;
  databaseUrl?: string;
  trueforge?: Pick<TrueForgeClientType, "createTurn" | "listTurns" | "cancelSession">;
  loadTurnCreateContext?: (agentTurnId: string) => Promise<{
    applicationRunToken: string;
    content: string;
    previousTrueforgeTurnId: string | null;
    localTrueforgeTurnId: string | null;
    trueforgeSessionId: string;
  } | null>;
  /** When true (default with sql), mark active turns needs_attention on start. */
  markNeedsAttentionOnStart?: boolean;
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
): Promise<
  IngestRunEventResult & { runLifecycle?: Awaited<ReturnType<typeof refreshRunLifecycle>> }
> {
  const event = normalizeTrueForgeEvent({
    ...command.payload.event_payload,
    type: command.payload.upstream_event_type,
    id: command.payload.upstream_event_id,
  });
  const turnDoneOutcome =
    event.normalizedType === "turn.done" ? evaluateTurnDoneOutcome(event.payloadRedacted) : null;
  const ingest = await ingestNormalizedTrueForgeEvent(sql, {
    agentTurnId: command.payload.agent_turn_id,
    expectedTurnStates: [command.payload.expected_turn_state, "streaming", "creating"],
    event,
    turnDoneOutcome,
  });
  if (!ingest.ok || !ingest.turnOutcome) {
    return ingest;
  }
  const runLifecycle = await refreshRunLifecycle(sql, { runId: command.payload.run_id });
  return { ...ingest, runLifecycle };
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

      await resolved.executeCommand?.(command);
      return { command };
    },
  };
}
