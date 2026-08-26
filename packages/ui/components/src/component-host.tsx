import { Component, type ErrorInfo, type ReactNode } from "react";

type ComponentHostBoundaryProps = {
  slotKind: "agui-activity" | "controlled-component";
  slotId: string;
  children: ReactNode;
  fallback?: ReactNode;
};

type ComponentHostBoundaryState = {
  error: Error | null;
};

export class ComponentHostBoundary extends Component<
  ComponentHostBoundaryProps,
  ComponentHostBoundaryState
> {
  state: ComponentHostBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ComponentHostBoundaryState {
    return { error };
  }

  componentDidUpdate(prevProps: ComponentHostBoundaryProps): void {
    if (prevProps.slotId !== this.props.slotId && this.state.error) {
      this.setState({ error: null });
    }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(
      `component host failure [${this.props.slotKind}:${this.props.slotId}]`,
      error,
      info,
    );
  }

  render(): ReactNode {
    if (this.state.error) {
      return (
        this.props.fallback ?? (
          <div
            className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800"
            role="alert"
          >
            <p className="font-medium">Renderer unavailable</p>
            <p className="mt-1 text-red-700">
              {this.props.slotKind} slot {this.props.slotId} failed. The transcript remains intact.
            </p>
          </div>
        )
      );
    }
    return this.props.children;
  }
}

type SlotProps = {
  slotId: string;
  children?: ReactNode;
  placeholder?: ReactNode;
};

export function AgUiActivitySlot({ slotId, children, placeholder }: SlotProps) {
  return (
    <ComponentHostBoundary key={slotId} slotKind="agui-activity" slotId={slotId}>
      {children ?? placeholder ?? (
        <div
          className="rounded border border-dashed border-zinc-300 bg-zinc-50 p-4 text-sm text-zinc-600"
          data-slot="agui-activity"
          data-slot-id={slotId}
        >
          AG-UI activity slot reserved for timeline replay.
        </div>
      )}
    </ComponentHostBoundary>
  );
}

export function ControlledComponentSlot({ slotId, children, placeholder }: SlotProps) {
  return (
    <ComponentHostBoundary key={slotId} slotKind="controlled-component" slotId={slotId}>
      {children ?? placeholder ?? (
        <div
          className="rounded border border-dashed border-zinc-300 bg-zinc-50 p-4 text-sm text-zinc-600"
          data-slot="controlled-component"
          data-slot-id={slotId}
        >
          Controlled component slot reserved for registered React renderers.
        </div>
      )}
    </ComponentHostBoundary>
  );
}
