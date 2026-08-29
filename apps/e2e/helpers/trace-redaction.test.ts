import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { scanPlaywrightArtifacts } from "./trace-redaction";

describe("scanPlaywrightArtifacts", () => {
  it("flags forbidden secret-like patterns and passes clean traces", () => {
    const root = join(tmpdir(), `forgeroom-e2e-scan-${Date.now()}`);
    mkdirSync(root, { recursive: true });
    writeFileSync(join(root, "clean.txt"), "Timeline live. coworker needs input.");
    expect(scanPlaywrightArtifacts([root]).hits).toEqual([]);

    writeFileSync(join(root, "dirty.txt"), "authorization: Bearer abcdefghijklmnop");
    expect(scanPlaywrightArtifacts([root]).hits.length).toBeGreaterThan(0);
    rmSync(root, { recursive: true, force: true });
  });

  it("does not mistake model-provider identifiers for credentials", () => {
    const root = join(tmpdir(), `forgeroom-e2e-scan-fixture-${Date.now()}`);
    mkdirSync(root, { recursive: true });
    writeFileSync(
      join(root, "login.json"),
      JSON.stringify({
        model_provider: "openai",
        model_preset: "openai/gpt-5-4-mini",
      }),
    );
    expect(scanPlaywrightArtifacts([root]).hits).toEqual([]);
    rmSync(root, { recursive: true, force: true });
  });

  it("expands compressed Playwright archives before scanning for sensitive payloads", () => {
    const root = join(tmpdir(), `forgeroom-e2e-scan-zip-${Date.now()}`);
    const entry = join(root, "trace.network");
    const archive = join(root, "trace.zip");
    mkdirSync(root, { recursive: true });
    try {
      const secret = "Bearer abcdefghijklmnopqrstuvwxyz123456";
      writeFileSync(entry, `${"repeated trace data ".repeat(2_000)}${secret}`);
      execFileSync("zip", ["-q", archive, "trace.network"], { cwd: root });
      rmSync(entry);

      // Prove the canary is deflated rather than directly visible in ZIP bytes.
      expect(readFileSync(archive, "latin1")).not.toContain(secret);
      expect(scanPlaywrightArtifacts([root])).toMatchObject({
        scannedFiles: 1,
        hits: [{ file: archive }],
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("fails when the known E2E fixture credential is present in trace evidence", () => {
    const root = join(tmpdir(), `forgeroom-e2e-scan-fixture-${Date.now()}`);
    mkdirSync(root, { recursive: true });
    writeFileSync(join(root, "trace.json"), JSON.stringify({ password: "correct-horse-battery" }));

    const result = scanPlaywrightArtifacts([root]);
    expect(result.hits).toHaveLength(1);
    expect(result.hits[0]?.pattern).toContain("password");
    rmSync(root, { recursive: true, force: true });
  });

  it("fails closed when a trace archive cannot be expanded", () => {
    const root = join(tmpdir(), `forgeroom-e2e-scan-corrupt-${Date.now()}`);
    mkdirSync(root, { recursive: true });
    try {
      const archive = join(root, "trace.zip");
      writeFileSync(archive, "not a zip archive");
      expect(scanPlaywrightArtifacts([root])).toMatchObject({
        scannedFiles: 1,
        hits: [{ file: archive, pattern: "/FORGEROOM_TRACE_ARCHIVE_UNREADABLE/g" }],
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
