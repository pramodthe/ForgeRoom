/** axe rules that need canvas or full browser paint are disabled under jsdom. */
import { expect } from "vitest";

export const AXE_JSDOM_OPTIONS = {
  rules: {
    "color-contrast": { enabled: false },
  },
} as const;

export function expectNoAxeViolations(
  results: Awaited<ReturnType<typeof import("vitest-axe").axe>>,
): void {
  expect(results.violations.map((violation) => `${violation.id}: ${violation.help}`)).toEqual([]);
}
