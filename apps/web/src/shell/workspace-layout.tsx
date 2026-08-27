import { Navigate, Outlet, useParams, useRouterState } from "@tanstack/react-router";
import { useSession } from "../auth/session-context";
import { loginPath } from "../routes/paths";
import { AppHeader } from "./app-header";

export function WorkspaceLayout() {
  const { workspaceId } = useParams({ from: "/w/$workspaceId" });
  const { session, isLoading } = useSession();
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  if (!isLoading && !session) {
    return <Navigate to={loginPath()} search={{ redirect: pathname }} replace />;
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <AppHeader workspaceId={workspaceId} />
      <div className="flex min-h-0 flex-1 flex-col">
        <Outlet />
      </div>
    </div>
  );
}
