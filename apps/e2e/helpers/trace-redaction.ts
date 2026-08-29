import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/** Patterns that must never appear in Playwright traces or screenshots metadata. */
const FORBIDDEN: RegExp[] = [
  /sk-[A-Za-z0-9]{20,}/g,
  /api[_-]?key["']?\s*[:=]\s*["']?[A-Za-z0-9_-]{16,}/gi,
  /Bearer\s+[A-Za-z0-9\-._~+/]{16,}/g,
  // Credential env / secret material — not model_provider enum values like "openai".
  /composio_api|daytona_api|OPENAI_API_KEY|ANTHROPIC_API_KEY/gi,
  /"reasoning"\s*:/gi,
  /rawEvent/g,
  /password["']?\s*[:=]\s*["'][^"']{4,}/gi,
];

export type TraceScanResult = {
  scannedFiles: number;
  hits: Array<{ file: string; pattern: string }>;
};

function walk(dir: string, out: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    const path = join(dir, entry);
    const st = statSync(path);
    if (st.isDirectory()) {
      walk(path, out);
    } else if (
      st.isFile() &&
      (path.endsWith(".zip") || path.endsWith(".json") || path.endsWith(".txt"))
    ) {
      out.push(path);
    }
  }
  return out;
}

/**
 * Disposable demo seed password used by fixtures / CI live E2E — not a production secret.
 * Scrubbed before the password-field pattern so API-login traces can pass the scan.
 */
function scrubKnownFixturePassword(body: string): string {
  const fixture = process.env.FORGEROOM_E2E_OWNER_PASSWORD?.trim() || "correct-horse-battery";
  if (!fixture) return body;
  return body.split(fixture).join("x");
}

/**
 * Best-effort redaction scan over Playwright output.
 * ZIP bodies are scanned as latin1 text so compressed payloads still match string secrets.
 */
export function scanPlaywrightArtifacts(rootDirs: string[]): TraceScanResult {
  const hits: TraceScanResult["hits"] = [];
  let scannedFiles = 0;
  for (const root of rootDirs) {
    for (const file of walk(root)) {
      scannedFiles += 1;
      const body = scrubKnownFixturePassword(readFileSync(file, "latin1"));
      for (const pattern of FORBIDDEN) {
        pattern.lastIndex = 0;
        if (pattern.test(body)) {
          hits.push({ file, pattern: String(pattern) });
        }
      }
    }
  }
  return { scannedFiles, hits };
}
