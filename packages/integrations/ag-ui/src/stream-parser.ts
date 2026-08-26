import {
  EventType,
  getRunOutcome,
  runHttpRequest,
  transformHttpEventStream,
  type BaseEvent,
  type RunFinishedEvent,
} from "@ag-ui/client";
import { readProviderFixtureJson } from "@forgeroom/test-fixtures";
import { lastValueFrom } from "rxjs";
import { toArray } from "rxjs/operators";

type TrueForgeStreamFixture = {
  sseBody: string;
  threadId: string;
  runId: string;
  expectedEventTypes: string[];
  expectedInterrupt: {
    id: string;
    reason: string;
    usesMetadataNotPayload: boolean;
    metadata: { forgeroom: Record<string, unknown> };
  };
};

export function loadTrueForgeStreamFixture(): TrueForgeStreamFixture {
  return readProviderFixtureJson<TrueForgeStreamFixture>("ag-ui/trueforge-stream.fixture.json");
}

export async function parseAgUiSseBody(sseBody: string): Promise<BaseEvent[]> {
  const response = new Response(sseBody, {
    status: 200,
    headers: { "content-type": "text/event-stream" },
  });
  return lastValueFrom(
    transformHttpEventStream(runHttpRequest(async () => response)).pipe(toArray()),
  );
}

export async function parseTrueForgeStreamFixture(
  fixture: TrueForgeStreamFixture = loadTrueForgeStreamFixture(),
): Promise<BaseEvent[]> {
  return parseAgUiSseBody(fixture.sseBody);
}

export function assertTrueForgeFixtureShape(
  events: BaseEvent[],
  fixture: TrueForgeStreamFixture = loadTrueForgeStreamFixture(),
): void {
  const types = events.map((event) => event.type);
  if (types.length !== fixture.expectedEventTypes.length)
    throw new Error(`expected ${fixture.expectedEventTypes.length} events, parsed ${types.length}`);
  for (let i = 0; i < fixture.expectedEventTypes.length; i += 1) {
    if (types[i] !== fixture.expectedEventTypes[i])
      throw new Error(
        `event ${i + 1} expected ${fixture.expectedEventTypes[i]} but parsed ${types[i]}`,
      );
  }

  const started = events.find((event) => event.type === EventType.RUN_STARTED);
  if (!started || started.type !== EventType.RUN_STARTED)
    throw new Error("fixture must include RUN_STARTED");
  if (started.threadId !== fixture.threadId || started.runId !== fixture.runId)
    throw new Error("RUN_STARTED thread/run IDs must match fixture header");

  const activity = events.find((event) => event.type === EventType.ACTIVITY_SNAPSHOT);
  if (!activity || activity.type !== EventType.ACTIVITY_SNAPSHOT)
    throw new Error("fixture must include ACTIVITY_SNAPSHOT");
  if (!activity.messageId) throw new Error("ACTIVITY_SNAPSHOT requires messageId");

  const finished = events.find((event) => event.type === EventType.RUN_FINISHED);
  if (!finished || finished.type !== EventType.RUN_FINISHED)
    throw new Error("fixture must include RUN_FINISHED");

  const outcome = getRunOutcome(finished as RunFinishedEvent);
  if (!outcome || outcome.type !== "interrupt")
    throw new Error("fixture RUN_FINISHED must end with interrupt outcome");

  const interrupt = outcome.interrupts[0];
  if (!interrupt) throw new Error("fixture interrupt outcome must include at least one interrupt");
  if (interrupt.id !== fixture.expectedInterrupt.id)
    throw new Error("interrupt id must match fixture expectation");
  if (interrupt.reason !== fixture.expectedInterrupt.reason)
    throw new Error("interrupt reason must match fixture expectation");
  if (fixture.expectedInterrupt.usesMetadataNotPayload && "payload" in interrupt)
    throw new Error("interrupt must use metadata, not payload");

  const metadata = interrupt.metadata?.forgeroom as Record<string, unknown> | undefined;
  const expected = fixture.expectedInterrupt.metadata.forgeroom;
  if (metadata?.interruptKind !== expected.interruptKind)
    throw new Error("interrupt metadata.forgeroom.interruptKind must match fixture");
  if (metadata?.uiInstanceId !== expected.uiInstanceId)
    throw new Error("interrupt metadata.forgeroom.uiInstanceId must match fixture");
}
