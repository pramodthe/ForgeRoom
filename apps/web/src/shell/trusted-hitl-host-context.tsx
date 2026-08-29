import { createContext, useCallback, useContext, useMemo, type ReactNode } from "react";
import { focusTrustedHitlCard, type TrustedHitlOpenRequest } from "./trusted-hitl-host";

type TrustedHitlHostContextValue = {
  openExistingCard: (request: TrustedHitlOpenRequest) => boolean;
};

const TrustedHitlHostContext = createContext<TrustedHitlHostContextValue | null>(null);

export function TrustedHitlHostProvider({ children }: { children: ReactNode }) {
  const openExistingCard = useCallback((request: TrustedHitlOpenRequest) => {
    return focusTrustedHitlCard(request);
  }, []);
  const value = useMemo(() => ({ openExistingCard }), [openExistingCard]);
  return (
    <TrustedHitlHostContext.Provider value={value}>{children}</TrustedHitlHostContext.Provider>
  );
}

export function useTrustedHitlHost(): TrustedHitlHostContextValue {
  const value = useContext(TrustedHitlHostContext);
  if (!value) {
    throw new Error("useTrustedHitlHost must be used within TrustedHitlHostProvider");
  }
  return value;
}
