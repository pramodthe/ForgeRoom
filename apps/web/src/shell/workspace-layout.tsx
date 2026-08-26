import { Outlet, useParams } from "@tanstack/react-router";
import { AppHeader } from "./app-header";

export function WorkspaceLayout() {
  const { workspaceId } = useParams({ from: "/w/$workspaceId" });

  return (
    <div className="flex h-full min-h-0 flex-col">
      <AppHeader workspaceId={workspaceId} />
      <div className="flex min-h-0 flex-1 flex-col">
        <Outlet />
      </div>
    </div>
  );
}
