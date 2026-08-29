import type { ReactNode } from "react";

type ShellStateProps = {
  title: string;
  description?: string;
  action?: ReactNode;
};

export function LoadingState({ title, description }: ShellStateProps) {
  return (
    <section
      className="flex flex-1 items-center justify-center p-8"
      aria-busy="true"
      aria-live="polite"
    >
      <div className="max-w-md text-center">
        <p className="text-sm font-medium text-zinc-900">{title}</p>
        {description ? <p className="mt-2 text-sm text-zinc-600">{description}</p> : null}
      </div>
    </section>
  );
}

export function ForbiddenState({ title, description, action }: ShellStateProps) {
  return (
    <section
      className="flex flex-1 items-center justify-center p-8"
      role="alert"
      aria-live="assertive"
    >
      <div className="max-w-md text-center">
        <p className="text-sm font-medium text-zinc-900">{title}</p>
        {description ? <p className="mt-2 text-sm text-zinc-600">{description}</p> : null}
        {action ? <div className="mt-4">{action}</div> : null}
      </div>
    </section>
  );
}

export function RouteErrorState({ title, description, action }: ShellStateProps) {
  return (
    <section
      className="flex flex-1 items-center justify-center p-8"
      role="alert"
      aria-live="assertive"
    >
      <div className="max-w-md text-center">
        <p className="text-sm font-medium text-red-900">{title}</p>
        {description ? <p className="mt-2 text-sm text-red-700">{description}</p> : null}
        {action ? <div className="mt-4">{action}</div> : null}
      </div>
    </section>
  );
}

export function EmptyState({ title, description, action }: ShellStateProps) {
  return (
    <section className="flex flex-1 items-center justify-center p-8" aria-live="polite">
      <div className="max-w-md text-center">
        <p className="text-sm font-medium text-zinc-900">{title}</p>
        {description ? <p className="mt-2 text-sm text-zinc-600">{description}</p> : null}
        {action ? <div className="mt-4">{action}</div> : null}
      </div>
    </section>
  );
}
