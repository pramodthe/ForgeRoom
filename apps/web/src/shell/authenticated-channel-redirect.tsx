import { useQuery } from "@tanstack/react-query";
import { Navigate } from "@tanstack/react-router";
import { LoadingState, RouteErrorState } from "@forgeroom/ui-components";
import { resolveDefaultChannelId } from "../api/workspace-api";
import { isFixtureMode } from "../api/mode";
import { isFixtureOnboardingComplete } from "../onboarding/fixture-onboarding";
import {
  onboardingPath,
  postLoginDestination,
  workspaceChannelPath,
  workspaceFeedPath,
} from "../routes/paths";

type AuthenticatedChannelRedirectProps = {
  workspaceId: string;
  redirect?: string;
};

function ChannelRedirectState({
  workspaceId,
  redirect,
  loadingTitle,
  defaultToFeed = false,
}: {
  workspaceId: string;
  redirect?: string;
  loadingTitle: string;
  defaultToFeed?: boolean;
}) {
  const channelQuery = useQuery({
    queryKey: ["default-channel", workspaceId],
    queryFn: () => resolveDefaultChannelId(workspaceId),
    retry: false,
  });

  if (isFixtureMode && !isFixtureOnboardingComplete(workspaceId)) {
    return <Navigate to={onboardingPath()} replace />;
  }

  if (channelQuery.isLoading) {
    return <LoadingState title={loadingTitle} />;
  }

  if (channelQuery.error) {
    return (
      <RouteErrorState
        title="Unable to load channels"
        description={
          channelQuery.error instanceof Error
            ? channelQuery.error.message
            : "The workspace channel list could not be loaded."
        }
      />
    );
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

  return (
    <Navigate
      to={
        redirect !== undefined
          ? postLoginDestination(redirect, workspaceId, channelId)
          : defaultToFeed
            ? workspaceFeedPath(workspaceId)
            : workspaceChannelPath(workspaceId, channelId)
      }
      replace
    />
  );
}

export function AuthenticatedChannelRedirect({
  workspaceId,
  redirect,
}: AuthenticatedChannelRedirectProps) {
  return (
    <ChannelRedirectState
      workspaceId={workspaceId}
      redirect={redirect}
      loadingTitle="Loading workspace…"
      defaultToFeed
    />
  );
}

export function WorkspaceDefaultChannelRedirect({ workspaceId }: { workspaceId: string }) {
  return <ChannelRedirectState workspaceId={workspaceId} loadingTitle="Loading channels…" />;
}
