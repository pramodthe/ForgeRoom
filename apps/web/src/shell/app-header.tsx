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
  { label: "Channels", glyph: "#", segment: "channels" },
  { label: "Tasks", glyph: "✓", segment: "tasks" },
  { label: "Coworkers", glyph: "◎", segment: "coworkers" },
  { label: "Skills", glyph: "✦", segment: "skills" },
  { label: "Connections", glyph: "↗", segment: "connections" },
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
    <header className="z-40 flex h-16 shrink-0 items-center border-b border-[#303030] bg-[#171717] px-3 lg:h-full lg:w-[72px] lg:flex-col lg:border-r lg:border-b-0 lg:px-0 lg:py-3">
      <div className="flex min-w-0 flex-1 items-center gap-3 lg:w-full lg:flex-col">
        <Link
          to={workspaceChannelsPath(workspaceId)}
          className="group flex shrink-0 items-center gap-2.5 lg:flex-col"
          aria-label="ForgeRoom home"
        >
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-500 text-sm font-black text-white shadow-[0_8px_24px_rgba(139,92,246,0.28)]">
            FR
          </span>
          <span className="text-sm font-semibold tracking-tight text-zinc-100 lg:sr-only">
            ForgeRoom
          </span>
        </Link>
        <nav
          aria-label="Primary"
          className="flex min-w-0 items-center gap-1 overflow-x-auto lg:mt-3 lg:w-full lg:flex-col lg:overflow-visible"
        >
          {NAV_ITEMS.map((item) => {
            const href = navHref(workspaceId, item.segment);
            const active = pathname.includes(`/${item.segment}`);
            return (
              <Link
                key={item.segment}
                to={href}
                title={item.label}
                className={`group relative flex h-10 min-w-10 items-center justify-center rounded-xl text-sm transition-colors lg:h-11 lg:w-11 ${
                  active
                    ? "bg-[#343434] font-semibold text-white shadow-sm ring-1 ring-white/10"
                    : "text-zinc-500 hover:bg-[#292929] hover:text-zinc-100"
                }`}
              >
                <span aria-hidden="true" className="text-base leading-none">
                  {item.glyph}
                </span>
                <span className="sr-only">{item.label}</span>
                {active ? (
                  <span
                    aria-hidden="true"
                    className="absolute -bottom-px h-0.5 w-4 rounded-full bg-violet-400 lg:-left-[15px] lg:bottom-auto lg:h-5 lg:w-0.5"
                  />
                ) : null}
              </Link>
            );
          })}
        </nav>
      </div>
      <div className="ml-auto flex items-center gap-2 lg:ml-0 lg:flex-col-reverse">
        <span
          className="grid h-8 w-8 place-items-center rounded-full bg-emerald-400 text-xs font-bold text-emerald-950 ring-2 ring-[#171717]"
          title={session.user.display_name}
        >
          {session.user.display_name.slice(0, 1).toUpperCase()}
        </span>
        <HostButton
          className="grid h-8 w-8 place-items-center rounded-lg text-sm text-zinc-500 hover:bg-[#292929] hover:text-zinc-100"
          aria-label="Log out"
          title="Log out"
          onClick={() => void onLogout()}
        >
          <span aria-hidden="true">⇥</span>
        </HostButton>
      </div>
    </header>
  );
}
