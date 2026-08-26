import { describe, expect, it } from "vitest";
import {
  buildChannelContextEnvelope,
  envelopeDeliveredThroughSequence,
  MAX_CHANNEL_CONTEXT_BYTES,
  measureChannelContextBytes,
  nextDeliveryCursor,
  renderChannelContextText,
} from "./context-envelope";

const HASH = `sha256:${"ab".repeat(32)}`;

function baseInput() {
  return {
    channel: {
      id: "channel_a",
      name: "Launch",
      mission_brief: "Ship the demo",
      summary: "Owner pinned the brief and asked Operator to reconcile.",
      expected_channel_id: "channel_a",
    },
    roster: [
      {
        participant_type: "human" as const,
        participant_id: "user_owner",
        role: "owner",
        name: "Owner",
      },
      {
        participant_type: "coworker" as const,
        participant_id: "cw_operator",
        role: "member",
        handle: "operator",
        name: "Operator",
      },
    ],
    assignment: {
      coworker_id: "cw_operator",
      run_id: "run_1",
      run_step_id: "step_1",
      goal: "Reconcile the demo record",
      objective: "Publish a sandbox summary",
    },
    pins: [
      {
        id: "pin_1",
        label: "Mission brief",
        source_message_id: "msg_1",
        source_artifact_id: null,
      },
    ],
    artifacts: [
      {
        id: "artifact_1",
        name: "summary.md",
        kind: "file" as const,
        mime_type: "text/markdown",
        revision: 1,
        sha256: HASH,
      },
    ],
    recent_deltas: [
      { sequence: 1, type: "message.created", summary: "Owner: please reconcile" },
      { sequence: 2, type: "pin.created", summary: "Pinned Mission brief" },
    ],
    human_request: "Please reconcile the demo record.",
    last_delivered_channel_sequence: 0,
  };
}

describe("channel context envelope", () => {
  it("snapshots mission, roster, assignment, pins, artifacts, summary and deltas", () => {
    const envelope = buildChannelContextEnvelope(baseInput());
    expect(envelope.version).toBe("CHANNEL_CONTEXT_V1");
    expect(envelope.channel.mission_brief).toBe("Ship the demo");
    expect(envelope.roster).toHaveLength(2);
    expect(envelope.assignment?.coworker_id).toBe("cw_operator");
    expect(envelope.pins[0]?.source_message_id).toBe("msg_1");
    expect(envelope.artifacts[0]?.id).toBe("artifact_1");
    expect(envelope.summary).toContain("Owner pinned");
    expect(envelope.recent_deltas.map((d) => d.sequence)).toEqual([1, 2]);
    expect(envelope.untrusted_content_notice.length).toBeGreaterThan(20);
    expect(renderChannelContextText(envelope)).toContain("END_CHANNEL_CONTEXT");
  });

  it("excludes credentials and reasoning keys from the envelope", () => {
    const dirty = baseInput();
    (dirty as { assignment: Record<string, unknown> }).assignment = {
      ...dirty.assignment!,
      credentials: { api_key: "sk-live" },
      reasoning: "secret chain",
      password: "nope",
    };
    const envelope = buildChannelContextEnvelope(dirty);
    const raw = JSON.stringify(envelope);
    expect(raw).not.toContain("sk-live");
    expect(raw).not.toContain("secret chain");
    expect(raw).not.toContain('"credentials"');
    expect(raw).not.toContain('"reasoning"');
    expect(raw).not.toContain('"password"');
  });

  it("bounds envelope size by truncating recent deltas", () => {
    const input = baseInput();
    input.recent_deltas = Array.from({ length: 200 }, (_, i) => ({
      sequence: i + 1,
      type: "message.created",
      summary: `delta ${i} ${"x".repeat(400)}`,
    }));
    const envelope = buildChannelContextEnvelope(input);
    expect(measureChannelContextBytes(envelope)).toBeLessThanOrEqual(MAX_CHANNEL_CONTEXT_BYTES);
    expect(envelope.recent_deltas.length).toBeLessThan(200);
    expect(envelope.channel.id).toBe("channel_a");
  });

  it("omits deltas at or before the delivery cursor", () => {
    const input = baseInput();
    input.last_delivered_channel_sequence = 1;
    const envelope = buildChannelContextEnvelope(input);
    expect(envelope.recent_deltas.map((d) => d.sequence)).toEqual([2]);
    expect(envelope.last_delivered_channel_sequence).toBe(1);
  });

  it("keeps the oldest contiguous undelivered page, never the newest tail", () => {
    const input = baseInput();
    input.last_delivered_channel_sequence = 0;
    input.recent_deltas = Array.from({ length: 40 }, (_, i) => ({
      sequence: i + 1,
      type: "message.created",
      summary: `delta ${i + 1}`,
    }));
    const envelope = buildChannelContextEnvelope(input);
    expect(envelope.recent_deltas[0]?.sequence).toBe(1);
    expect(envelope.recent_deltas.map((d) => d.sequence)).toEqual(
      Array.from({ length: envelope.recent_deltas.length }, (_, i) => i + 1),
    );
    expect(envelope.recent_deltas.at(-1)?.sequence).toBeLessThanOrEqual(32);
  });

  it("refuses cross-channel id mismatch", () => {
    const input = baseInput();
    input.channel.expected_channel_id = "channel_other";
    expect(() => buildChannelContextEnvelope(input)).toThrow(/cross-channel/);
  });
});

