import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, type Locator, type Page } from "@playwright/test";
import {
  DEMO,
  demoChannelPath,
  demoCoworkersPath,
  demoTasksPath,
  hasProviderCredentials,
  missingProviderCredentials,
  providerFixtureTargetMatches,
} from "./live";

export async function loginAsOwner(page: Page): Promise<string> {
  // Authenticate outside Playwright's traced browser/request contexts, then install
  // only the opaque session cookie. This keeps even the disposable E2E credential
  // out of trace archives while preserving full tracing for the product scenario.
  const origin = process.env.FORGEROOM_E2E_BASE_URL ?? "http://127.0.0.1:5173";
  const response = await fetch(`${origin}/api/auth/login`, {
    method: "POST",
    body: JSON.stringify({ email: DEMO.ownerEmail, password: DEMO.ownerPassword }),
    headers: { Origin: origin, "content-type": "application/json" },
  });
  if (!response.ok) {
    throw new Error(`login failed: ${response.status} ${await response.text()}`);
  }
  const setCookie = response.headers.get("set-cookie");
  const cookiePair = setCookie?.split(";", 1)[0];
  const separator = cookiePair?.indexOf("=") ?? -1;
  if (!cookiePair || separator <= 0) {
    throw new Error("login response did not include a session cookie");
  }
  await page.context().addCookies([
    {
      name: cookiePair.slice(0, separator),
      value: cookiePair.slice(separator + 1),
      url: origin,
    },
  ]);
  const session = (await response.json()) as { csrf_token?: unknown };
  if (typeof session.csrf_token !== "string" || session.csrf_token.length === 0) {
    throw new Error("login response did not include a CSRF token");
  }
  await page.goto(demoChannelPath());
  await expect(page.getByRole("navigation", { name: "Primary" })).toBeVisible({
    timeout: 30_000,
  });
  return session.csrf_token;
}

export async function ensureSeededOperatorSession(page: Page, csrfToken: string): Promise<void> {
  const response = await page.request.post(`/api/channels/${DEMO.channelId}/participants`, {
    headers: {
      Origin: process.env.FORGEROOM_E2E_BASE_URL ?? "http://127.0.0.1:5173",
      "content-type": "application/json",
      "x-csrf-token": csrfToken,
    },
    data: {
      schemaVersion: 1,
      participant_type: "coworker",
      participant_id: DEMO.coworkerId,
      role: "member",
      idempotency_key: "e2e-provision-seeded-operator",
    },
  });
  if (!response.ok()) {
    throw new Error(`operator provisioning failed: ${response.status()} ${await response.text()}`);
  }
}

export async function gotoDemoChannel(page: Page): Promise<void> {
  await page.goto(demoChannelPath());
  await expect(page.getByRole("heading", { name: `# ${DEMO.channelName}` })).toBeVisible({
    timeout: 30_000,
  });
}

export async function gotoDemoCoworkers(page: Page): Promise<void> {
  await page.goto(demoCoworkersPath());
  await expect(page.getByRole("heading", { name: "Coworkers" })).toBeVisible();
}

export async function gotoDemoTasks(page: Page): Promise<void> {
  await page.goto(demoTasksPath());
  await expect(page.getByRole("heading", { name: "Tasks" })).toBeVisible();
}

export async function assertLiveP0SurfacesAbsent(page: Page): Promise<void> {
  await expect(page.locator("iframe")).toHaveCount(0);
  await expect(page.getByRole("link", { name: /component catalogue/i })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: /coordinator/i })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: /native subagent/i })).toHaveCount(0);
}

