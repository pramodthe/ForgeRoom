import { Link } from "@tanstack/react-router";
import type { ChannelRosterCoworker, ChannelRosterResponse } from "@forgeroom/contracts";
import type { ConnectionFixture } from "../api/mock-fixtures";
import { workspaceCoworkersPath } from "../routes/paths";
import { Avatar } from "../ui/avatar";

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
}: ChannelHeaderProps) {
  const membershipControlsDisabled = membershipBusy || archived;
  const memberIds = new Set(roster.coworkers.map((row) => row.coworker_id));
  const addable = workspaceCoworkers.filter(
    (coworker) => coworker.status === "active" && !memberIds.has(coworker.id),
  );
  const attentionCount = roster.coworkers.filter((row) => row.availability === "needs_you").length;
  const activeConnections = connections.filter(
    (connection) => connection.status === "active",
  ).length;
  const connectionsHealthy = connections.length > 0 && activeConnections === connections.length;

  return (
    <header className="border-b border-zinc-200 bg-white px-5 py-3.5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-semibold tracking-tight text-zinc-950"># {channelName}</h1>
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              Live
            </span>
          </div>
          <p className="mt-1 max-w-xl truncate text-xs text-zinc-500">{missionBrief}</p>
        </div>
        <div className="flex items-center gap-2 text-[11px]">
          {attentionCount > 0 ? (
            <span className="rounded-full bg-amber-50 px-2 py-1 font-medium text-amber-700">
              {attentionCount} needs you
            </span>
          ) : null}
          <span
            className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-zinc-50 px-2 py-1 text-zinc-600"
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
            className="shrink-0 rounded-full border border-zinc-200 bg-white px-2 py-1 text-zinc-500"
            aria-label="Service account badge"
          >
            {roster.service_account_label}
          </span>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2.5">
        {roster.coworkers.length === 0 ? (
          <span className="text-sm text-zinc-500">No coworkers in this channel yet.</span>
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
          <label className="ml-auto inline-flex items-center gap-1 text-sm text-zinc-700">
            <span className="sr-only">Add coworker to channel</span>
            <select
              className="rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-xs shadow-sm disabled:opacity-50"
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
          className="rounded-lg bg-zinc-950 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-zinc-800"
        >
          Manage team
        </Link>
      </div>

      {archived ? (
        <p className="mt-2 text-sm text-amber-800" role="status">
          Membership changes are disabled while this channel is archived.
        </p>
      ) : null}

      {membershipError ? (
        <p className="mt-2 text-sm text-red-700" role="alert">
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
    <div className="group flex items-center gap-2 rounded-xl border border-zinc-200 bg-zinc-50/70 px-2.5 py-2 text-sm">
      <Avatar name={row.name} tone={row.handle === "analyst" ? "violet" : "blue"} size="sm" />
      <div className="min-w-0 max-w-44">
        <div className="flex items-center gap-1.5">
          <span className="font-medium text-zinc-900">{row.name}</span>
          <span
            className={`h-1.5 w-1.5 rounded-full ${row.availability === "needs_you" ? "bg-amber-500" : "bg-emerald-500"}`}
          />
          <span className="text-[10px] text-zinc-500">{AVAILABILITY_LABEL[row.availability]}</span>
        </div>
        <div className="truncate text-[11px] text-zinc-500">
          {row.assignment_summary ?? row.title}
        </div>
      </div>
      <button
        type="button"
        className="ml-1 hidden h-5 w-5 rounded text-xs text-zinc-400 hover:bg-zinc-200 hover:text-zinc-800 disabled:opacity-50 group-hover:block"
        aria-label={`Remove ${row.name} from channel`}
        disabled={disabled}
        onClick={onRemove}
      >
        ×
      </button>
    </div>
  );
}
