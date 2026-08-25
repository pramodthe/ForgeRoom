import { describe, expect, it } from "vitest";
import { startWorkerProcess } from "./index";

describe("standalone worker process", () => {
  it("does not embed inside the API", () => {
    const handle = startWorkerProcess();
    expect(handle.kind).toBe("worker");
    expect(handle.embedded).toBe(false);
  });
});
