import { useQuery } from "@tanstack/react-query";
import { LoadingState, RouteErrorState } from "@forgeroom/ui-components";
import { getChannel, listChannels, listConnections } from "../api/workspace-api";
import { ChannelListPane } from "./channel-list-pane";
import { ChannelTimelinePane } from "./channel-timeline-pane";
import { WorkPanelPane } from "./work-panel-pane";
import { ChannelWorkroomUiProvider } from "./channel-workroom-ui-context";
import { TrustedHitlHostProvider } from "./trusted-hitl-host-context";

type ChannelWorkroomProps = {
  workspaceId: string;
  channelId: string;
};

export function ChannelWorkroom({ workspaceId, channelId }: ChannelWorkroomProps) {
  const channelsQuery = useQuery({
    queryKey: ["channels", workspaceId],
    queryFn: () => listChannels(workspaceId),
  });
  const channelQuery = useQuery({
    queryKey: ["channel", workspaceId, channelId],
    queryFn: () => getChannel(workspaceId, channelId),
  });
  const connectionsQuery = useQuery({
    queryKey: ["connections", workspaceId],
    queryFn: () => listConnections(workspaceId),
  });

  if (channelsQuery.isLoading || channelQuery.isLoading || connectionsQuery.isLoading) {
    return <LoadingState title="Loading channel workroom…" />;
  }

  // Connections may be unavailable without Composio credentials; channel chrome still loads.
  if (channelsQuery.error || channelQuery.error) {
    return (
      <RouteErrorState
        title="Unable to load channel"
        description="The channel workroom could not be loaded."
      />
    );
  }

  const channel = channelQuery.data;
  if (!channel) {
    return (
      <RouteErrorState
        title="Channel not found"
        description="This channel is not available in the demo workspace."
      />
    );
  }

  const connections = connectionsQuery.error ? [] : (connectionsQuery.data ?? []);

  return (
    <ChannelWorkroomUiProvider key={channelId}>
      <TrustedHitlHostProvider>
        <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-[#1b1b1b] lg:flex-row">
          <ChannelListPane
            workspaceId={workspaceId}
            channels={channelsQuery.data ?? []}
            selectedChannelId={channelId}
            connections={connections}
          />
          <div className="flex min-w-0 flex-1 justify-center bg-[#1d1d1d]">
            <div className="flex h-full w-full min-w-0 flex-col">
              <ChannelTimelinePane
                channel={channel}
                workspaceId={workspaceId}
                connections={connections}
              />
            </div>
          </div>
          <WorkPanelPane workspaceId={workspaceId} channelId={channel.id} channel={channel} />
        </div>
      </TrustedHitlHostProvider>
    </ChannelWorkroomUiProvider>
  );
}
