export type FixtureOnboardingValues = {
  primaryAgentName: string;
  businessContext: string;
  workspaceName: string;
};

export type FixtureOnboardingState = FixtureOnboardingValues & {
  schemaVersion: 1;
  completedAt: string | null;
};

const FIXTURE_ONBOARDING_STORAGE_PREFIX = "forgeroom:fixture:onboarding:v1:";

export const DEFAULT_FIXTURE_ONBOARDING_VALUES: FixtureOnboardingValues = {
  primaryAgentName: "Operator",
  businessContext: "",
  workspaceName: "My team",
};

function browserStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function fixtureOnboardingStorageKey(workspaceId: string): string {
  return `${FIXTURE_ONBOARDING_STORAGE_PREFIX}${workspaceId}`;
}

function parseFixtureOnboardingState(value: unknown): FixtureOnboardingState | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  if (
    candidate.schemaVersion !== 1 ||
    typeof candidate.primaryAgentName !== "string" ||
    typeof candidate.businessContext !== "string" ||
    typeof candidate.workspaceName !== "string" ||
    (candidate.completedAt !== null && typeof candidate.completedAt !== "string")
  ) {
    return null;
  }
  return {
    schemaVersion: 1,
    primaryAgentName: candidate.primaryAgentName,
    businessContext: candidate.businessContext,
    workspaceName: candidate.workspaceName,
    completedAt: candidate.completedAt,
  };
}

export function readFixtureOnboarding(
  workspaceId: string,
  storage: Storage | null = browserStorage(),
): FixtureOnboardingState | null {
  if (!storage) return null;
  const key = fixtureOnboardingStorageKey(workspaceId);
  try {
    const raw = storage.getItem(key);
    if (!raw) return null;
    const parsed = parseFixtureOnboardingState(JSON.parse(raw));
    if (parsed) return parsed;
    storage.removeItem(key);
  } catch {
    try {
      storage.removeItem(key);
    } catch {
      // Storage can become unavailable between reads. Treat it as an incomplete fixture flow.
    }
  }
  return null;
}

export function saveFixtureOnboardingDraft(
  workspaceId: string,
  values: FixtureOnboardingValues,
  storage: Storage | null = browserStorage(),
): FixtureOnboardingState {
  const state: FixtureOnboardingState = {
    schemaVersion: 1,
    primaryAgentName: values.primaryAgentName.trim(),
    businessContext: values.businessContext.trim(),
    workspaceName: values.workspaceName.trim(),
    completedAt: null,
  };
  storage?.setItem(fixtureOnboardingStorageKey(workspaceId), JSON.stringify(state));
  return state;
}

export function completeFixtureOnboarding(
  workspaceId: string,
  values: FixtureOnboardingValues,
  storage: Storage | null = browserStorage(),
  completedAt = new Date().toISOString(),
): FixtureOnboardingState {
  const primaryAgentName = values.primaryAgentName.trim();
  const workspaceName = values.workspaceName.trim();
  if (!primaryAgentName || !workspaceName) {
    throw new Error("Agent and workspace names are required before onboarding can complete.");
  }
  const state: FixtureOnboardingState = {
    schemaVersion: 1,
    primaryAgentName,
    businessContext: values.businessContext.trim(),
    workspaceName,
    completedAt,
  };
  storage?.setItem(fixtureOnboardingStorageKey(workspaceId), JSON.stringify(state));
  return state;
}

export function isFixtureOnboardingComplete(
  workspaceId: string,
  storage: Storage | null = browserStorage(),
): boolean {
  return readFixtureOnboarding(workspaceId, storage)?.completedAt != null;
}
