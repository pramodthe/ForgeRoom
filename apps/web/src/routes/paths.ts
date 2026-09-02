/** P0 route paths and helpers aligned with specs/001-forgeroom-foundation/ux.md */

export const DEMO_WORKSPACE_ID = "workspace_1";

export const P0_ROUTES = {
  login: "/login",
  onboarding: "/onboarding",
  root: "/",
  workspaceFeed: "/w/$workspaceId/feed",
  workspaceChannel: "/w/$workspaceId/channels/$channelId",
  workspaceTasks: "/w/$workspaceId/tasks",
  workspaceTaskDetail: "/w/$workspaceId/tasks/$taskId",
  workspaceCoworkers: "/w/$workspaceId/coworkers",
  workspaceCoworkerDetail: "/w/$workspaceId/coworkers/$coworkerId",
  workspaceSkills: "/w/$workspaceId/skills",
  workspaceSkillDetail: "/w/$workspaceId/skills/$skillId",
  workspaceConnections: "/w/$workspaceId/connections",
} as const;

function segment(value: string): string {
  return encodeURIComponent(value);
}

export function loginPath(): string {
  return P0_ROUTES.login;
}

export function onboardingPath(): string {
  return P0_ROUTES.onboarding;
}

export function workspaceFeedPath(workspaceId: string): string {
  return `/w/${segment(workspaceId)}/feed`;
}

export function workspaceChannelsPath(workspaceId: string): string {
  return `/w/${segment(workspaceId)}/channels`;
}

export function workspaceChannelPath(workspaceId: string, channelId: string): string {
  return `/w/${segment(workspaceId)}/channels/${segment(channelId)}`;
}

export function workspaceTasksPath(workspaceId: string): string {
  return `/w/${segment(workspaceId)}/tasks`;
}

export function workspaceTaskDetailPath(workspaceId: string, taskId: string): string {
  return `/w/${segment(workspaceId)}/tasks/${segment(taskId)}`;
}

export function workspaceCoworkersPath(workspaceId: string): string {
  return `/w/${segment(workspaceId)}/coworkers`;
}

export function workspaceCoworkerDetailPath(workspaceId: string, coworkerId: string): string {
  return `/w/${segment(workspaceId)}/coworkers/${segment(coworkerId)}`;
}

export function workspaceSkillsPath(workspaceId: string): string {
  return `/w/${segment(workspaceId)}/skills`;
}

export function workspaceSkillDetailPath(workspaceId: string, skillId: string): string {
  return `/w/${segment(workspaceId)}/skills/${segment(skillId)}`;
}

export function workspaceConnectionsPath(workspaceId: string): string {
  return `/w/${segment(workspaceId)}/connections`;
}

const WORKSPACE_PREFIX = /^\/w\/([^/]+)/;

export function parseWorkspaceIdFromPath(pathname: string): string | null {
  const match = WORKSPACE_PREFIX.exec(pathname);
  if (!match?.[1]) {
    return null;
  }
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
}

export function isWorkspaceRoute(pathname: string): boolean {
  return WORKSPACE_PREFIX.test(pathname);
}

export function isLoginRoute(pathname: string): boolean {
  return pathname === P0_ROUTES.login;
}

export function isSafePostLoginRedirect(pathname: string): boolean {
  if (!pathname.startsWith("/") || pathname.startsWith("//")) {
    return false;
  }
  if (pathname.includes("://")) {
    return false;
  }
  if (isLoginRoute(pathname)) {
    return false;
  }
  return isWorkspaceRoute(pathname);
}

export function postLoginDestination(
  redirect: string | undefined,
  sessionWorkspaceId: string,
  defaultChannelId: string,
): string {
  if (redirect && isSafePostLoginRedirect(redirect)) {
    const redirectWorkspaceId = parseWorkspaceIdFromPath(redirect);
    if (!redirectWorkspaceId || redirectWorkspaceId !== sessionWorkspaceId) {
      return workspaceChannelPath(sessionWorkspaceId, defaultChannelId);
    }
    return redirect;
  }
  return workspaceChannelPath(sessionWorkspaceId, defaultChannelId);
}

export const P0_ROUTE_CONTRACT = [
  P0_ROUTES.login,
  P0_ROUTES.onboarding,
  P0_ROUTES.workspaceFeed,
  P0_ROUTES.workspaceChannel,
  P0_ROUTES.workspaceTasks,
  P0_ROUTES.workspaceTaskDetail,
  P0_ROUTES.workspaceCoworkers,
  P0_ROUTES.workspaceCoworkerDetail,
  P0_ROUTES.workspaceSkills,
  P0_ROUTES.workspaceSkillDetail,
  P0_ROUTES.workspaceConnections,
] as const;
