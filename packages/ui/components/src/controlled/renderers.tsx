import { useMemo, useState } from "react";
import {
  CONTROLLED_CHART_COLORS,
  CONTROLLED_FOOTER_CLASS,
  CONTROLLED_HEADER_CLASS,
  CONTROLLED_MUTED_TEXT,
  CONTROLLED_SURFACE_CLASS,
} from "./theme";
import { MAX_CHART_POINTS, MAX_CHART_SERIES, MAX_TABLE_COLUMNS, MAX_TABLE_ROWS } from "./limits";

type ChartProps = {
  title: string;
  description?: string | null;
  chart_type: "bar" | "line";
  x_axis_label: string;
  y_axis_label: string;
  series: Array<{ key: string; label: string }>;
  accessible_table_caption: string;
  points?: Array<Record<string, string | number>>;
};

function clampRows<T>(rows: T[], max: number): T[] {
  return rows.slice(0, max);
}

export function ControlledDataTable(props: {
  caption: string;
  description?: string | null;
  empty_text: string;
  columns: Array<{ key: string; label: string; align?: string }>;
  rows?: Array<Record<string, string | number>>;
}) {
  const columns = clampRows(props.columns, MAX_TABLE_COLUMNS);
  const rows = clampRows(props.rows ?? [], MAX_TABLE_ROWS);
  const [query, setQuery] = useState("");
  const [descending, setDescending] = useState(true);
  const sortKey = columns[0]?.key;
  const filtered = rows.filter((row) =>
    Object.values(row).some((value) => String(value).toLowerCase().includes(query.toLowerCase())),
  );
  const sorted = sortKey
    ? [...filtered].sort((left, right) => {
        const leftValue = Number(left[sortKey]);
        const rightValue = Number(right[sortKey]);
        if (!Number.isNaN(leftValue) && !Number.isNaN(rightValue)) {
          return descending ? rightValue - leftValue : leftValue - rightValue;
        }
        return descending
          ? String(right[sortKey]).localeCompare(String(left[sortKey]))
          : String(left[sortKey]).localeCompare(String(right[sortKey]));
      })
    : filtered;

  return (
    <section className={CONTROLLED_SURFACE_CLASS}>
      <div className={CONTROLLED_HEADER_CLASS}>
        <h3 className="font-semibold text-zinc-950">{props.caption}</h3>
        {props.description ? (
          <p className={`mt-1 ${CONTROLLED_MUTED_TEXT}`}>{props.description}</p>
        ) : null}
        <div className="mt-3 flex gap-2">
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Filter rows"
            className="w-full rounded-lg border border-zinc-200 px-2.5 py-1.5 text-xs"
            aria-label="Filter table rows"
          />
          {sortKey ? (
            <button
              type="button"
              className="rounded-lg border border-zinc-200 px-2.5 py-1.5 text-xs text-zinc-600"
              onClick={() => setDescending((current) => !current)}
            >
              Sort
            </button>
          ) : null}
        </div>
      </div>
      <div className="overflow-x-auto p-4">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">{props.caption}</caption>
          <thead className="text-xs text-zinc-500">
            <tr>
              {columns.map((column) => (
                <th key={column.key} className="pb-2 font-medium" scope="col">
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="py-6 text-center text-xs text-zinc-500">
                  {props.empty_text}
                </td>
              </tr>
            ) : (
              sorted.map((row, index) => (
                <tr key={`row-${index}`}>
                  {columns.map((column) => (
                    <td key={column.key} className="py-2 text-zinc-800">
                      {String(row[column.key] ?? "")}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function ControlledBarOrLineChart(props: ChartProps) {
  const [view, setView] = useState<"chart" | "table">("chart");
  const series = clampRows(props.series, MAX_CHART_SERIES);
  const points = clampRows(props.points ?? [], MAX_CHART_POINTS);
  const maxValue = useMemo(() => {
    let max = 1;
    for (const point of points) {
      for (const entry of series) {
        const value = Number(point[entry.key] ?? 0);
        if (!Number.isNaN(value)) max = Math.max(max, value);
      }
    }
    return max;
  }, [points, series]);

  return (
    <section className={CONTROLLED_SURFACE_CLASS}>
      <div className={`${CONTROLLED_HEADER_CLASS} flex items-start justify-between gap-3`}>
        <div>
          <h3 className="font-semibold text-zinc-950">{props.title}</h3>
          {props.description ? (
            <p className={`mt-1 ${CONTROLLED_MUTED_TEXT}`}>{props.description}</p>
          ) : null}
        </div>
        <div
          className="inline-flex rounded-lg bg-zinc-100 p-0.5"
          role="group"
          aria-label="Chart view"
        >
          {(["chart", "table"] as const).map((option) => (
            <button
              key={option}
              type="button"
              className={`rounded-md px-2.5 py-1 text-xs font-medium capitalize ${
                view === option ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500"
              }`}
              aria-pressed={view === option}
              onClick={() => setView(option)}
            >
              {option}
            </button>
          ))}
        </div>
      </div>
      <div className="p-4">
        {view === "chart" ? (
          <div className="space-y-3" role="img" aria-label={props.accessible_table_caption}>
            {points.map((point, index) => {
              const label = String(point.label ?? point.name ?? `Point ${index + 1}`);
              const value = Number(point[series[0]?.key ?? "value"] ?? 0);
              const width = `${Math.max(4, (value / maxValue) * 100)}%`;
              const color = CONTROLLED_CHART_COLORS[index % CONTROLLED_CHART_COLORS.length];
              return (
                <div key={label} className="grid grid-cols-[88px_1fr_36px] items-center gap-3">
                  <span className="text-xs font-medium text-zinc-700">{label}</span>
                  <div className="h-2.5 overflow-hidden rounded-full bg-zinc-100">
                    <div className={`h-full rounded-full ${color}`} style={{ width }} />
                  </div>
                  <span className="text-right text-xs tabular-nums text-zinc-500">{value}</span>
                </div>
              );
            })}
          </div>
        ) : (
          <table className="w-full text-left text-sm">
            <caption className="sr-only">{props.accessible_table_caption}</caption>
            <thead className="text-xs text-zinc-500">
              <tr>
                <th className="pb-2 font-medium">{props.x_axis_label}</th>
                {series.map((entry) => (
                  <th key={entry.key} className="pb-2 text-right font-medium">
                    {entry.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {points.map((point, index) => (
                <tr key={`point-${index}`}>
                  <td className="py-2 text-zinc-800">
                    {String(point.label ?? point.name ?? index + 1)}
                  </td>
                  {series.map((entry) => (
                    <td key={entry.key} className="py-2 text-right tabular-nums text-zinc-600">
                      {String(point[entry.key] ?? "")}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <div className={CONTROLLED_FOOTER_CLASS}>
        <span>
          {props.y_axis_label} · {props.chart_type} chart
        </span>
      </div>
    </section>
  );
}

export function ControlledTaskCard(props: {
  heading: string;
  show_description: boolean;
  show_assignee: boolean;
  show_due_date: boolean;
  show_history: boolean;
  task?: {
    title?: string;
    description?: string | null;
    status?: string;
    assignee_name?: string | null;
    due_at?: string | null;
    revision?: number;
  };
}) {
  const task = props.task ?? {};
  return (
    <section className={CONTROLLED_SURFACE_CLASS}>
      <div className={CONTROLLED_HEADER_CLASS}>
        <div className="text-[11px] font-semibold uppercase tracking-wide text-sky-700">Task</div>
        <h3 className="mt-1 font-semibold text-zinc-950">{props.heading}</h3>
      </div>
      <div className="space-y-2 p-4 text-sm">
        {task.title ? <p className="font-medium text-zinc-900">{task.title}</p> : null}
        {props.show_description && task.description ? (
          <p className="text-xs leading-5 text-zinc-600">{task.description}</p>
        ) : null}
        <dl className="grid grid-cols-2 gap-2 text-xs text-zinc-600">
          {task.status ? (
            <>
              <dt>Status</dt>
              <dd className="font-medium text-zinc-800">{task.status}</dd>
            </>
          ) : null}
          {props.show_assignee && task.assignee_name ? (
            <>
              <dt>Assignee</dt>
              <dd>{task.assignee_name}</dd>
            </>
          ) : null}
          {props.show_due_date && task.due_at ? (
            <>
              <dt>Due</dt>
              <dd>{task.due_at}</dd>
            </>
          ) : null}
          {props.show_history && task.revision ? (
            <>
              <dt>Revision</dt>
              <dd>{task.revision}</dd>
            </>
          ) : null}
        </dl>
      </div>
    </section>
  );
}

export function ControlledArtifactCard(props: {
  heading: string;
  show_preview: boolean;
  show_source: boolean;
  download_label: string;
  downloadHref?: string;
  artifact?: {
    name?: string;
    mime_type?: string;
    revision?: number;
    preview_label?: string;
    creator_name?: string;
  };
}) {
  const artifact = props.artifact ?? {};
  const label =
    artifact.preview_label ?? artifact.mime_type?.split("/")[1]?.toUpperCase() ?? "FILE";
  return (
    <section className={CONTROLLED_SURFACE_CLASS}>
      <div className={CONTROLLED_HEADER_CLASS}>
        <h3 className="font-semibold text-zinc-950">{props.heading}</h3>
      </div>
      {props.show_preview ? (
        <div className="flex h-28 items-center justify-center bg-violet-50 text-2xl font-semibold text-violet-700">
          {label}
        </div>
      ) : null}
      <div className="p-4">
        <p className="text-sm font-medium text-zinc-900">{artifact.name ?? "Artifact"}</p>
        {props.show_source ? (
          <p className={`mt-1 ${CONTROLLED_MUTED_TEXT}`}>
            {artifact.creator_name
              ? `Created by ${artifact.creator_name}`
              : "Source retained server-side"}
            {artifact.revision ? ` · rev ${artifact.revision}` : ""}
          </p>
        ) : null}
        {props.downloadHref ? (
          <a
            href={props.downloadHref}
            className="mt-3 inline-flex text-xs font-medium text-violet-700 hover:text-violet-900"
          >
            {props.download_label}
          </a>
        ) : (
          <span className={`mt-3 inline-flex ${CONTROLLED_MUTED_TEXT}`}>
            {props.download_label}
          </span>
        )}
      </div>
    </section>
  );
}

type ChoiceField =
  | {
      id: string;
      label: string;
      description?: string | null;
      required?: boolean;
      kind: "single_choice";
      options: Array<{ id: string; label: string; description?: string | null }>;
    }
  | {
      id: string;
      label: string;
      description?: string | null;
      required?: boolean;
      kind: "checkbox";
    };

export function ControlledChoiceForm(props: {
  title: string;
  description?: string | null;
  submit_label: string;
  cancel_label: string;
  fields: ChoiceField[];
  onSubmit?: (values: Record<string, unknown>) => void;
  onCancel?: () => void;
  errors?: Record<string, string>;
  formError?: string | null;
  submitting?: boolean;
}) {
  const [values, setValues] = useState<Record<string, unknown>>({});
  const fields = clampRows(props.fields, 12);

  return (
    <form
      className={CONTROLLED_SURFACE_CLASS}
      onSubmit={(event) => {
        event.preventDefault();
        props.onSubmit?.(values);
      }}
    >
      <div className={CONTROLLED_HEADER_CLASS}>
        <h3 className="font-semibold text-zinc-950">{props.title}</h3>
        {props.description ? (
          <p className={`mt-1 ${CONTROLLED_MUTED_TEXT}`}>{props.description}</p>
        ) : null}
      </div>
      <div className="space-y-4 p-4">
        {fields.map((field) => (
          <fieldset key={field.id} className="space-y-2">
            <legend className="text-sm font-medium text-zinc-900">
              {field.label}
              {field.required ? <span className="text-red-600"> *</span> : null}
            </legend>
            {field.description ? (
              <p className="text-xs text-zinc-500">{field.description}</p>
            ) : null}
            {field.kind === "checkbox" ? (
              <label className="flex items-center gap-2 text-sm text-zinc-700">
                <input
                  type="checkbox"
                  checked={Boolean(values[field.id])}
                  onChange={(event) =>
                    setValues((current) => ({ ...current, [field.id]: event.target.checked }))
                  }
                />
                {field.label}
              </label>
            ) : (
              <div className="space-y-2">
                {field.options.slice(0, 20).map((option) => (
                  <label key={option.id} className="flex items-start gap-2 text-sm text-zinc-700">
                    <input
                      type="radio"
                      name={field.id}
                      checked={values[field.id] === option.id}
                      onChange={() =>
                        setValues((current) => ({ ...current, [field.id]: option.id }))
                      }
                    />
                    <span>
                      <span className="font-medium">{option.label}</span>
                      {option.description ? (
                        <span className="mt-0.5 block text-xs text-zinc-500">
                          {option.description}
                        </span>
                      ) : null}
                    </span>
                  </label>
                ))}
              </div>
            )}
            {props.errors?.[field.id] ? (
              <p className="text-xs text-red-700" role="alert">
                {props.errors[field.id]}
              </p>
            ) : null}
          </fieldset>
        ))}
      </div>
      <div className="border-t border-zinc-100 p-4">
        {props.formError ? (
          <p className="mb-3 text-xs text-red-700" role="alert">
            {props.formError}
          </p>
        ) : null}
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={props.submitting}
            className="rounded-lg bg-zinc-900 px-3 py-2 text-xs font-semibold text-white disabled:opacity-60"
          >
            {props.submit_label}
          </button>
          <button
            type="button"
            className="rounded-lg border border-zinc-200 px-3 py-2 text-xs font-medium text-zinc-700"
            onClick={props.onCancel}
          >
            {props.cancel_label}
          </button>
        </div>
      </div>
    </form>
  );
}
