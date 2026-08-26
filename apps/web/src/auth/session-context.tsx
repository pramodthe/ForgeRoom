import type { SessionResponse } from "@forgeroom/contracts";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useEffect, useMemo, type ReactNode } from "react";
import { fetchSession, logout as logoutRequest } from "../auth-api";
import { isSessionExpired, liveSession } from "./session";

type SessionContextValue = {
  session: SessionResponse | null;
  isLoading: boolean;
  error: Error | null;
  refreshSession: () => Promise<void>;
  clearSession: () => Promise<void>;
  logout: () => Promise<void>;
};

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const sessionQuery = useQuery({
    queryKey: ["session"],
    queryFn: fetchSession,
    retry: false,
  });

  const clearSession = useCallback(async () => {
    await queryClient.setQueryData(["session"], null);
    await queryClient.invalidateQueries({ queryKey: ["session"] });
  }, [queryClient]);

  const refreshSession = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ["session"] });
  }, [queryClient]);

  const logout = useCallback(async () => {
    const session = liveSession(sessionQuery.data);
    try {
      if (session) {
        await logoutRequest(session.csrf_token);
      }
    } catch {
      // Expired or revoked sessions may reject logout; still clear local state.
    } finally {
      await clearSession();
    }
  }, [clearSession, sessionQuery.data]);

  useEffect(() => {
    const session = sessionQuery.data;
    if (!session) {
      return;
    }
    if (isSessionExpired(session)) {
      void clearSession();
      return;
    }
    const delay = Math.max(0, Date.parse(session.expires_at) - Date.now());
    const timer = window.setTimeout(() => {
      void clearSession();
    }, delay);
    return () => window.clearTimeout(timer);
  }, [clearSession, sessionQuery.data]);

  const session = liveSession(sessionQuery.data);

  const value = useMemo<SessionContextValue>(
    () => ({
      session,
      isLoading: sessionQuery.isLoading,
      error: sessionQuery.error instanceof Error ? sessionQuery.error : null,
      refreshSession,
      clearSession,
      logout,
    }),
    [clearSession, logout, refreshSession, session, sessionQuery.error, sessionQuery.isLoading],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const context = useContext(SessionContext);
  if (!context) {
    throw new Error("useSession must be used within SessionProvider");
  }
  return context;
}
