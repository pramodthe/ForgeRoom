/** Deterministic theme tokens for P0 controlled renderers. */
export const CONTROLLED_SURFACE_CLASS =
  "overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm";

export const CONTROLLED_HEADER_CLASS = "border-b border-zinc-100 px-4 py-3";

export const CONTROLLED_FOOTER_CLASS =
  "flex items-center justify-between bg-zinc-50 px-4 py-2 text-[11px] text-zinc-500";

export const CONTROLLED_CHART_COLORS = [
  "bg-violet-500",
  "bg-sky-500",
  "bg-emerald-500",
  "bg-amber-500",
  "bg-rose-500",
  "bg-indigo-500",
  "bg-teal-500",
  "bg-orange-500",
] as const;

export const CONTROLLED_MUTED_TEXT = "text-xs text-zinc-500";

export const CONTROLLED_LABEL_CLASS =
  "text-[11px] font-semibold uppercase tracking-wide text-zinc-500";
