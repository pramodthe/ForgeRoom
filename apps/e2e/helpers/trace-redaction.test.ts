import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { createServer } from "node:http";
import { readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { chromium, type Browser, type BrowserContext } from "@playwright/test";
import { SAFE_TRACE_CONTENT_OPTIONS, scanPlaywrightArtifacts } from "./trace-redaction";

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

  it("does not capture a browser interaction token round-trip in a safe trace", async () => {
    const root = join(tmpdir(), `forgeroom-e2e-safe-trace-${Date.now()}`);
    const archive = join(root, "trace.zip");
    const interactionToken = "interaction-token-canary-abcdefghijklmnopqrstuvwxyz";
    mkdirSync(root, { recursive: true });

    const server = createServer((request, response) => {
      if (request.url === "/") {
        response.setHeader("content-type", "text/html");
        response.end(`
          <button id="submit">Apply filter</button>
          <output id="status"></output>
          <script>
            document.querySelector("#submit").addEventListener("click", async () => {
              const tokenResponse = await fetch("/interaction-token", { method: "POST" });
              const token = await tokenResponse.json();
              await fetch("/commit", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify(token),
              });
              document.querySelector("#status").textContent = "done";
            });
          </script>
        `);
        return;
      }
      if (request.url === "/interaction-token") {
        response.setHeader("content-type", "application/json");
        response.end(JSON.stringify({ interaction_token: interactionToken }));
        return;
      }
      response.statusCode = 204;
      response.end();
    });

    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address();
    if (!address || typeof address === "string") {
      server.close();
      throw new Error("safe trace test server did not bind to a TCP port");
    }

    let browser: Browser | undefined;
    let context: BrowserContext | undefined;
    try {
      browser = await chromium.launch({ headless: true });
      context = await browser.newContext();
      await context.tracing.start(SAFE_TRACE_CONTENT_OPTIONS);
      const page = await context.newPage();
      await page.goto(`http://127.0.0.1:${address.port}`);
      await page.getByRole("button", { name: "Apply filter" }).click();
      await page.getByText("done").waitFor();
      await context.tracing.stop({ path: archive });

      expect(scanPlaywrightArtifacts([root])).toMatchObject({
        scannedFiles: 1,
        hits: [],
      });
      expect(execFileSync("unzip", ["-p", archive], { encoding: "latin1" })).not.toContain(
        interactionToken,
      );
    } finally {
      await context?.close();
      await browser?.close();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      rmSync(root, { recursive: true, force: true });
    }
  });
});
