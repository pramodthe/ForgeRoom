import { EventEmitter } from "node:events";
import type { AgentChannelEnvelope } from "@forgeroom/contracts";

const EVENT_NAME = "channel_event";

/**
 * In-process fan-out after durable commit. Do not hold DB transactions open for subscribers.
 */
export class ChannelEventHub {
  private readonly emitters = new Map<string, EventEmitter>();

  private emitterFor(channelId: string): EventEmitter {
    let emitter = this.emitters.get(channelId);
    if (!emitter) {
      emitter = new EventEmitter();
      emitter.setMaxListeners(0);
      this.emitters.set(channelId, emitter);
    }
    return emitter;
  }

  publish(envelope: AgentChannelEnvelope): void {
    this.emitterFor(envelope.channelId).emit(EVENT_NAME, envelope);
  }

  subscribe(channelId: string, listener: (envelope: AgentChannelEnvelope) => void): () => void {
    const emitter = this.emitterFor(channelId);
    emitter.on(EVENT_NAME, listener);
    return () => {
      emitter.off(EVENT_NAME, listener);
      if (emitter.listenerCount(EVENT_NAME) === 0) {
        this.emitters.delete(channelId);
      }
    };
  }
}

export function createChannelEventHub(): ChannelEventHub {
  return new ChannelEventHub();
}