export async function createResearchCoworker(page: Page): Promise<void> {
  await gotoDemoCoworkers(page);
  await page
    .getByRole("button", { name: /new coworker/i })
    .first()
    .click();
  const dialog = page.getByRole("dialog", { name: /create a coworker/i });
  await expect(dialog).toBeVisible();
  const prompt = dialog.getByLabel(/What should this coworker own/i);
  await prompt.fill(DEMO.researchPrompt);
  await dialog.getByRole("button", { name: /generate review draft/i }).click();
  await expect(dialog.getByRole("heading", { name: "Unavailable / denied in P0" })).toBeVisible({
    timeout: 120_000,
  });
  await expect(
    dialog.getByText(/write tools: GITHUB ADD LABELS TO AN ISSUE denied/i),
  ).toBeVisible();
  await expect(dialog.getByText(/native subagents: disabled in P0 feature profile/i)).toBeVisible();
  await dialog.getByRole("button", { name: /Create Research/i }).click();
  await expect(page.getByText(/is ready/i)).toBeVisible({ timeout: 180_000 });
  await page.getByRole("button", { name: "Done" }).click();
  await expect(page.getByRole("heading", { name: "Coworkers" })).toBeVisible();
  await expect(page.getByText(/Research/i).first()).toBeVisible();
}

type PostedChannelMessage = {
  routing_mode: string;
  recipient_handles: string[];
  run_id: string | null;
  run_step_assignments: Array<{ coworker_id: string }>;
};

type ControlledUiSnapshot = {
  instanceId: string;
  componentName: string;
  componentDescriptorHash: string;
  rendererProfileHash: string;
  renderRevision: number | null;
  stateRevision: number | null;
  renderManifestHash: string | null;
  validatedPropsHash: string | null;
  scopedStateHash: string | null;
  lastChannelSequence: number;
};

type ApprovalSnapshot = {
  proposal_id: string;
  run_id: string;
  tool_name: string;
  observed_descriptor_hash: string;
  approval_policy_hash: string;
  account_id: string;
  arguments_hash: string;
  target_hash: string;
  payload_hash: string;
  session_generation: number;
  state: string;
};

type TaskSnapshot = {
  id: string;
  title: string;
  status: string;
  current_revision: number;
  source_message_id: string | null;
  source_run_id: string | null;
};

async function requireOkJson(page: Page, path: string): Promise<Record<string, unknown>> {
  const response = await page.request.get(path);
  if (!response.ok()) {
    throw new Error(`${path} failed: ${response.status()} ${await response.text()}`);
  }
  return (await response.json()) as Record<string, unknown>;
}

async function snapshotApproval(page: Page, card: Locator): Promise<ApprovalSnapshot> {
  const elementId = await card.getAttribute("id");
  const prefix = "trusted-hitl-approval-";
  if (!elementId?.startsWith(prefix)) {
    throw new Error("Trusted approval card is missing its durable proposal id.");
  }
  const proposalId = elementId.slice(prefix.length);
  const body = await requireOkJson(page, `/api/approvals/${encodeURIComponent(proposalId)}`);
  const source = body.card as Record<string, unknown>;
  return {
    proposal_id: String(source.proposal_id),
    run_id: String(source.run_id),
    tool_name: String(source.tool_name),
    observed_descriptor_hash: String(source.observed_descriptor_hash),
    approval_policy_hash: String(source.approval_policy_hash),
    account_id: String(source.account_id),
    arguments_hash: String(source.arguments_hash),
    target_hash: String(source.target_hash),
    payload_hash: String(source.payload_hash),
    session_generation: Number(source.session_generation),
    state: String(source.state),
  };
}

async function snapshotTask(page: Page, runId: string): Promise<TaskSnapshot> {
  let snapshot: TaskSnapshot | null = null;
  await expect
    .poll(async () => {
      const body = await requireOkJson(
        page,
        `/api/channels/${encodeURIComponent(DEMO.channelId)}/tasks`,
      );
      const tasks = Array.isArray(body.tasks) ? (body.tasks as Array<Record<string, unknown>>) : [];
      const task = tasks.find(
        (candidate) => candidate.title === DEMO.taskTitle && candidate.source_run_id === runId,
      );
      if (!task) return null;
      snapshot = {
        id: String(task.id),
        title: String(task.title),
        status: String(task.status),
        current_revision: Number(task.current_revision),
        source_message_id: task.source_message_id ? String(task.source_message_id) : null,
        source_run_id: task.source_run_id ? String(task.source_run_id) : null,
      };
      return snapshot.title;
    })
    .toBe(DEMO.taskTitle);
  if (!snapshot) throw new Error("Task did not become durable.");
  return snapshot;
}

