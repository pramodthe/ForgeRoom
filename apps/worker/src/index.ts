import { internalWorkerCommandSchema, type InternalWorkerCommand } from "@forgeroom/contracts";
import {
  claimTurnQueueItem,
  createSql,
  type ClaimTurnQueueItemResult,
} from "@forgeroom/db";
import { startWorker } from "@forgeroom/orchestration";

export function parseWorkerCommand(input: unknown): InternalWorkerCommand {
  return internalWorkerCommandSchema.parse(input);
}

export type WorkerCommandExecutor = (command: InternalWorkerCommand) => void | Promise<void>;

export type ClaimQueueItemDispatchResult = {
  command: InternalWorkerCommand;
  claim?: ClaimTurnQueueItemResult;
};

export type WorkerProcessOptions = {
  executeCommand?: WorkerCommandExecutor;
  /** When set, claim_queue_item runs against this client. */
  sql?: ReturnType<typeof createSql>;
  databaseUrl?: string;
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

export function startWorkerProcess(options: WorkerProcessOptions | WorkerCommandExecutor = {}) {
  const resolved: WorkerProcessOptions =
    typeof options === "function" ? { executeCommand: options } : options;
  const worker = startWorker({ embedded: false });
  let sql = resolved.sql;
  const canClaim = Boolean(resolved.sql || resolved.databaseUrl);

  return {
    ...worker,
    async dispatchCommand(input: unknown): Promise<ClaimQueueItemDispatchResult> {
      const command = parseWorkerCommand(input);
      if (command.name === "claim_queue_item" && canClaim) {
        sql ??= createSql(resolved.databaseUrl);
        const claim = await executeClaimQueueItem(sql, command);
        if (claim.ok) {
          await resolved.executeCommand?.(command);
        }
        return { command, claim };
      }
      await resolved.executeCommand?.(command);
      return { command };
    },
  };
}
