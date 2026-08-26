import { internalWorkerCommandSchema, type InternalWorkerCommand } from "@forgeroom/contracts";
import { startWorker } from "@forgeroom/orchestration";

export function parseWorkerCommand(input: unknown): InternalWorkerCommand {
  return internalWorkerCommandSchema.parse(input);
}

export type WorkerCommandExecutor = (command: InternalWorkerCommand) => void | Promise<void>;

export function startWorkerProcess(executeCommand?: WorkerCommandExecutor) {
  const worker = startWorker({ embedded: false });
  return {
    ...worker,
    async dispatchCommand(input: unknown) {
      const command = parseWorkerCommand(input);
      await executeCommand?.(command);
      return command;
    },
  };
}
