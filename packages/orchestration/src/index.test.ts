import { describe, expect, it } from "vitest";
import { startWorker } from "./index";

describe("worker runtime", () => {
  it("starts and stops independently of the API process", async () => {
    const handle = startWorker();
    expect(handle.kind).toBe("worker");
    expect(handle.embedded).toBe(false);
    await handle.stop();
  });

  it("can be embedded in another process without changing its kind", () => {
    expect(startWorker({ embedded: true }).embedded).toBe(true);
  });
});
