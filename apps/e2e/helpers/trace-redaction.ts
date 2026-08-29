import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/** Patterns that must never appear in Playwright traces or screenshots metadata. */
const FORBIDDEN: RegExp[] = [
  /FORGEROOM_TRACE_ARCHIVE_UNREADABLE/g,
  /sk-[A-Za-z0-9]{20,}/g,
  /api[_-]?key["']?\s*[:=]\s*["']?[A-Za-z0-9_-]{16,}/gi,
  /Bearer\s+[A-Za-z0-9\-._~+/]{16,}/g,
  // Credential env / secret material — not model_provider enum values like "openai".
  /composio_api|daytona_api|OPENAI_API_KEY|ANTHROPIC_API_KEY/gi,
  /"reasoning"\s*:/gi,
  /rawEvent/g,
  /raw[_-]?input["']?\s*[:=]\s*["'][^"']{4,}/gi,
  /mount[_-]?nonce["']?\s*[:=]\s*["'][A-Za-z0-9_-]{8,}/gi,
  /interaction[_-]?token["']?\s*[:=]\s*["'][A-Za-z0-9_-]{16,}/gi,
  /password["']?\s*[:=]\s*["'][^"']{4,}/gi,
];

/**
 * Trace content safe for release evidence.
 *
 * Playwright records network request/response payloads when DOM snapshots are
 * enabled. Those payloads include one-use interaction tokens by design, so the
 * release suite keeps the action timeline and screenshots while excluding DOM
 * snapshots, network payloads and local source files at capture time.
 */
export const SAFE_TRACE_CONTENT_OPTIONS = {
  screenshots: true,
  snapshots: false,
  sources: false,
} as const;

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

function readArtifactBody(file: string): string {
  const raw = readFileSync(file, "latin1");
  if (!file.endsWith(".zip")) return raw;
  try {
    // Playwright traces are ZIP archives. Scan the expanded entry streams too;
    // secret-like values are normally invisible in the raw deflated bytes.
    const expanded = execFileSync("unzip", ["-p", file], {
      encoding: "latin1",
      maxBuffer: 256 * 1024 * 1024,
      stdio: ["ignore", "pipe", "ignore"],
    });
    return `${raw}\n${expanded}`;
  } catch {
    // Fail closed: an unreadable archive cannot provide redaction evidence.
    return `${raw}\nFORGEROOM_TRACE_ARCHIVE_UNREADABLE`;
  }
}

/**
 * Best-effort redaction scan over Playwright output, including decompressed ZIP entries.
 */
export function scanPlaywrightArtifacts(rootDirs: string[]): TraceScanResult {
  const hits: TraceScanResult["hits"] = [];
  let scannedFiles = 0;
  for (const root of rootDirs) {
    for (const file of walk(root)) {
      scannedFiles += 1;
      // Scan the evidence exactly as emitted. Known fixture credentials are still
      // credentials in a trace and must make the release gate fail, not be erased
      // in-memory before inspection.
      const body = readArtifactBody(file);
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
