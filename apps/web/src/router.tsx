import {
  Outlet,
  createRootRoute,
  createRoute,
  createRouter,
  redirect,
} from "@tanstack/react-router";
import { fetchSession } from "./auth-api";
import { defaultChannelId } from "./api/workspace-api";
import { isSessionExpired, sessionWorkspaceMismatch } from "./auth/session";
import { ChannelPage, ChannelsIndexRedirect } from "./pages/channel-page";
import { ConnectionsPage } from "./pages/connections-page";
import { CoworkerDetailPage, CoworkersPage } from "./pages/coworkers-page";
import { LoginPage, RootRedirect } from "./pages/login-page";
import { SkillDetailPage, SkillsPage } from "./pages/skills-page";
import { TaskDetailPage, TasksPage } from "./pages/tasks-page";
import { loginPath, workspaceChannelPath } from "./routes/paths";
import { WorkspaceLayout } from "./shell/workspace-layout";

async function requireAuthenticatedWorkspace(workspaceId: string, pathname: string) {
  const session = await fetchSession();
  if (!session || isSessionExpired(session)) {
    throw redirect({
      to: loginPath(),
      search: { redirect: pathname },
    });
  }
  if (sessionWorkspaceMismatch(session, workspaceId)) {
    throw redirect({
      to: workspaceChannelPath(session.workspace_id, defaultChannelId()),
      replace: true,
    });
  }
  return session;
}

const rootRoute = createRootRoute({
  component: Outlet,
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: RootRedirect,
});

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/login",
  validateSearch: (search: Record<string, unknown>) => ({
    redirect: typeof search.redirect === "string" ? search.redirect : undefined,
  }),
  component: LoginPage,
});

const workspaceRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/w/$workspaceId",
  component: WorkspaceLayout,
  beforeLoad: async ({ params, location }) => {
    await requireAuthenticatedWorkspace(params.workspaceId, location.pathname);
  },
});

const channelsIndexRoute = createRoute({
  getParentRoute: () => workspaceRoute,
  path: "/channels",
  component: ChannelsIndexRedirect,
});

const channelRoute = createRoute({
  getParentRoute: () => workspaceRoute,
  path: "/channels/$channelId",
  component: ChannelPage,
});

const tasksRoute = createRoute({
  getParentRoute: () => workspaceRoute,
  path: "/tasks",
  component: TasksPage,
});

const taskDetailRoute = createRoute({
  getParentRoute: () => workspaceRoute,
  path: "/tasks/$taskId",
  component: TaskDetailPage,
});

const coworkersRoute = createRoute({
  getParentRoute: () => workspaceRoute,
  path: "/coworkers",
  component: CoworkersPage,
});

const coworkerDetailRoute = createRoute({
  getParentRoute: () => workspaceRoute,
  path: "/coworkers/$coworkerId",
  component: CoworkerDetailPage,
});

const skillsRoute = createRoute({
  getParentRoute: () => workspaceRoute,
  path: "/skills",
  component: SkillsPage,
});

const skillDetailRoute = createRoute({
  getParentRoute: () => workspaceRoute,
  path: "/skills/$skillId",
  component: SkillDetailPage,
});

const connectionsRoute = createRoute({
  getParentRoute: () => workspaceRoute,
  path: "/connections",
  component: ConnectionsPage,
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  loginRoute,
  workspaceRoute.addChildren([
    channelsIndexRoute,
    channelRoute,
    tasksRoute,
    taskDetailRoute,
    coworkersRoute,
    coworkerDetailRoute,
    skillsRoute,
    skillDetailRoute,
    connectionsRoute,
  ]),
]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

export const P0_REGISTERED_ROUTES = [
  "/",
  "/login",
  "/w/$workspaceId/channels",
  "/w/$workspaceId/channels/$channelId",
  "/w/$workspaceId/tasks",
  "/w/$workspaceId/tasks/$taskId",
  "/w/$workspaceId/coworkers",
  "/w/$workspaceId/coworkers/$coworkerId",
  "/w/$workspaceId/skills",
  "/w/$workspaceId/skills/$skillId",
  "/w/$workspaceId/connections",
] as const;
