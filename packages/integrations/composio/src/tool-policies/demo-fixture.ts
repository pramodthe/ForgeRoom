/** Frozen synthetic demo write/reconcile target (demo.md / tools.candidate.json). */
export const P0_DEMO_GITHUB_ISSUE = {
  owner: "pramodthe",
  repo: "ForgeRoom",
  issueNumber: 35,
  syntheticLabel: "forgeroom-p0-probe",
} as const;

export function formatGithubIssueDisplay(owner: string, repo: string, issueNumber: number): string {
  return `${owner}/${repo}#${issueNumber}`;
}
