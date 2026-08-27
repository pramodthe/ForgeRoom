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

export {
  CHANNEL_CONTEXT_VERSION,
  MAX_CHANNEL_CONTEXT_BYTES,
  MAX_CONTEXT_SUMMARY_CHARS,
  MAX_CONTEXT_PINS,
  MAX_CONTEXT_ARTIFACTS,
  MAX_RECENT_DELTAS,
  MAX_DELTA_SUMMARY_CHARS,
  MAX_HUMAN_REQUEST_CHARS,
  UNTRUSTED_CONTENT_NOTICE,
  buildChannelContextEnvelope,
  renderChannelContextText,
  nextDeliveryCursor,
  envelopeDeliveredThroughSequence,
  measureChannelContextBytes,
} from "./context-envelope";
export type {
  BuildChannelContextInput,
  TurnCreationStatus,
  DeliveryCursorAdvanceInput,
  DeliveryCursorAdvanceResult,
} from "./context-envelope";
export {
  TEAM_MENTION,
  AVAILABLE_CHANNEL_AGENT_SESSION_STATES,
  extractMentionTokens,
  isChannelAgentSessionAvailable,
  resolveMessageRecipients,
} from "./router";
export type { MentionRouterCoworker, ResolveMessageRecipientsInput } from "./router";
export {
  TURN_QUEUE_INPUT_TYPES,
  TURN_QUEUE_PRIORITY,
  priorityForInputType,
  evaluateClaimEligibility,
  resolveClaimGenerationBinding,
  compareClaimOrder,
} from "./turn-queue";
export type {
  TurnQueueInputType,
  ChannelAgentSessionClaimState,
  ClaimEligibility,
} from "./turn-queue";
