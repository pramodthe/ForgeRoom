import { describe, expect, it } from "vitest";
import {
  completeFixtureOnboarding,
  fixtureOnboardingStorageKey,
  isFixtureOnboardingComplete,
  readFixtureOnboarding,
  saveFixtureOnboardingDraft,
} from "./fixture-onboarding";

class MemoryStorage implements Storage {
  readonly #values = new Map<string, string>();

  get length(): number {
    return this.#values.size;
  }

  clear(): void {
    this.#values.clear();
  }

  getItem(key: string): string | null {
    return this.#values.get(key) ?? null;
  }

  key(index: number): string | null {
    return [...this.#values.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.#values.delete(key);
  }

  setItem(key: string, value: string): void {
    this.#values.set(key, value);
  }
}

describe("fixture onboarding persistence", () => {
  it("treats a workspace with no stored record as not onboarded", () => {
    expect(isFixtureOnboardingComplete("workspace_1", new MemoryStorage())).toBe(false);
  });

  it("persists trimmed draft values without marking onboarding complete", () => {
    const storage = new MemoryStorage();
    saveFixtureOnboardingDraft(
      "workspace_1",
      {
        primaryAgentName: " Atlas ",
        businessContext: " Customer operations ",
        workspaceName: " Launch team ",
      },
      storage,
    );

    expect(readFixtureOnboarding("workspace_1", storage)).toEqual({
      schemaVersion: 1,
      primaryAgentName: "Atlas",
      businessContext: "Customer operations",
      workspaceName: "Launch team",
      completedAt: null,
    });
    expect(isFixtureOnboardingComplete("workspace_1", storage)).toBe(false);
  });

  it("marks a valid fixture profile complete", () => {
    const storage = new MemoryStorage();
    completeFixtureOnboarding(
      "workspace_1",
      {
        primaryAgentName: "Atlas",
        businessContext: "",
        workspaceName: "Launch team",
      },
      storage,
      "2026-08-29T20:00:00.000Z",
    );

    expect(isFixtureOnboardingComplete("workspace_1", storage)).toBe(true);
    expect(readFixtureOnboarding("workspace_1", storage)?.completedAt).toBe(
      "2026-08-29T20:00:00.000Z",
    );
  });

  it("clears malformed records and rejects incomplete completion", () => {
    const storage = new MemoryStorage();
    storage.setItem(fixtureOnboardingStorageKey("workspace_1"), '{"schemaVersion":2}');
    expect(readFixtureOnboarding("workspace_1", storage)).toBeNull();
    expect(storage.length).toBe(0);
    expect(() =>
      completeFixtureOnboarding(
        "workspace_1",
        { primaryAgentName: "", businessContext: "", workspaceName: "Launch team" },
        storage,
      ),
    ).toThrow("Agent and workspace names are required");
  });
});
