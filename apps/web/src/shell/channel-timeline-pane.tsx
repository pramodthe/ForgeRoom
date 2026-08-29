import { useCallback, useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LoadingState, RouteErrorState } from "@forgeroom/ui-components";
import type { Channel } from "@forgeroom/contracts";
import type { ConnectionFixture } from "../api/mock-fixtures";
import { ApiError } from "../api/http-client";
import {
  addChannelCoworker,
  listChannelMessages,
  listChannelRoster,
  listCoworkers,
  removeChannelCoworker,
} from "../api/workspace-api";
import { runExistingChannelMessage } from "../ag-ui/run-existing-channel-message";
import { useChannelTimeline } from "../ag-ui/use-channel-timeline";
import { useSession } from "../auth/session-context";
import { ChannelComposer } from "./channel-composer";
import { ChannelHeader } from "./channel-header";
import { ChannelTimeline } from "./channel-timeline";
import { useChannelWorkroomUi } from "./channel-workroom-ui-context";

type ChannelTimelinePaneProps = {
  workspaceId: string;
  channel: Channel;
  connections: ConnectionFixture[];
};

const EMPTY_TIMELINE_MESSAGES: [] = [];

export function ChannelTimelinePane({
  workspaceId,
  channel,
  connections,
}: ChannelTimelinePaneProps) {
  const { session } = useSession();
  const queryClient = useQueryClient();
  const archived = channel.status === "archived";
  const [launchError, setLaunchError] = useState<string | null>(null);

  const rosterQuery = useQuery({
    queryKey: ["channel-roster", channel.id],
    queryFn: () => listChannelRoster(workspaceId, channel.id),
    refetchInterval: archived ? false : 15_000,
  });

  const coworkersQuery = useQuery({
    queryKey: ["coworkers", workspaceId],
    queryFn: () => listCoworkers(workspaceId),
  });

  const messagesQuery = useQuery({
    queryKey: ["channel-messages", channel.id],
    queryFn: () => listChannelMessages(channel.id),
  });

  const refreshMessages = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["channel-messages", channel.id] });
  }, [channel.id, queryClient]);

  const timeline = useChannelTimeline({
    channelId: channel.id,
    initialMessages: messagesQuery.data?.messages ?? EMPTY_TIMELINE_MESSAGES,
    onMessageCreated: refreshMessages,
  });
  const workroomUi = useChannelWorkroomUi();
  useEffect(() => {
    workroomUi.setRuns(timeline.runs);
  }, [timeline.runs, workroomUi.setRuns]);

  const membershipMutation = useMutation({
    mutationFn: async (input: { action: "add" | "remove"; coworkerId: string }) => {
      if (!session) {
        throw new Error("Session required.");
      }
      if (archived) {
        throw new Error("Membership changes are disabled while this channel is archived.");
      }
      if (input.action === "add") {
        await addChannelCoworker({
          channelId: channel.id,
          coworkerId: input.coworkerId,
          csrfToken: session.csrf_token,
        });
        return;
      }
      await removeChannelCoworker({
        channelId: channel.id,
        coworkerId: input.coworkerId,
        csrfToken: session.csrf_token,
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["channel-roster", channel.id] });
    },
  });

  const membershipError =
    membershipMutation.error instanceof ApiError
      ? membershipMutation.error.message
      : membershipMutation.error instanceof Error
        ? membershipMutation.error.message
        : null;

  if (rosterQuery.isLoading || coworkersQuery.isLoading || messagesQuery.isLoading) {
    return <LoadingState title="Loading channel…" />;
  }

  if (rosterQuery.error || coworkersQuery.error || messagesQuery.error || !rosterQuery.data) {
    return (
      <RouteErrorState
        title="Unable to load channel roster"
        description="The channel roster could not be loaded from the workspace API."
      />
    );
  }

  return (
    <section className="flex h-full min-w-0 flex-1 flex-col bg-white" key={channel.id}>
      <ChannelHeader
        workspaceId={workspaceId}
        channelName={channel.name}
        missionBrief={channel.mission_brief}
        roster={rosterQuery.data}
        connections={connections}
        workspaceCoworkers={coworkersQuery.data ?? []}
        membershipBusy={membershipMutation.isPending}
        archived={archived}
        membershipError={membershipError}
        onAddCoworker={(coworkerId) => membershipMutation.mutate({ action: "add", coworkerId })}
        onRemoveCoworker={(coworkerId) =>
          membershipMutation.mutate({ action: "remove", coworkerId })
        }
      />
      <ChannelTimeline
        workspaceId={workspaceId}
        channelId={channel.id}
        items={timeline.items}
        runs={timeline.runs}
        activityState={timeline.activityState}
        roster={rosterQuery.data.coworkers}
        connection={timeline.connection}
        archived={archived}
        currentHumanId={session?.user.id ?? null}
        currentHumanName={session?.user.display_name ?? "Workspace owner"}
        onOpenRun={workroomUi.openRunDrawer}
      />
      {launchError ? (
        <div
          className="border-t border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800"
          role="alert"
        >
          {launchError}
        </div>
      ) : null}
      {session ? (
        <ChannelComposer
          channelId={channel.id}
          roster={rosterQuery.data.coworkers}
          csrfToken={session.csrf_token}
          disabled={archived || membershipMutation.isPending}
          onSent={(posted, body) => {
            setLaunchError(null);
            timeline.mergeMessages([
              {
                schemaVersion: 1,
                id: posted.message_id,
                channel_id: channel.id,
                channel_sequence: posted.sequence,
                author_type: "human",
                author_id: session.user.id,
                body,
                parent_message_id: null,
                created_at: new Date().toISOString(),
              },
            ]);
            refreshMessages();
            void runExistingChannelMessage({
              channelId: channel.id,
              body,
              csrfToken: session.csrf_token,
              posted,
            }).catch((error: unknown) => {
              setLaunchError(
                error instanceof Error ? error.message : "Unable to start coworker run.",
              );
            });
          }}
        />
      ) : null}
    </section>
  );
}
