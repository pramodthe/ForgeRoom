export type WorkerHandle = {
  readonly kind: "worker";
  readonly embedded: boolean;
  stop: () => Promise<void>;
};

export type WorkerStartOptions = {
  embedded?: boolean;
};

export function startWorker(options: WorkerStartOptions = {}): WorkerHandle {
  const embedded = options.embedded ?? false;

  return {
    kind: "worker",
    embedded,
    async stop() {
      return;
    },
  };
}
