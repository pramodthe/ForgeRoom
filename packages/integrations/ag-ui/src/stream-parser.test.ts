import { EventType } from "@ag-ui/core";
import { describe, expect, it } from "vitest";
import {
  assertTrueForgeFixtureShape,
  loadTrueForgeStreamFixture,
  parseTrueForgeStreamFixture,
} from "./stream-parser";

describe("parseTrueForgeStreamFixture", () => {
  it("parses the golden TrueForge SSE fixture with the official AG-UI client", async () => {
    const events = await parseTrueForgeStreamFixture();
    expect(events.length).toBeGreaterThan(0);
    expect(events[0]?.type).toBe(EventType.RUN_STARTED);
    expect(events.at(-1)?.type).toBe(EventType.RUN_FINISHED);
    expect(() => assertTrueForgeFixtureShape(events)).not.toThrow();
  });

  it("requires ACTIVITY_SNAPSHOT messageId and interrupt metadata", async () => {
    const fixture = loadTrueForgeStreamFixture();
    const events = await parseTrueForgeStreamFixture(fixture);
    const activity = events.find((event) => event.type === EventType.ACTIVITY_SNAPSHOT);
    expect(activity && "messageId" in activity ? activity.messageId : undefined).toBe("act_work_1");
    expect(fixture.expectedInterrupt.usesMetadataNotPayload).toBe(true);
    expect(() => assertTrueForgeFixtureShape(events, fixture)).not.toThrow();
  });
});
