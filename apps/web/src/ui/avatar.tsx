export function Avatar(props: {
  name: string;
  tone?: "violet" | "blue" | "amber" | "zinc";
  size?: "sm" | "md";
}) {
  const initials = props.name
    .split(/\s+/u)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  const tone = {
    violet: "bg-violet-100 text-violet-700 ring-violet-200",
    blue: "bg-sky-100 text-sky-700 ring-sky-200",
    amber: "bg-amber-100 text-amber-700 ring-amber-200",
    zinc: "bg-zinc-100 text-zinc-700 ring-zinc-200",
  }[props.tone ?? "zinc"];
  const size = props.size === "sm" ? "h-7 w-7 text-[10px]" : "h-9 w-9 text-xs";
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-xl font-semibold ring-1 ${tone} ${size}`}
      aria-hidden="true"
    >
      {initials}
    </span>
  );
}
