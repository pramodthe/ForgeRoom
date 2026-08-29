import assert from "node:assert/strict";
import test from "node:test";
import { validateVitestReleaseResult, withTemporaryVitestReport } from "./release-suite-report.mjs";

const validReport = {
  numTotalTests: 3,
  numPendingTests: 0,
  numTodoTests: 0,
};

function validate({ result = { status: 0 }, report = validReport, readReport } = {}) {
  return validateVitestReleaseResult({
    packageName: "@forgeroom/example",
    result,
    readReport: readReport ?? (() => JSON.stringify(report)),
  });
}

test("accepts a successful non-empty report with zero skips", () => {
  assert.doesNotThrow(() => validate());
});

test("rejects zero, skipped, and todo tests", async (t) => {
  const cases = [
    { name: "zero", report: { ...validReport, numTotalTests: 0 }, message: /did not execute/ },
    { name: "skipped", report: { ...validReport, numPendingTests: 1 }, message: /1 skipped/ },
    { name: "todo", report: { ...validReport, numTodoTests: 2 }, message: /2 skipped/ },
  ];
  for (const item of cases) {
    await t.test(item.name, () => {
      assert.throws(() => validate({ report: item.report }), item.message);
    });
  }
});

test("rejects malformed or incomplete Vitest reports", () => {
  assert.throws(() => validate({ readReport: () => "{" }), /valid Vitest JSON report/);
  assert.throws(() => validate({ report: {} }), /numTotalTests/);
});

test("propagates subprocess errors and rejects non-zero exits before reading the report", () => {
  const subprocessError = new Error("spawn failed");
  assert.throws(
    () => validate({ result: { error: subprocessError, status: null } }),
    subprocessError,
  );

  let reportRead = false;
  assert.throws(
    () =>
      validate({
        result: { status: 2 },
        readReport: () => {
          reportRead = true;
          return JSON.stringify(validReport);
        },
      }),
    /exit code 2/,
  );
  assert.equal(reportRead, false);
});

test("always removes the temporary report directory", () => {
  const removals = [];
  assert.throws(
    () =>
      withTemporaryVitestReport(
        (reportPath) => {
          assert.equal(reportPath, "/tmp/forgeroom-release-suite-test/vitest.json");
          throw new Error("validation failed");
        },
        {
          temporaryRoot: "/tmp",
          makeDirectory: () => "/tmp/forgeroom-release-suite-test",
          removeDirectory: (...args) => removals.push(args),
        },
      ),
    /validation failed/,
  );
  assert.deepEqual(removals, [
    ["/tmp/forgeroom-release-suite-test", { recursive: true, force: true }],
  ]);
});
