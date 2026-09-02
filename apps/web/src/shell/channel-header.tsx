import { Link } from "@tanstack/react-router";
import type { ChannelRosterCoworker, ChannelRosterResponse } from "@forgeroom/contracts";
import type { ConnectionFixture } from "../api/mock-fixtures";
import { workspaceCoworkersPath } from "../routes/paths";
import { Avatar } from "../ui/avatar";
import type { TimelineRun } from "../ag-ui/channel-timeline-reducer";

const AVAILABILITY_LABEL: Record<ChannelRosterCoworker["availability"], string> = {
  available: "Available",
  queued: "Queued",
  busy: "Busy",
  needs_you: "Needs you",
  cancelling: "Cancelling",
  disabled: "Disabled",
  offline: "Offline",
};

type ChannelHeaderProps = {
  workspaceId: string;
  channelName: string;
  missionBrief: string;
  roster: ChannelRosterResponse;
  connections: ConnectionFixture[];
  workspaceCoworkers: Array<{ id: string; handle: string; name: string; status: string }>;
  onAddCoworker: (coworkerId: string) => void;
  onRemoveCoworker: (coworkerId: string) => void;
  membershipBusy: boolean;
  archived?: boolean;
  membershipError?: string | null;
  runs: Record<string, TimelineRun>;
};

export function ChannelHeader({
  workspaceId,
  channelName,
  missionBrief,
  roster,
  connections,
  workspaceCoworkers,
  onAddCoworker,
  onRemoveCoworker,
  membershipBusy,
  archived = false,
  membershipError = null,
  runs,
}: ChannelHeaderProps) {
  const membershipControlsDisabled = membershipBusy || archived;
  const memberIds = new Set(roster.coworkers.map((row) => row.coworker_id));
  const addable = workspaceCoworkers.filter(
    (coworker) => coworker.status === "active" && !memberIds.has(coworker.id),
  );
  const activeConnections = connections.filter(
    (connection) => connection.status === "active",
  ).length;
  const connectionsHealthy = connections.length > 0 && activeConnections === connections.length;
  const runValues = Object.values(runs);
  const activeRunCount = runValues.filter((run) => run.status === "running").length;
  const blockedRunCount = runValues.filter((run) => run.status === "needs_input").length;

  return (
    <header className="shrink-0 border-b border-[#343434] bg-[#222222]">
      <div className="flex h-14 items-center justify-between gap-4 px-5">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-emerald-400/15 text-xs font-semibold text-emerald-300">
            #
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="truncate text-sm font-semibold tracking-tight text-zinc-100">
                # {channelName}
              </h1>
              <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-400">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                Live
              </span>
            </div>
            <p className="mt-0.5 max-w-xl truncate text-[11px] text-zinc-500">{missionBrief}</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5 text-[10px]">
          <span className="rounded-full border border-[#3c3c3c] bg-[#292929] px-2 py-1 text-zinc-400">
            {activeRunCount} active
          </span>
          <span
            className={`rounded-full px-2 py-1 font-medium ${blockedRunCount > 0 ? "bg-amber-400/10 text-amber-300" : "border border-[#3c3c3c] bg-[#292929] text-zinc-500"}`}
          >
            {blockedRunCount} blocked
          </span>
          <span
            className="hidden items-center gap-1.5 rounded-full border border-[#3c3c3c] bg-[#292929] px-2 py-1 text-zinc-400 min-[1400px]:inline-flex"
            aria-label="Connector health"
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${connectionsHealthy ? "bg-emerald-500" : "bg-amber-500"}`}
            />
            {connections.length === 0
              ? "Connection status unavailable"
              : `${activeConnections} of ${connections.length} connections healthy`}
          </span>
          <span
            className="max-w-32 truncate text-[9px] text-zinc-500"
            aria-label="Service account badge"
          >
            {roster.service_account_label}
          </span>
          <span className="text-zinc-600" aria-hidden="true">
            ···
          </span>
        </div>
      </div>

      <div className="flex min-h-11 flex-wrap items-center gap-2 border-t border-[#2d2d2d] px-5 py-1.5">
        {roster.coworkers.length === 0 ? (
          <span className="text-xs text-zinc-500">No coworkers in this room yet.</span>
        ) : (
          roster.coworkers.map((row) => (
            <RosterChip
              key={row.coworker_id}
              row={row}
              onRemove={() => onRemoveCoworker(row.coworker_id)}
              disabled={membershipControlsDisabled}
            />
          ))
        )}

        {addable.length > 0 ? (
          <label className="ml-auto inline-flex items-center gap-1 text-sm text-zinc-300">
            <span className="sr-only">Add coworker to channel</span>
            <select
              className="rounded-lg border border-[#3c3c3c] bg-[#292929] px-2 py-1.5 text-[11px] text-zinc-300 shadow-sm disabled:opacity-50"
              defaultValue=""
              disabled={membershipControlsDisabled}
              onChange={(event) => {
                const value = event.target.value;
                if (value) {
                  onAddCoworker(value);
                  event.target.value = "";
                }
              }}
            >
              <option value="" disabled>
                Add coworker…
              </option>
              {addable.map((coworker) => (
                <option key={coworker.id} value={coworker.id}>
                  {coworker.name} (@{coworker.handle})
                </option>
              ))}
            </select>
          </label>
        ) : (
          <span className="ml-auto" />
        )}

        <Link
          to={workspaceCoworkersPath(workspaceId)}
          className="rounded-lg border border-[#3c3c3c] bg-[#292929] px-2.5 py-1.5 text-[11px] font-medium text-zinc-300 hover:bg-[#343434] hover:text-white"
        >
          Manage team
        </Link>
        <Link
          to={workspaceCoworkersPath(workspaceId)}
          className="rounded-lg bg-violet-500 px-2.5 py-1.5 text-[11px] font-medium text-white hover:bg-violet-400"
        >
          + New coworker
        </Link>
      </div>

      {archived ? (
        <p className="px-5 pb-2 text-xs text-amber-300" role="status">
          Membership changes are disabled while this channel is archived.
        </p>
      ) : null}

      {membershipError ? (
        <p className="px-5 pb-2 text-xs text-red-300" role="alert">
          {membershipError}
        </p>
      ) : null}
    </header>
  );
}

function RosterChip({
  row,
  onRemove,
  disabled,
}: {
  row: ChannelRosterCoworker;
  onRemove: () => void;
  disabled: boolean;
}) {
  return (
    <div className="group flex items-center gap-2 rounded-lg px-1.5 py-1 text-sm hover:bg-[#2b2b2b]">
      <Avatar name={row.name} tone={row.handle === "analyst" ? "violet" : "blue"} size="sm" />
      <div className="min-w-0 max-w-44">
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] font-medium text-zinc-200">{row.name}</span>
          <span
            className={`h-1.5 w-1.5 rounded-full ${row.availability === "needs_you" ? "bg-amber-500" : "bg-emerald-500"}`}
          />
          <span className="text-[9px] text-zinc-500">{AVAILABILITY_LABEL[row.availability]}</span>
        </div>
        <div className="hidden truncate text-[10px] text-zinc-500 xl:block">
          {row.assignment_summary ?? row.title}
        </div>
      </div>
      <button
        type="button"
        className="ml-1 hidden h-5 w-5 rounded text-xs text-zinc-500 hover:bg-[#3a3a3a] hover:text-zinc-100 disabled:opacity-50 group-hover:block"
        aria-label={`Remove ${row.name} from channel`}
        disabled={disabled}
        onClick={onRemove}
      >
        ×
      </button>
    </div>
  );
}
