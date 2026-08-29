import { rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const e2eRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = join(e2eRoot, "../..");

// Playwright clears its current output directory, but the HTML reporter can
// retain content-addressed data from a prior failed run. Remove only generated
// E2E output so the redaction gate evaluates this run's evidence, not stale data.
for (const path of [
  join(e2eRoot, "test-results"),
  join(e2eRoot, "playwright-report"),
  join(repoRoot, "test-results"),
  join(repoRoot, "playwright-report"),
]) {
  rmSync(path, { recursive: true, force: true });
}
