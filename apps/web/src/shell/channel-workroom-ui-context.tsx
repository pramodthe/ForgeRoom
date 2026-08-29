import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import type { TimelineRun } from "../ag-ui/channel-timeline-reducer";

type ChannelWorkroomUiContextValue = {
  runs: Record<string, TimelineRun>;
  setRuns: (runs: Record<string, TimelineRun>) => void;
  selectedRunId: string | null;
  openRunDrawer: (runId: string) => void;
  closeRunDrawer: () => void;
};

const ChannelWorkroomUiContext = createContext<ChannelWorkroomUiContextValue | null>(null);

export function ChannelWorkroomUiProvider({ children }: { children: ReactNode }) {
  const [runs, setRunsState] = useState<Record<string, TimelineRun>>({});
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const setRuns = useCallback((next: Record<string, TimelineRun>) => {
    setRunsState(next);
  }, []);
  const openRunDrawer = useCallback((runId: string) => setSelectedRunId(runId), []);
  const closeRunDrawer = useCallback(() => setSelectedRunId(null), []);
  const value = useMemo(
    () => ({
      runs,
      setRuns,
      selectedRunId,
      openRunDrawer,
      closeRunDrawer,
    }),
    [runs, setRuns, selectedRunId, openRunDrawer, closeRunDrawer],
  );
  return (
    <ChannelWorkroomUiContext.Provider value={value}>{children}</ChannelWorkroomUiContext.Provider>
  );
}

export function useChannelWorkroomUi(): ChannelWorkroomUiContextValue {
  const value = useContext(ChannelWorkroomUiContext);
  if (!value) {
    throw new Error("useChannelWorkroomUi must be used within ChannelWorkroomUiProvider");
  }
  return value;
}
