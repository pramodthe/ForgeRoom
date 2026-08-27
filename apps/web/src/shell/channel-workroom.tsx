import { useQuery } from "@tanstack/react-query";
import { LoadingState, RouteErrorState } from "@forgeroom/ui-components";
import { getChannel, listChannels } from "../api/workspace-api";
import { ChannelListPane } from "./channel-list-pane";
import { ChannelTimelinePane } from "./channel-timeline-pane";
import { WorkPanelPane } from "./work-panel-pane";

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

  if (channelsQuery.isLoading || channelQuery.isLoading) {
    return <LoadingState title="Loading channel workroom…" />;
  }

  if (channelsQuery.error || channelQuery.error) {
    return (
      <RouteErrorState
        title="Unable to load channel"
        description="The channel workroom could not be loaded from the mock workspace API."
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

  return (
    <div className="flex h-full min-h-0">
      <ChannelListPane
        workspaceId={workspaceId}
        channels={channelsQuery.data ?? []}
        selectedChannelId={channelId}
      />
      <div className="flex min-w-0 flex-1 justify-center">
        <div className="flex h-full w-full max-w-[820px] min-w-0 flex-col border-x border-zinc-200">
          <ChannelTimelinePane channel={channel} workspaceId={workspaceId} />
        </div>
      </div>
      <WorkPanelPane />
    </div>
  );
}
