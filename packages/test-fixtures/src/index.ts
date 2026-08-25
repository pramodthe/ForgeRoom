export const FORBIDDEN_P0_101_DEPENDENCY_PATTERNS = [
  /^@ag-ui\//,
  /^@copilotkit\//,
  /copilotkit/i,
] as const;

export function isForbiddenP0101Dependency(name: string): boolean {
  return FORBIDDEN_P0_101_DEPENDENCY_PATTERNS.some((pattern) => pattern.test(name));
}
