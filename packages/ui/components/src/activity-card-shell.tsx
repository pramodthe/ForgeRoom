import type { ReactNode } from "react";

export type ActivityCardTone = "neutral" | "info" | "success" | "warning" | "danger" | "violet";

const TONE_STYLES: Record<
  ActivityCardTone,
  { border: string; bg: string; badge: string; eyebrow: string }
> = {
  neutral: {
    border: "border-zinc-200",
    bg: "bg-white",
    badge: "bg-zinc-100 text-zinc-700",
    eyebrow: "text-zinc-500",
  },
  info: {
    border: "border-sky-200",
    bg: "bg-sky-50/40",
    badge: "bg-sky-100 text-sky-800",
    eyebrow: "text-sky-700",
  },
  success: {
    border: "border-emerald-200",
    bg: "bg-emerald-50/40",
    badge: "bg-emerald-100 text-emerald-800",
    eyebrow: "text-emerald-700",
  },
  warning: {
    border: "border-amber-200",
    bg: "bg-amber-50/50",
    badge: "bg-amber-100 text-amber-900",
    eyebrow: "text-amber-800",
  },
  danger: {
    border: "border-red-200",
    bg: "bg-red-50/50",
    badge: "bg-red-100 text-red-800",
    eyebrow: "text-red-700",
  },
  violet: {
    border: "border-violet-200",
    bg: "bg-violet-50/40",
    badge: "bg-violet-100 text-violet-900",
    eyebrow: "text-violet-700",
  },
};

export type ActivityCardShellProps = {
  icon: ReactNode;
  eyebrow: string;
  title: string;
  detail?: string;
  status?: string;
  tone?: ActivityCardTone;
  ownerLabel?: string;
  footer?: ReactNode;
  inert?: boolean;
};

export function ActivityCardShell(props: ActivityCardShellProps) {
  const tone = props.tone ?? "neutral";
  const styles = TONE_STYLES[tone];
  return (
    <article
      className={`min-h-[4.5rem] rounded-2xl border px-4 py-3 shadow-sm ${styles.border} ${styles.bg} ${props.inert ? "opacity-80" : ""}`}
      data-activity-card
      data-activity-tone={tone}
      aria-label={props.title}
    >
      <div className="flex items-start gap-3">
        <div
          className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-white text-sm shadow-sm ring-1 ring-zinc-200"
          aria-hidden="true"
        >
          {props.icon}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`text-[10px] font-semibold uppercase tracking-wide ${styles.eyebrow}`}>
              {props.eyebrow}
            </span>
            {props.status ? (
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${styles.badge}`}>
                {props.status}
              </span>
            ) : null}
            {props.ownerLabel ? (
              <span className="text-[10px] text-zinc-400">{props.ownerLabel}</span>
            ) : null}
          </div>
          <h3 className="mt-1 text-sm font-semibold text-zinc-900">{props.title}</h3>
          {props.detail ? (
            <p className="mt-1 text-xs leading-5 text-zinc-600">{props.detail}</p>
          ) : null}
          {props.footer ? <div className="mt-2">{props.footer}</div> : null}
        </div>
      </div>
    </article>
  );
}
