import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  assertControlledUiFixturesValid,
  assertP0FeatureProfileFrozen,
  findRepoRoot,
  isForbiddenP0101Dependency,
  loadP0FeatureProfile,
  readProviderFixtureJson,
} from "./index";

describe("isForbiddenP0101Dependency", () => {
  it("allows AG-UI packages only in @forgeroom/ag-ui", () => {
    expect(isForbiddenP0101Dependency("@ag-ui/core")).toBe(true);
    expect(isForbiddenP0101Dependency("@ag-ui/core", "@forgeroom/ag-ui")).toBe(false);
    expect(isForbiddenP0101Dependency("@ag-ui/client", "@forgeroom/ag-ui")).toBe(false);
    expect(isForbiddenP0101Dependency("@ag-ui/core", "@forgeroom/api")).toBe(true);
    expect(isForbiddenP0101Dependency("@copilotkit/runtime")).toBe(true);
    expect(isForbiddenP0101Dependency("zod")).toBe(false);
  });
});

describe("findRepoRoot", () => {
  it("resolves the repository from FORGEROOM_REPO_ROOT when module path is outside checkout", () => {
    const actualRoot = findRepoRoot();
    expect(
      findRepoRoot({
        from: "/tmp/forgeroom-bundle/dist",
        env: { FORGEROOM_REPO_ROOT: actualRoot },
      }),
    ).toBe(actualRoot);
    expect(() =>
      readProviderFixtureJson("p0-feature-profile.json", {
        from: "/tmp/forgeroom-bundle/dist",
        env: { FORGEROOM_REPO_ROOT: actualRoot },
      }),
    ).not.toThrow();
  });

  it("prefers the module path over an unrelated cwd workspace", () => {
    const actualRoot = findRepoRoot();
    const cwdSpy = vi.spyOn(process, "cwd").mockReturnValue("/tmp");
    try {
      expect(findRepoRoot({ from: join(actualRoot, "packages/test-fixtures/src") })).toBe(
        actualRoot,
      );
    } finally {
      cwdSpy.mockRestore();
    }
  });
});

