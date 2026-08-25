export const TRUEFORGE_INTEGRATION = "pending-P0-201" as const;

export function describeTrueForgeBoundary(): {
  harness: "trueforge";
  sdk: "pending-P0-201";
  nativeSubagents: "disabled";
} {
  return {
    harness: "trueforge",
    sdk: "pending-P0-201",
    nativeSubagents: "disabled",
  };
}