async function snapshotVisibleControlledUi(
  page: Page,
): Promise<Record<string, ControlledUiSnapshot>> {
  const articles = page.locator("article[data-ui-instance-id]");
  const instanceIds = await articles.evaluateAll((nodes) => [
    ...new Set(nodes.map((node) => node.getAttribute("data-ui-instance-id")).filter(Boolean)),
  ]);
  const snapshots: Record<string, ControlledUiSnapshot> = {};
  for (const instanceId of instanceIds) {
    if (!instanceId) continue;
    const body = await requireOkJson(page, `/api/ui-instances/${encodeURIComponent(instanceId)}`);
    snapshots[instanceId] = {
      instanceId: String(body.instanceId),
      componentName: String(body.componentName),
      componentDescriptorHash: String(body.componentDescriptorHash),
      rendererProfileHash: String(body.rendererProfileHash),
      renderRevision: body.renderRevision === null ? null : Number(body.renderRevision),
      stateRevision: body.stateRevision === null ? null : Number(body.stateRevision),
      renderManifestHash: body.renderManifestHash === null ? null : String(body.renderManifestHash),
      validatedPropsHash: body.validatedPropsHash === null ? null : String(body.validatedPropsHash),
      scopedStateHash: body.scopedStateHash === null ? null : String(body.scopedStateHash),
      lastChannelSequence: Number(body.lastChannelSequence),
    };
  }
  return snapshots;
}

async function providerMarkerPresent(page: Page): Promise<boolean> {
  const fixture = DEMO.providerFixture;
  const response = await page.request.get(
    `https://api.github.com/repos/${fixture.owner}/${fixture.repository}/issues/${fixture.issueNumber}`,
    { headers: { Accept: "application/vnd.github+json" } },
  );
  if (!response.ok()) {
    throw new Error(`GitHub fixture read failed with HTTP ${response.status()}.`);
  }
  const issue = (await response.json()) as { labels?: Array<string | { name?: string }> };
  return (issue.labels ?? []).some((label) =>
    typeof label === "string" ? label === fixture.markerLabel : label.name === fixture.markerLabel,
  );
}

export function resetProviderFixture(): void {
  const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");
  const result = spawnSync("pnpm", ["--dir", repoRoot, "fixtures:reset", "--", "--provider-only"], {
    env: process.env,
    encoding: "utf8",
    timeout: 90_000,
  });
  if (result.status !== 0 || !/"providerReset"\s*:\s*"(?:ok|already_clean)"/.test(result.stdout)) {
    throw new Error(
      `Synthetic provider fixture reset failed (exit ${result.status ?? "unknown"}).`,
    );
  }
}

export async function sendTeamTask(page: Page): Promise<string> {
  await gotoDemoChannel(page);
  const composer = page.getByLabel("Message");
  await composer.fill(`@team ${DEMO.taskTitle}`);
  const postedResponse = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === `/api/channels/${DEMO.channelId}/messages`,
  );
  await page.getByRole("button", { name: "Send" }).click();
  const response = await postedResponse;
  if (!response.ok()) {
    throw new Error(`team message failed: ${response.status()} ${await response.text()}`);
  }
  const posted = (await response.json()) as PostedChannelMessage;
  expect(posted.routing_mode).toBe("team");
  expect(posted.recipient_handles).toEqual(expect.arrayContaining(["operator", "research"]));
  expect(posted.run_step_assignments).toHaveLength(2);
  expect(posted.run_id).toBeTruthy();
  await expect(page.getByText(DEMO.taskTitle).first()).toBeVisible({ timeout: 60_000 });
  return posted.run_id!;
}

