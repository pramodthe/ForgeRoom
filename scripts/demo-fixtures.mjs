#!/usr/bin/env node
/**
 * Thin launcher so root scripts stay stable.
 * Prefer: pnpm fixtures:seed / pnpm fixtures:reset
 */
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const result = spawnSync(
  "pnpm",
  [
    "--filter",
    "@forgeroom/test-fixtures",
    "exec",
    "tsx",
    "src/demo-cli.ts",
    ...process.argv.slice(2),
  ],
  { cwd: root, stdio: "inherit", shell: process.platform === "win32" },
);
process.exit(result.status ?? 1);
