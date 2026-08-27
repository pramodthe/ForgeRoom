import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { HostButton } from "@forgeroom/ui-components";
import { useSession } from "../auth/session-context";
import {
  loginPath,
  workspaceChannelsPath,
  workspaceConnectionsPath,
  workspaceCoworkersPath,
  workspaceSkillsPath,
  workspaceTasksPath,
} from "../routes/paths";

const NAV_ITEMS = [
  { label: "Channels", segment: "channels" },
  { label: "Tasks", segment: "tasks" },
  { label: "Coworkers", segment: "coworkers" },
  { label: "Skills", segment: "skills" },
  { label: "Connections", segment: "connections" },
] as const;

function navHref(workspaceId: string, segment: (typeof NAV_ITEMS)[number]["segment"]): string {
  switch (segment) {
    case "channels":
      return workspaceChannelsPath(workspaceId);
    case "tasks":
      return workspaceTasksPath(workspaceId);
    case "coworkers":
      return workspaceCoworkersPath(workspaceId);
    case "skills":
      return workspaceSkillsPath(workspaceId);
    case "connections":
      return workspaceConnectionsPath(workspaceId);
  }
}

type AppHeaderProps = {
  workspaceId: string;
};

export function AppHeader({ workspaceId }: AppHeaderProps) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const navigate = useNavigate();
  const { session, logout } = useSession();

  if (!session) {
    return null;
  }

  async function onLogout() {
    try {
      await logout();
      await navigate({ to: loginPath() });
    } catch {
      // Keep the authenticated shell when logout cannot revoke the session.
    }
  }

  return (
    <header className="flex items-center justify-between border-b border-zinc-200 bg-white px-4 py-3">
      <nav aria-label="Primary" className="flex items-center gap-4">
        {NAV_ITEMS.map((item) => {
          const href = navHref(workspaceId, item.segment);
          const active = pathname.includes(`/${item.segment}`);
          return (
            <Link
              key={item.segment}
              to={href}
              className={`text-sm ${active ? "font-semibold text-zinc-900" : "text-zinc-600 hover:text-zinc-900"}`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="flex items-center gap-3 text-sm text-zinc-700">
        <span>{session.user.display_name}</span>
        <HostButton
          className="rounded border border-zinc-300 px-2 py-1 text-xs"
          onClick={() => void onLogout()}
        >
          Log out
        </HostButton>
      </div>
    </header>
  );
}