/** Steps 5–15 after the Task is already in flight on the demo channel. */
export async function runProviderBackedNarrative(page: Page, runId: string): Promise<void> {
  await gotoDemoChannel(page);

  // 5 — controlled DataTable / chart from Composio read
  await expect(
    page.getByRole("heading", { name: /Synthetic demo records|Synthetic record counts/i }).first(),
  ).toBeVisible({ timeout: 180_000 });

  // 6 — bounded ChoiceForm
  await expect(page.getByRole("heading", { name: /Filter synthetic records/i })).toBeVisible({
    timeout: 60_000,
  });
  await page.getByRole("button", { name: "Apply filter" }).click();

  // 7 — ArtifactCard
  await expect(page.getByRole("heading", { name: /Sandbox summary/i })).toBeVisible({
    timeout: 180_000,
  });

  // 8 — trusted approval
  const approval = page.getByLabel("Trusted approval card");
  await expect(approval).toBeVisible({ timeout: 180_000 });

  // 9 — deny and independently read the public fixture to prove zero provider mutation.
  expect(await providerMarkerPresent(page)).toBe(false);
  const deniedProposal = await snapshotApproval(page, approval);
  await approval.getByRole("button", { name: "Deny" }).click();
  await expect(page.getByText(/Decision recorded/i).first()).toBeVisible({ timeout: 60_000 });
  await expect.poll(() => providerMarkerPresent(page)).toBe(false);
  expect((await snapshotApproval(page, approval)).state).toBe("denied");

  // 10 — re-request: send a follow-up that should produce a new write proposal
  const composer = page.getByLabel("Message");
  await composer.fill(
    `@operator Re-read the synthetic issue, verify the marker label is still absent after denial, then request the deterministic label update again.`,
  );
  const retryResponsePromise = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === `/api/channels/${DEMO.channelId}/messages`,
  );
  await page.getByRole("button", { name: "Send" }).click();
  const retryResponse = await retryResponsePromise;
  if (!retryResponse.ok()) {
    throw new Error(`operator retry message failed with HTTP ${retryResponse.status()}.`);
  }
  const retryPosted = (await retryResponse.json()) as PostedChannelMessage;
  expect(retryPosted.routing_mode).toBe("mentions");
  expect(retryPosted.recipient_handles).toEqual(["operator"]);
  expect(retryPosted.run_step_assignments).toHaveLength(1);
  expect(retryPosted.run_id).toBeTruthy();
  const retryRunId = retryPosted.run_id!;

  const approvalAgain = page
    .getByLabel("Trusted approval card")
    .filter({ has: page.getByRole("button", { name: "Approve" }) })
    .last();
  await expect(approvalAgain).toBeVisible({ timeout: 180_000 });

  // 11 — refresh restores exact pending proposal
  const pendingProposal = await snapshotApproval(page, approvalAgain);
  expect(pendingProposal.proposal_id).not.toBe(deniedProposal.proposal_id);
  expect(deniedProposal.run_id).toBe(runId);
  expect(pendingProposal.run_id).toBe(retryRunId);
  const durableTask = await snapshotTask(page, runId);
  const controlledUi = await snapshotVisibleControlledUi(page);
  expect(Object.values(controlledUi).map((snapshot) => snapshot.componentName)).toEqual(
    expect.arrayContaining([
      expect.stringMatching(/DataTable|BarOrLineChart/),
      "ChoiceForm",
      "ArtifactCard",
    ]),
  );
  await page.reload();
  const restoredApproval = page
    .getByLabel("Trusted approval card")
    .filter({ has: page.getByRole("button", { name: "Approve" }) })
    .last();
  await expect(restoredApproval).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText(DEMO.taskTitle).first()).toBeVisible();
  expect(await snapshotApproval(page, restoredApproval)).toEqual(pendingProposal);
  expect(await snapshotTask(page, runId)).toEqual(durableTask);
  for (const instanceId of Object.keys(controlledUi)) {
    await expect(page.locator(`[data-ui-instance-id="${instanceId}"]`)).toBeVisible();
  }
  expect(await snapshotVisibleControlledUi(page)).toEqual(controlledUi);

  // 12 — approve
  await restoredApproval.getByRole("button", { name: "Approve" }).click();
  await expect(page.getByText(/Decision recorded/i).first()).toBeVisible({ timeout: 60_000 });

  // 13 — reconcile / receipt path
  await expect.poll(() => providerMarkerPresent(page), { timeout: 180_000 }).toBe(true);
  const originalReceiptButton = page.locator(`button[data-run-id="${runId}"]`).first();
  await expect(originalReceiptButton).toBeVisible({
    timeout: 180_000,
  });
  await originalReceiptButton.click();
  const receiptDialog = page.getByRole("dialog");
  await expect(receiptDialog).toBeVisible();
  await expect(receiptDialog.getByRole("heading", { name: "Audit receipt" })).toBeVisible();
  await expect(receiptDialog.getByText(/^sha256:/)).toBeVisible();

  const receiptBeforeSkill = await requireOkJson(
    page,
    `/api/runs/${encodeURIComponent(runId)}/receipt`,
  );
  const receipt = receiptBeforeSkill.receipt as Record<string, unknown>;
  expect(receiptBeforeSkill.receipt_hash).toMatch(/^sha256:[a-f0-9]{64}$/);
  expect(receipt.run_id).toBe(runId);
  expect(receipt.task_id).toBe(durableTask.id);
  expect(receipt.artifact_id).toBeTruthy();
  expect(receipt.ui_instance_id).toBeTruthy();
  expect(receipt.coworker_ids).toHaveLength(2);
  expect(receipt.approval_ids).toContain(deniedProposal.proposal_id);
  expect(receipt.approval_ids).not.toContain(pendingProposal.proposal_id);

  const retryReceiptBody = await requireOkJson(
    page,
    `/api/runs/${encodeURIComponent(retryRunId)}/receipt`,
  );
  const retryReceipt = retryReceiptBody.receipt as Record<string, unknown>;
  expect(retryReceipt.run_id).toBe(retryRunId);
  expect(retryReceipt.approval_ids).toContain(pendingProposal.proposal_id);
  expect(retryReceipt.approval_ids).not.toContain(deniedProposal.proposal_id);

  // 14 — save as skill
  await receiptDialog.getByRole("button", { name: "Save as skill" }).click();
  await page.getByRole("button", { name: /Publish v1 and attach/i }).click();
  await expect(page.getByText(/Skill published and attached/i)).toBeVisible({ timeout: 180_000 });

  const receiptAfterSkill = await requireOkJson(
    page,
    `/api/runs/${encodeURIComponent(runId)}/receipt`,
  );
  const finalReceipt = receiptAfterSkill.receipt as Record<string, unknown>;
  expect(finalReceipt.skill_version_id).toBeTruthy();
  expect(finalReceipt.run_id).toBe(runId);
  expect(finalReceipt.task_id).toBe(durableTask.id);

  // 15 — lineage / P0 absences
  await assertLiveP0SurfacesAbsent(page);
}

export function requireProvidersOrSkip(test: {
  skip: (condition: boolean, description?: string) => void;
}): void {
  test.skip(!hasProviderCredentials(), "Provider credentials required for full live scenario");
}

export function assertProvidersConfigured(): void {
  const missing = missingProviderCredentials();
  if (missing.length > 0) {
    throw new Error(
      `FORGEROOM_E2E_LIVE=providers requires env: ${missing.join(", ")}. ` +
        `Copy values into .env (never commit). See apps/e2e/scripts/start-providers-stack.sh.`,
    );
  }
  if (!providerFixtureTargetMatches()) {
    throw new Error(
      "Configured GitHub target does not match the approved synthetic provider fixture.",
    );
  }
}
