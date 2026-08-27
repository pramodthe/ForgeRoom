import { Link } from "@tanstack/react-router";
import type { ChannelRosterCoworker, ChannelRosterResponse } from "@forgeroom/contracts";
import { workspaceCoworkersPath } from "../routes/paths";

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

  return (
    <header className="border-b border-zinc-200 px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-lg font-semibold text-zinc-900">{channelName}</h1>
          <p className="mt-1 text-sm text-zinc-600">{missionBrief}</p>
        </div>
        <span
          className="shrink-0 rounded border border-zinc-200 bg-zinc-50 px-2 py-1 text-xs text-zinc-600"
          aria-label="Service account badge"
        >
          {roster.service_account_label}
        </span>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">Roster</span>
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

        <label className="inline-flex items-center gap-1 text-sm text-zinc-700">
          <span className="sr-only">Add coworker to channel</span>
          <select
            className="rounded border border-zinc-300 bg-white px-2 py-1 text-sm disabled:opacity-50"
            defaultValue=""
            disabled={membershipControlsDisabled || addable.length === 0}
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

        <Link
          to={workspaceCoworkersPath(workspaceId)}
          className="rounded border border-zinc-300 bg-white px-2 py-1 text-sm text-zinc-700 hover:bg-zinc-50"
        >
          New coworker
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
    <div className="flex items-center gap-1 rounded border border-zinc-200 bg-white px-2 py-1 text-sm shadow-sm">
      <div className="min-w-0">
        <div className="font-medium text-zinc-900">{row.name}</div>
        <div className="text-xs text-zinc-500">
          @{row.handle} · {row.title} · {AVAILABILITY_LABEL[row.availability]}
        </div>
        <div className="text-xs text-zinc-600">
          {row.assignment_summary ?? "No active assignment"}
        </div>
      </div>
      <button
        type="button"
        className="ml-1 rounded px-1 text-xs text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800 disabled:opacity-50"
        aria-label={`Remove ${row.name} from channel`}
        disabled={disabled}
        onClick={onRemove}
      >
        Remove
      </button>
    </div>
  );
}
