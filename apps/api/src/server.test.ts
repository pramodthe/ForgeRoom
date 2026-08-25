import { describe, expect, it } from "vitest";
import { startWorker } from "@forgeroom/orchestration";
import { loadApiEnv } from "./env";
import { createApiApp } from "./server";

describe("createApiApp", () => {
  it("serves health without provider credentials", async () => {
    const app = createApiApp();
    const response = await app.request("/health");
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      service: "forgeroom-api",
    });
  });
});

describe("API/worker separability", () => {
  it("loads the worker runtime from orchestration, not from apps/worker", () => {
    const worker = startWorker({ embedded: true });
    expect(worker.kind).toBe("worker");
    expect(worker.embedded).toBe(true);
  });

  it("defaults to 0.0.0.0 and PORT from the environment", () => {
    expect(loadApiEnv({ PORT: "4123" })).toMatchObject({
      host: "0.0.0.0",
      port: 4123,
      embedWorker: true,
    });
    expect(loadApiEnv({ FORGEROOM_EMBED_WORKER: "false" }).embedWorker).toBe(false);
  });
});
