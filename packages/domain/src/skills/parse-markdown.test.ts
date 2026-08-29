import { describe, expect, it } from "vitest";
import { parseSkillDraftMarkdown } from "./parse-markdown";

describe("parseSkillDraftMarkdown", () => {
  it("parses instruction-only markdown sections", () => {
    const parsed = parseSkillDraftMarkdown(`# Saved run skill

## When to use
After reconciling a completed support review run.

## Inputs
- Date range
- Support dataset artifact

## Method
1. Read bounded evidence
2. Validate totals
3. Publish artifacts

## Validation
Every claim cites a source revision.

## Output
TaskRecord and PDF brief.

## Failures
- Stop when required tools are unavailable
`);
    expect(parsed.when_to_use).toContain("support review");
    expect(parsed.inputs).toEqual(["Date range", "Support dataset artifact"]);
    expect(parsed.method).toHaveLength(3);
    expect(parsed.validation).toContain("source revision");
    expect(parsed.output).toContain("PDF brief");
    expect(parsed.failures[0]).toContain("unavailable");
  });
});