describe("delivery cursor", () => {
  it("advances only after confirmed or reconciled turn creation", () => {
    expect(
      nextDeliveryCursor({
        current_sequence: 2,
        delivered_through_sequence: 5,
        turn_creation: "pending",
      }),
    ).toEqual({
      advanced: false,
      next_sequence: 2,
      reason: "turn_not_confirmed",
    });
    expect(
      nextDeliveryCursor({
        current_sequence: 2,
        delivered_through_sequence: 5,
        turn_creation: "uncertain",
      }).advanced,
    ).toBe(false);
    expect(
      nextDeliveryCursor({
        current_sequence: 2,
        delivered_through_sequence: 5,
        turn_creation: "failed",
      }).advanced,
    ).toBe(false);
    expect(
      nextDeliveryCursor({
        current_sequence: 2,
        delivered_through_sequence: 5,
        turn_creation: "confirmed",
      }),
    ).toEqual({
      advanced: true,
      next_sequence: 5,
      reason: "advanced",
    });
    expect(
      nextDeliveryCursor({
        current_sequence: 5,
        delivered_through_sequence: 7,
        turn_creation: "reconciled",
      }),
    ).toEqual({
      advanced: true,
      next_sequence: 7,
      reason: "advanced",
    });
  });

  it("does not move the cursor backwards", () => {
    expect(
      nextDeliveryCursor({
        current_sequence: 9,
        delivered_through_sequence: 4,
        turn_creation: "confirmed",
      }),
    ).toEqual({
      advanced: false,
      next_sequence: 9,
      reason: "sequence_not_forward",
    });
  });

  it("reports the highest sequence included in an envelope", () => {
    const envelope = buildChannelContextEnvelope({
      channel: {
        id: "channel_1",
        name: "Test",
        mission_brief: "Brief",
        expected_channel_id: "channel_1",
      },
      roster: [],
      assignment: null,
      pins: [],
      artifacts: [],
      recent_deltas: [
        { sequence: 3, type: "message.created", summary: "a" },
        { sequence: 5, type: "pin.created", summary: "b" },
      ],
      human_request: "Hi",
      last_delivered_channel_sequence: 2,
    });
    expect(envelopeDeliveredThroughSequence(envelope)).toBe(5);
    expect(
      envelopeDeliveredThroughSequence({
        ...envelope,
        recent_deltas: [],
      }),
    ).toBe(2);
  });
});
