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
} as const;

export function demoChannelPath(): string {
  return `/w/${DEMO.workspaceId}/channels/${DEMO.channelId}`;
}

export function demoCoworkersPath(): string {
  return `/w/${DEMO.workspaceId}/coworkers`;
}

export function demoTasksPath(): string {
  return `/w/${DEMO.workspaceId}/tasks`;
}

export function hasProviderCredentials(): boolean {
  return Boolean(
    process.env.OPENAI_API_KEY?.trim() &&
    process.env.COMPOSIO_API_KEY?.trim() &&
    process.env.COMPOSIO_CONNECTED_ACCOUNT_ID?.trim() &&
    process.env.DAYTONA_API_KEY?.trim(),
  );
}

export function liveMode(): "off" | "api" | "providers" {
  const raw = process.env.FORGEROOM_E2E_LIVE?.trim();
  if (raw === "1" || raw === "providers") return "providers";
  if (raw === "api") return "api";
  return "off";
}
