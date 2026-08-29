import { describe, expect, it } from "vitest";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
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
});
