import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AgUiActivitySlot,
  ControlledComponentSlot,
  LoadingState,
  RouteErrorState,
} from "@forgeroom/ui-components";
import type { Channel } from "@forgeroom/contracts";
import { ApiError } from "../api/http-client";
import {
  addChannelCoworker,
  listChannelRoster,
  listCoworkers,
  removeChannelCoworker,
} from "../api/workspace-api";
import { useSession } from "../auth/session-context";
import { ChannelComposer } from "./channel-composer";
import { ChannelHeader } from "./channel-header";

type ChannelTimelinePaneProps = {
  workspaceId: string;
  channel: Channel;
};

export function ChannelTimelinePane({ workspaceId, channel }: ChannelTimelinePaneProps) {
  const { session } = useSession();
  const queryClient = useQueryClient();

  const rosterQuery = useQuery({
    queryKey: ["channel-roster", channel.id],
    queryFn: () => listChannelRoster(workspaceId, channel.id),
  });

  const coworkersQuery = useQuery({
    queryKey: ["coworkers", workspaceId],
    queryFn: () => listCoworkers(workspaceId),
  });

  const archived = channel.status === "archived";

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

  if (rosterQuery.isLoading || coworkersQuery.isLoading) {
    return <LoadingState title="Loading channel…" />;
  }

  if (rosterQuery.error || coworkersQuery.error || !rosterQuery.data) {
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
        workspaceCoworkers={coworkersQuery.data ?? []}
        membershipBusy={membershipMutation.isPending}
        archived={archived}
        membershipError={membershipError}
        onAddCoworker={(coworkerId) => membershipMutation.mutate({ action: "add", coworkerId })}
        onRemoveCoworker={(coworkerId) =>
          membershipMutation.mutate({ action: "remove", coworkerId })
        }
      />
      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
        <AgUiActivitySlot slotId={`${channel.id}-activity-seed`} />
        <ControlledComponentSlot slotId={`${channel.id}-component-seed`} />
        {archived ? (
          <div className="rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            This channel is archived. New messages and membership changes are blocked.
          </div>
        ) : (
          <div className="rounded border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-600">
            Timeline cards and structured work items will render here in later P0 tasks.
          </div>
        )}
      </div>
      {session ? (
        <ChannelComposer
          channelId={channel.id}
          roster={rosterQuery.data.coworkers}
          csrfToken={session.csrf_token}
          disabled={archived || membershipMutation.isPending}
          onSent={async () => {
            await queryClient.invalidateQueries({ queryKey: ["channel", workspaceId, channel.id] });
          }}
        />
      ) : null}
    </section>
  );
}
