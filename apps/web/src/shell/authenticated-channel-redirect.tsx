import { useQuery } from "@tanstack/react-query";
import { Navigate } from "@tanstack/react-router";
import { LoadingState, RouteErrorState } from "@forgeroom/ui-components";
import { resolveDefaultChannelId } from "../api/workspace-api";
import { postLoginDestination, workspaceChannelPath } from "../routes/paths";

type AuthenticatedChannelRedirectProps = {
  workspaceId: string;
  redirect?: string;
};

export function AuthenticatedChannelRedirect({
  workspaceId,
  redirect,
}: AuthenticatedChannelRedirectProps) {
  const channelQuery = useQuery({
    queryKey: ["default-channel", workspaceId],
    queryFn: () => resolveDefaultChannelId(workspaceId),
  });

  if (channelQuery.isLoading) {
    return <LoadingState title="Loading workspace…" />;
  }

  const channelId = channelQuery.data;
  if (!channelId) {
    return (
      <RouteErrorState
        title="No channels yet"
        description="Create a channel in this workspace to open the channel workroom."
      />
    );
  }

  return <Navigate to={postLoginDestination(redirect, workspaceId, channelId)} replace />;
}

export function WorkspaceDefaultChannelRedirect({ workspaceId }: { workspaceId: string }) {
  const channelQuery = useQuery({
    queryKey: ["default-channel", workspaceId],
    queryFn: () => resolveDefaultChannelId(workspaceId),
  });

  if (channelQuery.isLoading) {
    return <LoadingState title="Loading channels…" />;
  }

  const channelId = channelQuery.data;
  if (!channelId) {
    return (
      <RouteErrorState
        title="No channels yet"
        description="Create a channel in this workspace to open the channel workroom."
      />
    );
  }

  return <Navigate to={workspaceChannelPath(workspaceId, channelId)} replace />;
}
