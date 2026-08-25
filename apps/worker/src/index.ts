import { startWorker } from "@forgeroom/orchestration";

export function startWorkerProcess() {
  return startWorker({ embedded: false });
}
