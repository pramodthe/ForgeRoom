import { Navigate, useParams } from "@tanstack/react-router";
import { defaultChannelId } from "../api/workspace-api";
import { workspaceChannelPath } from "../routes/paths";
import { ChannelWorkroom } from "../shell/channel-workroom";

export function ChannelPage() {
  const { workspaceId, channelId } = useParams({ from: "/w/$workspaceId/channels/$channelId" });
  return <ChannelWorkroom workspaceId={workspaceId} channelId={channelId} />;
}

export function ChannelsIndexRedirect() {
  const { workspaceId } = useParams({ from: "/w/$workspaceId/channels" });
  return <Navigate to={workspaceChannelPath(workspaceId, defaultChannelId())} replace />;
}
