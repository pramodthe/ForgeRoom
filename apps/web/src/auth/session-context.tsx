import type { SessionResponse } from "@forgeroom/contracts";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useEffect, useMemo, type ReactNode } from "react";
import { setApiUnauthorizedHandler } from "../api/unauthorized";
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
    queryClient.setQueryData(["session"], null);
  }, [queryClient]);

  const refreshSession = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ["session"] });
  }, [queryClient]);

  const logout = useCallback(async () => {
    const cachedSession = sessionQuery.data;
    const session = liveSession(cachedSession);
    const alreadyExpired = Boolean(cachedSession && !session);

    if (!cachedSession) {
      await clearSession();
      return;
    }

    try {
      await logoutRequest((session ?? cachedSession).csrf_token);
      await clearSession();
    } catch {
      if (alreadyExpired) {
        await clearSession();
        return;
      }
      throw new Error("Logout failed. Please try again.");
    }
  }, [clearSession, sessionQuery.data]);

  useEffect(() => {
    setApiUnauthorizedHandler(() => {
      void clearSession();
    });
    return () => setApiUnauthorizedHandler(null);
  }, [clearSession]);

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
