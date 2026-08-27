import { withMigratedDatabase } from "@forgeroom/db/test-harness";
import { describe, expect, it } from "vitest";
import {
  DEMO_FIXTURE_IDS,
  assertProviderResetTargetAllowed,
  loadDemoEnv,
  loadDemoFixtureBundle,
  resetDemoFixtures,
  seedDemoFixtures,
} from "./demo-seed";

describe("P0-105 demo fixtures", () => {
  it("loads Operator/Research fixtures without inventing product classes", () => {
    const bundle = loadDemoFixtureBundle();
    expect(bundle.operator.fixtureRole).toBe("Operator");
    expect(bundle.operator.coworker.handle).toBe("operator");
    expect(bundle.operator.coworker.native_subagents_enabled).toBe(false);
    expect(bundle.researchDraft.prompt).toContain("Research coworker");
    expect(
      bundle.researchDraft.expectedPermissionPreview.exactDiff?.grants[0]?.directToolSlug,
    ).toBe("GITHUB_GET_AN_ISSUE");
    expect(bundle.taskTitle.length).toBeGreaterThan(0);
  });

  it("refuses provider reset against unrecognized accounts or records", () => {
    const bundle = loadDemoFixtureBundle();
    expect(() =>
      assertProviderResetTargetAllowed({
        connectedAccountId: "acct_wrong_suffix",
        pinned: bundle.pinnedAccount,
        synthetic: bundle.syntheticProvider,
        owner: bundle.syntheticProvider.owner,
        repo: bundle.syntheticProvider.repo,
        issueNumber: bundle.syntheticProvider.issueNumber,
        label: bundle.syntheticProvider.syntheticMarker.value,
      }),
    ).toThrow(/pinned suffix/);

    expect(() =>
      assertProviderResetTargetAllowed({
        connectedAccountId: `acct_${bundle.pinnedAccount.redactedSuffix}`,
        pinned: bundle.pinnedAccount,
        synthetic: bundle.syntheticProvider,
        owner: "someone-else",
        repo: bundle.syntheticProvider.repo,
        issueNumber: bundle.syntheticProvider.issueNumber,
        label: bundle.syntheticProvider.syntheticMarker.value,
      }),
    ).toThrow(/synthetic provider fixture/);
  });

  it("seeds and resets twice to the same logical demo graph", async () => {
    await withMigratedDatabase(async (sql) => {
      const env = {
        ...loadDemoEnv({
          OWNER_USER_ID: "user_owner",
          OWNER_EMAIL: "owner@example.test",
          OWNER_DISPLAY_NAME: "Owner",
          OWNER_PASSWORD: "demo-seed-password",
          WORKSPACE_ID: "workspace_1",
          WORKSPACE_NAME: "ForgeRoom",
          WORKSPACE_SLUG: "forgeroom",
        }),
        databaseUrl: "unused",
      };

      const first = await seedDemoFixtures({ env, sql, migrateFirst: false });
      const second = await seedDemoFixtures({ env, sql, migrateFirst: false });
      const resetOnce = await resetDemoFixtures({
        env,
        sql,
        migrateFirst: false,
        providerReset: false,
      });
      const resetTwice = await resetDemoFixtures({
        env,
        sql,
        migrateFirst: false,
        providerReset: false,
      });

      expect(first).toMatchObject({
        channelId: DEMO_FIXTURE_IDS.channelId,
        coworkerId: DEMO_FIXTURE_IDS.coworkerId,
        coworkerHandle: "operator",
        workspaceId: "workspace_1",
      });
      expect(second).toEqual(first);
      expect(resetOnce).toMatchObject({
        channelId: DEMO_FIXTURE_IDS.channelId,
        coworkerId: DEMO_FIXTURE_IDS.coworkerId,
        providerReset: "skipped",
      });
      expect(resetTwice.channelId).toBe(resetOnce.channelId);
      expect(resetTwice.coworkerId).toBe(resetOnce.coworkerId);

      const channels = await sql<{ id: string; name: string; status: string }[]>`
        SELECT id, name, status FROM channels WHERE id = ${DEMO_FIXTURE_IDS.channelId}
      `;
      expect(channels).toHaveLength(1);
      expect(channels[0]?.name).toBe("general");
      expect(channels[0]?.status).toBe("active");

      const coworkers = await sql<{ handle: string; status: string }[]>`
        SELECT handle, status FROM agent_profiles WHERE id = ${DEMO_FIXTURE_IDS.coworkerId}
      `;
      expect(coworkers).toEqual([{ handle: "operator", status: "active" }]);

      const participants = await sql<{ participant_type: string; participant_id: string }[]>`
        SELECT participant_type, participant_id
        FROM channel_participants
        WHERE channel_id = ${DEMO_FIXTURE_IDS.channelId} AND removed_at IS NULL
        ORDER BY participant_type, participant_id
      `;
      expect(participants).toEqual([
        { participant_type: "coworker", participant_id: DEMO_FIXTURE_IDS.coworkerId },
        { participant_type: "human", participant_id: "user_owner" },
      ]);

      await sql`
        INSERT INTO channel_events (
          id, channel_id, sequence, type, actor_type, actor_id, payload_json, created_at
        ) VALUES (
          'cevt_demo_msg_probe', ${DEMO_FIXTURE_IDS.channelId}, 1, 'message.created', 'human', 'user_owner',
          '{}'::jsonb, ${new Date().toISOString()}
        )
        ON CONFLICT (id) DO NOTHING
      `;
      await sql`
        INSERT INTO messages (
          id, channel_id, event_id, author_type, author_id, body, created_at
        ) VALUES (
          'msg_demo_seed_probe', ${DEMO_FIXTURE_IDS.channelId}, 'cevt_demo_msg_probe',
          'human', 'user_owner', 'probe', ${new Date().toISOString()}
        )
        ON CONFLICT (id) DO NOTHING
      `;
      await sql`
        INSERT INTO tasks (
          id, workspace_id, channel_id, title, status, source_message_id,
          current_revision, created_by_type, created_by_id, created_at, updated_at
        ) VALUES (
          'task_demo_seed_probe', 'workspace_1', ${DEMO_FIXTURE_IDS.channelId}, 'Probe',
          'todo', 'msg_demo_seed_probe', 1, 'human', 'user_owner',
          ${new Date().toISOString()}, ${new Date().toISOString()}
        )
        ON CONFLICT (id) DO NOTHING
      `;

      await resetDemoFixtures({ env, sql, migrateFirst: false, providerReset: false });

      const remainingTasks = await sql<{ id: string }[]>`
        SELECT id FROM tasks WHERE id = 'task_demo_seed_probe'
      `;
      expect(remainingTasks).toHaveLength(0);
      const remainingMessages = await sql<{ id: string }[]>`
        SELECT id FROM messages WHERE id = 'msg_demo_seed_probe'
      `;
      expect(remainingMessages).toHaveLength(1);
    });
  }, 120_000);
});