describe("P0-000 provider fixtures", () => {
  it("freezes the P0 feature profile disables", () => {
    expect(() => assertP0FeatureProfileFrozen()).not.toThrow();
    const profile = loadP0FeatureProfile();
    expect(profile.disabled.componentCatalogueExpansion.allowedAgentTools).toEqual([
      "DataTable",
      "BarOrLineChart",
      "TaskCard",
      "ArtifactCard",
      "ChoiceForm",
    ]);
  });

  it("records selected pure AG-UI baseline and disabled-unless-parity CopilotKit policy", () => {
    const candidates = readProviderFixtureJson<{
      status: string;
      requiredPureBaseline: { status: string; packages: Record<string, string> };
      optionalCopilotKitTarget: { status: string; enabled: boolean };
    }>("ag-ui/candidates.json");
    const policy = readProviderFixtureJson<{
      optionalCopilotKit: { default: string; enablementPolicy: string };
    }>("ag-ui/policy.json");

    expect(candidates.status).toBe("selected");
    expect(candidates.requiredPureBaseline.status).toBe("selected");
    expect(candidates.requiredPureBaseline.packages).toEqual({
      "@ag-ui/core": "0.0.57",
      "@ag-ui/client": "0.0.57",
    });
    expect(candidates.optionalCopilotKitTarget.status).toBe("candidate");
    expect(candidates.optionalCopilotKitTarget.enabled).toBe(false);
    expect(policy.optionalCopilotKit.default).toBe("disabled");
    expect(policy.optionalCopilotKit.enablementPolicy).toBe("coherent_graph_parity_only");
  });

  it("validates controlled UI fixture props against shared contracts", () => {
    expect(() => assertControlledUiFixturesValid()).not.toThrow();
  });

  it("records verified Composio probe results after live probe", () => {
    const apps = readProviderFixtureJson<{
      verification: string;
      applications: Array<{ composioToolkitSlug: string | null; status: string }>;
    }>("composio/applications.candidate.json");
    const tools = readProviderFixtureJson<{
      verification: string;
      tools: Array<{
        directToolSlug: string | null;
        preferredCandidateSlug?: string | null;
        role: string;
      }>;
      observedDescriptorHashes: { status: string; entries: Array<{ sha256: string }> };
    }>("composio/tools.candidate.json");

    expect(apps.verification).toBe("verified");
    expect(apps.applications[0]?.composioToolkitSlug).toBe("github");
    expect(apps.applications[0]?.status).toBe("verified");
    expect(tools.verification).toBe("verified");
    expect(tools.tools.find((tool) => tool.role === "read")?.directToolSlug).toBe(
      "GITHUB_GET_AN_ISSUE",
    );
    expect(tools.tools.find((tool) => tool.role === "deterministic_write")?.directToolSlug).toBe(
      "GITHUB_ADD_LABELS_TO_AN_ISSUE",
    );
    expect(tools.observedDescriptorHashes.status).toBe("verified");
    expect(tools.observedDescriptorHashes.entries.length).toBeGreaterThan(0);
    expect(tools.observedDescriptorHashes.entries[0]?.sha256).toMatch(/^[a-f0-9]{64}$/);

    const session = readProviderFixtureJson<{
      status: string;
      ownerTask: string;
      session: {
        toolkitSlugs: string[];
        directTools: string[];
        disabled: Record<string, boolean>;
        mcpSecrets: { neverInGitOrDbJson: boolean };
      };
    }>("composio/session.verified.json");
    expect(session.status).toBe("verified");
    expect(session.ownerTask).toBe("P0-301");
    expect(session.session.toolkitSlugs).toEqual(["github"]);
    expect(session.session.directTools).toEqual([
      "GITHUB_GET_AN_ISSUE",
      "GITHUB_ADD_LABELS_TO_AN_ISSUE",
      "GITHUB_REMOVE_A_LABEL_FROM_AN_ISSUE",
    ]);
    expect(session.session.disabled.searchMetaTools).toBe(true);
    expect(session.session.disabled.multiExecute).toBe(true);
    expect(session.session.mcpSecrets.neverInGitOrDbJson).toBe(true);

    const preflight = readProviderFixtureJson<{
      status: string;
      ownerTask: string;
      trueforgeConnector: { name: string; auth: string };
      failClosedFixtures: string[];
      pinnedAccount: { status: string; redactedSuffix: string };
    }>("composio/preflight.verified.json");
    expect(preflight.status).toBe("verified");
    expect(preflight.ownerTask).toBe("P0-302");
    expect(preflight.trueforgeConnector.name).toBe("composio_github");
    expect(preflight.trueforgeConnector.auth).toBe("header");
    expect(preflight.pinnedAccount.status).toBe("ACTIVE");
    expect(preflight.pinnedAccount.redactedSuffix).toBe("nizY");
    expect(preflight.failClosedFixtures).toEqual(
      expect.arrayContaining([
        "missing_tool",
        "added_tool",
        "schema_change",
        "lost_approval_rule",
        "expired_account",
      ]),
    );

    const realRead = readProviderFixtureJson<{
      status: string;
      ownerTask: string;
      preflight: { exactTool: string; accountSuffix: string };
      trueforgeInvocation: { directToolOnly: boolean; observedToolName: string };
      normalizedEvent: { rawResultBodyPresent: boolean; credentialsPresent: boolean };
      expiredAuth: { mapsTo: string; fallbackAccountSelected: boolean };
      liveRead: { status: string; targetDisplay: string };
    }>("composio/real-read.verified.json");
    expect(realRead.status).toBe("verified");
    expect(realRead.ownerTask).toBe("P0-305");
    expect(realRead.preflight.exactTool).toBe("GITHUB_GET_AN_ISSUE");
    expect(realRead.preflight.accountSuffix).toBe("nizY");
    expect(realRead.trueforgeInvocation.directToolOnly).toBe(true);
    expect(realRead.trueforgeInvocation.observedToolName).toBe("GITHUB_GET_AN_ISSUE");
    expect(realRead.normalizedEvent.rawResultBodyPresent).toBe(false);
    expect(realRead.normalizedEvent.credentialsPresent).toBe(false);
    expect(realRead.expiredAuth.mapsTo).toBe("blocked_connection");
    expect(realRead.expiredAuth.fallbackAccountSelected).toBe(false);
    expect(realRead.liveRead.status).toBe("verified");
    expect(realRead.liveRead.targetDisplay).toBe("pramodthe/ForgeRoom#35");

    const deterministicWrite = readProviderFixtureJson<{
      status: string;
      ownerTask: string;
      approvalRequiredSet: { literalWriteTool: string; inTrueForgeRequireApprovalForTools: boolean };
      denial: { providerCalls: number; fixtureUnchanged: boolean };
      approval: { createsResumeIntent: boolean; resumeIntentCount: number };
      timeout: { proposalState: string; automaticRetry: boolean };
      reconciliation: { finalState: string; afterLabelsContainedProbe: boolean };
      receipt: { claim: string; onlyWhenAdapterVerifies: boolean };
      liveWrite: { status: string; toolName: string };
      rawResultBodyPresent: boolean;
      credentialsPresent: boolean;
    }>("composio/deterministic-write.verified.json");
    expect(deterministicWrite.status).toBe("verified");
    expect(deterministicWrite.ownerTask).toBe("P0-309");
    expect(deterministicWrite.approvalRequiredSet.literalWriteTool).toBe(
      "GITHUB_ADD_LABELS_TO_AN_ISSUE",
    );
    expect(deterministicWrite.approvalRequiredSet.inTrueForgeRequireApprovalForTools).toBe(true);
    expect(deterministicWrite.denial.providerCalls).toBe(0);
    expect(deterministicWrite.denial.fixtureUnchanged).toBe(true);
    expect(deterministicWrite.approval.createsResumeIntent).toBe(true);
    expect(deterministicWrite.approval.resumeIntentCount).toBe(1);
    expect(deterministicWrite.timeout.proposalState).toBe("unknown");
    expect(deterministicWrite.timeout.automaticRetry).toBe(false);
    expect(deterministicWrite.reconciliation.finalState).toBe("reconciled_succeeded");
    expect(deterministicWrite.reconciliation.afterLabelsContainedProbe).toBe(true);
    expect(deterministicWrite.receipt.claim).toBe("verified_provider_receipt");
    expect(deterministicWrite.receipt.onlyWhenAdapterVerifies).toBe(true);
    expect(deterministicWrite.liveWrite.status).toBe("verified");
    expect(deterministicWrite.rawResultBodyPresent).toBe(false);
    expect(deterministicWrite.credentialsPresent).toBe(false);
  });

  it("freezes TaskRecord and Save-as-skill successful Run fixtures", () => {
    const task = readProviderFixtureJson<{
      status: string;
      demoTaskTitle: string;
      fixtureIds: { taskId: string };
      taskRecord: { demo_transition: { from: string; to: string; then: string } };
    }>("tasks/task-record.candidate.json");
    const skill = readProviderFixtureJson<{
      status: string;
      successfulRun: {
        status: string;
        fixtureIds: {
          applicationRunId: string;
          applicationStepIds: string[];
          skillVersionId: string;
        };
      };
      liveProbe: {
        status: string;
        turnStatus: string;
        instructionOnlyOutputSha256: string;
        sourceContentHash: string;
        requiredTools: string[];
      };
      skillVersion: {
        instructionOnly: boolean;
        newAuthority: boolean;
        expectedSections: string[];
      };
      reviewManifest: {
        status: string;
        mustShow: string[];
        noNewAuthority: boolean;
      };
    }>("tasks/save-as-skill.candidate.json");

    expect(task.status).toBe("verified");
    expect(task.demoTaskTitle).toBe(
      "Reconcile the synthetic demo record and publish a sandbox summary",
    );
    expect(task.fixtureIds.taskId).toBe("task_demo_reconcile");
    expect(task.taskRecord.demo_transition).toEqual({
      from: "todo",
      to: "in_progress",
      then: "done",
    });

    expect(skill.status).toBe("verified");
    expect(skill.successfulRun.status).toBe("verified");
    expect(skill.successfulRun.fixtureIds.applicationRunId).toBe("run_demo_reconcile");
    expect(skill.successfulRun.fixtureIds.applicationStepIds).toEqual([
      "rs_demo_read",
      "rs_demo_write_approval",
      "rs_demo_reconcile_read",
      "rs_demo_sandbox_summary",
    ]);
    expect(skill.successfulRun.fixtureIds.skillVersionId).toBe("skv_demo_reconcile_v1");
    expect(skill.liveProbe.status).toBe("verified");
    expect(skill.liveProbe.turnStatus).toBe("done");
    expect(skill.liveProbe.instructionOnlyOutputSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(skill.liveProbe.sourceContentHash).toBe(
      `sha256:${skill.liveProbe.instructionOnlyOutputSha256}`,
    );
    expect(skill.liveProbe.requiredTools).toEqual([
      "GITHUB_GET_AN_ISSUE",
      "GITHUB_ADD_LABELS_TO_AN_ISSUE",
    ]);
    expect(skill.skillVersion.instructionOnly).toBe(true);
    expect(skill.skillVersion.newAuthority).toBe(false);
    expect(skill.skillVersion.expectedSections).toEqual([
      "when_to_use",
      "inputs",
      "method",
      "validation",
      "output",
      "failures",
    ]);
    expect(skill.reviewManifest.status).toBe("verified");
    expect(skill.reviewManifest.noNewAuthority).toBe(true);
    expect(skill.reviewManifest.mustShow).toEqual([
      "exact_inputs",
      "tools",
      "output",
      "approval_boundary",
      "no_new_authority",
    ]);
  });
});
