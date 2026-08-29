import { createHash } from "node:crypto";

/** Live demo seed IDs — distinct from prototype FIXTURE ids. */
export const DEMO = {
  workspaceId: "workspace_1",
  channelId: "ch_demo_general",
  channelName: "general",
  coworkerId: "cw_demo_operator",
  coworkerHandle: "operator",
  ownerEmail: "owner@example.test",
  /** Must match OWNER_PASSWORD used for fixtures:seed / API boot. */
  ownerPassword: process.env.FORGEROOM_E2E_OWNER_PASSWORD ?? "correct-horse-battery",
  researchPrompt:
    "Create a Research coworker that can read GitHub and web data but cannot modify anything.",
  taskTitle: "Reconcile the synthetic demo record and publish a sandbox summary",
  providerFixture: {
    owner: process.env.FORGEROOM_E2E_GITHUB_OWNER ?? "",
    repository: process.env.FORGEROOM_E2E_GITHUB_REPOSITORY ?? "",
    issueNumber: 35,
    markerLabel: "forgeroom-p0-probe",
    targetHash: "sha256:acd4ff5d374ecf29a261e8175113b37132d332be66ad63daf7c5024ee271e445",
  },
} as const;

/** Env vars required for FORGEROOM_E2E_LIVE=1|providers (values never logged). */
export const PROVIDER_ENV_KEYS = [
  "OPENAI_API_KEY",
  "COMPOSIO_API_KEY",
  "COMPOSIO_CONNECTED_ACCOUNT_ID",
  "COMPOSIO_USER_ID",
  "DAYTONA_API_KEY",
  "TRUEFORGE_BASE_URL",
  "FORGEROOM_E2E_GITHUB_OWNER",
  "FORGEROOM_E2E_GITHUB_REPOSITORY",
] as const;

export function demoChannelPath(): string {
  return `/w/${DEMO.workspaceId}/channels/${DEMO.channelId}`;
}

export function demoCoworkersPath(): string {
  return `/w/${DEMO.workspaceId}/coworkers`;
}

export function demoTasksPath(): string {
  return `/w/${DEMO.workspaceId}/tasks`;
}

export function missingProviderCredentials(): string[] {
  return PROVIDER_ENV_KEYS.filter((key) => !process.env[key]?.trim());
}

export function hasProviderCredentials(): boolean {
  return missingProviderCredentials().length === 0;
}

export function providerFixtureTargetMatches(): boolean {
  const fixture = DEMO.providerFixture;
  const target = `${fixture.owner}/${fixture.repository}#${fixture.issueNumber}:${fixture.markerLabel}`;
  const hash = `sha256:${createHash("sha256").update(target).digest("hex")}`;
  return hash === fixture.targetHash;
}

export function liveMode(): "off" | "api" | "providers" {
  const raw = process.env.FORGEROOM_E2E_LIVE?.trim();
  if (raw === "1" || raw === "providers") return "providers";
  if (raw === "api") return "api";
  return "off";
}
