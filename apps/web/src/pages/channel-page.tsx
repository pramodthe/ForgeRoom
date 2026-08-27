import { useParams } from "@tanstack/react-router";
import { ChannelWorkroom } from "../shell/channel-workroom";
import { WorkspaceDefaultChannelRedirect } from "../shell/authenticated-channel-redirect";

export function ChannelPage() {
  const { workspaceId, channelId } = useParams({ from: "/w/$workspaceId/channels/$channelId" });
  return <ChannelWorkroom workspaceId={workspaceId} channelId={channelId} />;
}

export function ChannelsIndexRedirect() {
  const { workspaceId } = useParams({ from: "/w/$workspaceId/channels" });
  return <WorkspaceDefaultChannelRedirect workspaceId={workspaceId} />;
}
