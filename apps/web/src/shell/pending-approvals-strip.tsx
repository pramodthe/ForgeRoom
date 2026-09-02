import { useQuery, useQueryClient } from "@tanstack/react-query";
import { listChannelPendingApprovals } from "../api/channel-resources-api";
import { isFixtureMode } from "../api/mode";
import { TrustedApprovalCard } from "./trusted-approval-card";

export function PendingApprovalsStrip(props: { channelId: string; archived: boolean }) {
  const queryClient = useQueryClient();
  const pendingQuery = useQuery({
    queryKey: ["channel-pending-approvals", props.channelId],
    queryFn: () => listChannelPendingApprovals(props.channelId),
    enabled: !props.archived && !isFixtureMode,
    refetchInterval: props.archived || isFixtureMode ? false : 10_000,
  });

  const proposalIds = pendingQuery.data?.proposal_ids ?? [];
  if (proposalIds.length === 0) {
    return null;
  }

  return (
    <section
      className="trusted-hitl-strip border-b border-amber-200 bg-amber-50/80 px-4 py-3"
      aria-label="Pending approvals"
    >
      <div className="mx-auto max-w-3xl space-y-3">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-amber-800">
          Trusted approvals required
        </div>
        {proposalIds.map((proposalId) => (
          <TrustedApprovalCard
            key={proposalId}
            proposalId={proposalId}
            onDecided={() => {
              void queryClient.invalidateQueries({
                queryKey: ["channel-pending-approvals", props.channelId],
              });
            }}
          />
        ))}
      </div>
    </section>
  );
}
