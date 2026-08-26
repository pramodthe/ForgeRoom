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

export { TEAM_MENTION, extractMentionTokens, resolveMessageRecipients } from "./router";
export type { MentionRouterCoworker, ResolveMessageRecipientsInput } from "./router";
