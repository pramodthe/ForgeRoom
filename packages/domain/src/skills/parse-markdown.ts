export type ParsedSkillDraftNarrative = {
  when_to_use: string;
  inputs: string[];
  method: string[];
  validation: string;
  output: string;
  failures: string[];
};

type SectionKey = keyof ParsedSkillDraftNarrative;

const SECTION_ALIASES: Record<SectionKey, RegExp> = {
  when_to_use: /^(##\s*)?(when to use|when_to_use)\s*$/i,
  inputs: /^(##\s*)?(inputs?)\s*$/i,
  method: /^(##\s*)?(method|procedure)\s*$/i,
  validation: /^(##\s*)?(validation)\s*$/i,
  output: /^(##\s*)?(output|expected output)\s*$/i,
  failures: /^(##\s*)?(failures?|failure behavior|no or stale data)\s*$/i,
};

function sectionKeyForLine(line: string): SectionKey | null {
  const trimmed = line.trim();
  for (const [key, pattern] of Object.entries(SECTION_ALIASES) as Array<[SectionKey, RegExp]>) {
    if (pattern.test(trimmed)) {
      return key;
    }
  }
  return null;
}

function parseListItems(lines: readonly string[]): string[] {
  const items: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }
    const bullet = trimmed.match(/^[-*]\s+(.+)$/);
    if (bullet?.[1]) {
      items.push(bullet[1].trim());
      continue;
    }
    const numbered = trimmed.match(/^\d+\.\s+(.+)$/);
    if (numbered?.[1]) {
      items.push(numbered[1].trim());
    }
  }
  return items.filter((item) => item.length > 0);
}

function parseSectionBody(lines: readonly string[], key: SectionKey): string | string[] {
  const text = lines
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .join("\n")
    .trim();
  if (key === "inputs" || key === "method" || key === "failures") {
    const listed = parseListItems(lines);
    if (listed.length > 0) {
      return listed;
    }
    if (!text) {
      return [];
    }
    return key === "method" ? [text] : [text];
  }
  return text;
}

export function parseSkillDraftMarkdown(markdown: string): ParsedSkillDraftNarrative {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const buckets = new Map<SectionKey, string[]>();
  let current: SectionKey | null = null;

  for (const line of lines) {
    const next = sectionKeyForLine(line);
    if (next) {
      current = next;
      buckets.set(next, []);
      continue;
    }
    if (current) {
      buckets.get(current)?.push(line);
    }
  }

  const whenToUse = parseSectionBody(buckets.get("when_to_use") ?? [], "when_to_use");
  const validation = parseSectionBody(buckets.get("validation") ?? [], "validation");
  const output = parseSectionBody(buckets.get("output") ?? [], "output");
  const inputs = parseSectionBody(buckets.get("inputs") ?? [], "inputs");
  const method = parseSectionBody(buckets.get("method") ?? [], "method");
  const failures = parseSectionBody(buckets.get("failures") ?? [], "failures");

  if (typeof whenToUse !== "string" || whenToUse.length === 0) {
    throw new Error("skill_draft_markdown_missing_when_to_use");
  }
  if (typeof validation !== "string" || validation.length === 0) {
    throw new Error("skill_draft_markdown_missing_validation");
  }
  if (typeof output !== "string" || output.length === 0) {
    throw new Error("skill_draft_markdown_missing_output");
  }
  if (!Array.isArray(method) || method.length === 0) {
    throw new Error("skill_draft_markdown_missing_method");
  }

  return {
    when_to_use: whenToUse,
    inputs: Array.isArray(inputs) ? inputs : [],
    method,
    validation,
    output,
    failures: Array.isArray(failures) ? failures : [],
  };
}
