import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MOCK_WORKSPACE_ID } from "./mock-fixtures";

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

async function importWorkspaceApi() {
  return import("./workspace-api");
}

describe("workspace API fixture mutations", () => {
  beforeEach(() => {
    vi.stubGlobal("window", { localStorage: new MemoryStorage() });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("removes and adds a channel coworker across fixture module reloads", async () => {
    let api = await importWorkspaceApi();
    const initial = await api.listChannelRoster(MOCK_WORKSPACE_ID, "ch_general_001");
    expect(initial.coworkers.map((coworker) => coworker.coworker_id)).toContain("cw_analyst_002");

    await api.removeChannelCoworker({
      channelId: "ch_general_001",
      coworkerId: "cw_analyst_002",
      csrfToken: "fixture_csrf_token",
    });
    expect(
      (await api.listChannelRoster(MOCK_WORKSPACE_ID, "ch_general_001")).coworkers.map(
        (coworker) => coworker.coworker_id,
      ),
    ).not.toContain("cw_analyst_002");

    vi.resetModules();
    api = await importWorkspaceApi();
    expect(
      (await api.listChannelRoster(MOCK_WORKSPACE_ID, "ch_general_001")).coworkers.map(
        (coworker) => coworker.coworker_id,
      ),
    ).not.toContain("cw_analyst_002");

    await api.addChannelCoworker({
      channelId: "ch_general_001",
      coworkerId: "cw_analyst_002",
      csrfToken: "fixture_csrf_token",
    });
    expect(
      (await api.listChannelRoster(MOCK_WORKSPACE_ID, "ch_general_001")).coworkers.map(
        (coworker) => coworker.coworker_id,
      ),
    ).toContain("cw_analyst_002");

    vi.resetModules();
    api = await importWorkspaceApi();
    expect(
      (await api.listChannelRoster(MOCK_WORKSPACE_ID, "ch_general_001")).coworkers.map(
        (coworker) => coworker.coworker_id,
      ),
    ).toContain("cw_analyst_002");
  });

  it("creates, reloads, and removes fixture channel pins", async () => {
    let api = await importWorkspaceApi();
    expect(await api.listChannelPins("ch_general_001")).toEqual([]);

    const created = await api.createChannelPin({
      channelId: "ch_general_001",
      csrfToken: "fixture_csrf_token",
      sourceMessageId: "msg_seed_001",
      label: "Pinned customer evidence",
    });
    expect(created).toMatchObject({
      channel_id: "ch_general_001",
      source_message_id: "msg_seed_001",
      source_artifact_id: null,
      label: "Pinned customer evidence",
    });
    expect(await api.listChannelPins("ch_general_001")).toEqual([created]);

    vi.resetModules();
    api = await importWorkspaceApi();
    expect(await api.listChannelPins("ch_general_001")).toEqual([created]);

    await expect(
      api.removeChannelPin({
        channelId: "ch_general_001",
        pinId: created.id,
        csrfToken: "fixture_csrf_token",
      }),
    ).resolves.toEqual(created);
    expect(await api.listChannelPins("ch_general_001")).toEqual([]);
    await expect(
      api.removeChannelPin({
        channelId: "ch_general_001",
        pinId: created.id,
        csrfToken: "fixture_csrf_token",
      }),
    ).rejects.toThrow("pin_not_found");
  });

  it("rejects unknown fixture membership and pin targets", async () => {
    const api = await importWorkspaceApi();
    await expect(
      api.addChannelCoworker({
        channelId: "ch_general_001",
        coworkerId: "cw_missing",
        csrfToken: "fixture_csrf_token",
      }),
    ).rejects.toThrow("coworker_not_found");
    await expect(api.listChannelPins("ch_missing")).rejects.toThrow("channel_not_found");
  });

  it("shows a composer-created task in the channel work list", async () => {
    let api = await importWorkspaceApi();
    const created = await api.createTask({
      workspaceId: MOCK_WORKSPACE_ID,
      channelId: "ch_general_001",
      csrfToken: "fixture_csrf_token",
      command: {
        schemaVersion: 1,
        title: "Prepare launch checklist",
        description: "@analyst Prepare launch checklist",
        status: "todo",
        assignee_type: "coworker",
        assignee_id: "cw_analyst_002",
        source_message_id: "msg_assignment_001",
        source_run_id: null,
        due_at: null,
        idempotency_key: "task_create_fixture_test",
      },
    });

    await expect(api.listChannelTasks("ch_general_001")).resolves.toContainEqual(created);

    vi.resetModules();
    api = await importWorkspaceApi();
    await expect(api.listTasks(MOCK_WORKSPACE_ID)).resolves.toContainEqual(created);
    await expect(api.listChannelTasks("ch_general_001")).resolves.toContainEqual(created);
  });
});
