import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { canonicalizeJson } from "@forgeroom/domain";
import { hashAguiEvent } from "./event-persist";

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
