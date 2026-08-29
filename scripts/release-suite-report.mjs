import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

function count(report, key, packageName) {
  const value = report[key];
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${packageName} produced an invalid Vitest JSON report (${key}).`);
  }
  return value;
}

export function validateVitestReleaseResult({ packageName, result, readReport }) {
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`${packageName} failed with exit code ${String(result.status ?? 1)}.`);
  }

  let report;
  try {
    report = JSON.parse(readReport());
  } catch (error) {
    throw new Error(`${packageName} did not produce a valid Vitest JSON report.`, { cause: error });
  }
  if (!report || typeof report !== "object" || Array.isArray(report)) {
    throw new Error(`${packageName} did not produce a valid Vitest JSON report.`);
  }

  const total = count(report, "numTotalTests", packageName);
  const skipped =
    count(report, "numPendingTests", packageName) + count(report, "numTodoTests", packageName);
  if (total < 1) {
    throw new Error(`${packageName} did not execute any tests.`);
  }
  if (skipped !== 0) {
    throw new Error(`${packageName} reported ${String(skipped)} skipped or todo tests.`);
  }
}

export function withTemporaryVitestReport(
  run,
  { makeDirectory = mkdtempSync, removeDirectory = rmSync, temporaryRoot = tmpdir() } = {},
) {
  const reportDirectory = makeDirectory(join(temporaryRoot, "forgeroom-release-suite-"));
  try {
    return run(join(reportDirectory, "vitest.json"));
  } finally {
    removeDirectory(reportDirectory, { recursive: true, force: true });
  }
}
