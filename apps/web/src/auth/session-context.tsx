import type { SessionResponse } from "@forgeroom/contracts";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useEffect, useMemo, type ReactNode } from "react";
import { fetchSession, logout as logoutRequest } from "../auth-api";
import { isSessionExpired } from "./session";

type SessionContextValue = {
  session: SessionResponse | null;
  isLoading: boolean;
  error: Error | null;
  refreshSession: () => Promise<void>;
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

  const refreshSession = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ["session"] });
  }, [queryClient]);

  const logout = useCallback(async () => {
    const session = sessionQuery.data;
    if (session) {
      await logoutRequest(session.csrf_token);
    }
    await queryClient.setQueryData(["session"], null);
    await queryClient.invalidateQueries({ queryKey: ["session"] });
  }, [queryClient, sessionQuery.data]);

  useEffect(() => {
    const session = sessionQuery.data;
    if (!session || isSessionExpired(session)) {
      return;
    }
    const expiresAt = new Date(session.expires_at).getTime();
    const delay = Math.max(0, expiresAt - Date.now());
    const timer = window.setTimeout(() => {
      void logout();
    }, delay);
    return () => window.clearTimeout(timer);
  }, [logout, sessionQuery.data]);

  const value = useMemo<SessionContextValue>(() => {
    const rawSession = sessionQuery.data ?? null;
    const session = rawSession && !isSessionExpired(rawSession, new Date()) ? rawSession : null;
    return {
      session,
      isLoading: sessionQuery.isLoading,
      error: sessionQuery.error instanceof Error ? sessionQuery.error : null,
      refreshSession,
      logout,
    };
  }, [logout, refreshSession, sessionQuery.data, sessionQuery.error, sessionQuery.isLoading]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const context = useContext(SessionContext);
  if (!context) {
    throw new Error("useSession must be used within SessionProvider");
  }
  return context;
}
