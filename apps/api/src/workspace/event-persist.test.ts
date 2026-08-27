import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { canonicalizeJson } from "@forgeroom/domain";
import { hashAguiEvent, resolveAguiEventRecordMessageOrActivityId } from "./event-persist";

describe("hashAguiEvent", () => {
  it("hashes RFC 8785 JCS UTF-8 bytes so key order does not matter", () => {
    const left = {
      type: "RUN_STARTED",
      runId: "run_1",
      threadId: "thread_1",
    };
    const right = {
      threadId: "thread_1",
      type: "RUN_STARTED",
      runId: "run_1",
    };

    const leftHash = hashAguiEvent(left);
    const rightHash = hashAguiEvent(right);
    expect(leftHash).toBe(rightHash);
    expect(leftHash).toMatch(/^sha256:[0-9a-f]{64}$/);

    const expected = createHash("sha256").update(canonicalizeJson(left), "utf8").digest("hex");
    expect(leftHash).toBe(`sha256:${expected}`);

    // Naive JSON.stringify preserves insertion order and diverges under JCS.
    expect(JSON.stringify(left)).not.toBe(JSON.stringify(right));
    expect(JSON.stringify(left)).not.toBe(canonicalizeJson(left));
  });
});

describe("resolveAguiEventRecordMessageOrActivityId", () => {
  it("stores activity messageId for ACTIVITY_* events", () => {
    expect(
      resolveAguiEventRecordMessageOrActivityId({
        type: "ACTIVITY_SNAPSHOT",
        messageId: "act_1",
        activityType: "forgeroom.coworker_work.v1",
        replace: true,
        content: {
          schemaVersion: 1,
          activityRevision: 0,
          activityType: "forgeroom.coworker_work.v1",
          coworkerId: "cw_1",
          logicalThreadId: "thread_1",
          assignment: "Inspect",
          phase: "running",
        },
      }),
    ).toBe("act_1");
    expect(
      resolveAguiEventRecordMessageOrActivityId({
        type: "ACTIVITY_DELTA",
        messageId: "act_2",
        activityType: "forgeroom.coworker_work.v1",
        patch: [
          { op: "test", path: "/activityRevision", value: 0 },
          { op: "replace", path: "/phase", value: "interrupted" },
          { op: "replace", path: "/activityRevision", value: 1 },
        ],
      }),
    ).toBe("act_2");
  });
});
