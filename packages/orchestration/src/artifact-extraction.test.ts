import { describe, expect, it } from "vitest";
import { hashArtifactContent } from "@forgeroom/artifacts";
import {
  executePublishSandboxArtifactCommand,
  publishSandboxArtifactFromDiscovery,
} from "./artifact-extraction";

const FIXTURE_LINES = `demo-rec-001 → open
demo-rec-002 → ready`;
const P0_TRUEFORGE_SANDBOX_FILE_WIRE_TYPE = "sandbox.file" as const;

describe("P0-312 sandbox artifact publication", () => {
  const fixtureContent = Buffer.from(FIXTURE_LINES, "utf8");
  const discovery = {
    sandboxId: "sb_daytona_abc123",
    sandboxPath: "/home/daytona/forgeroom-p0-probe-sample.md",
    relativePath: "forgeroom-p0-probe-sample.md",
    name: "forgeroom-p0-probe-sample.md",
    mimeType: "text/markdown",
    declaredByteSize: fixtureContent.byteLength,
    trueforgeEventId: "e2",
    sourceWireType: P0_TRUEFORGE_SANDBOX_FILE_WIRE_TYPE,
  };

  const baseInput = {
    workspaceId: "ws_1",
    channelId: "ch_1",
    runId: "run_1",
    runStepId: "step_1",
    creatorAgentId: "cw_1",
    trueforgeSessionId: "tf_sess_1",
    trueforgeTurnId: "tf_turn_1",
    artifactId: "artifact_1",
    revision: 1,
    discovery,
    sandboxCommandState: "completed" as const,
  };

  it("hashes, publishes and projects artifact events after sandbox command completion", async () => {
    let stored: Buffer | undefined;
    const result = await publishSandboxArtifactFromDiscovery(
      {
        downloadSandboxFile: async () => fixtureContent,
        publishArtifact: async (input) => {
          stored = input.content;
          return {
            ok: true,
            created: true,
            sha256: hashArtifactContent(input.content),
            byteSize: input.content.byteLength,
          };
        },
      },
      baseInput,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.events.map((event) => event.normalizedType)).toEqual([
      "artifact.discovered",
      "artifact.published",
    ]);
    expect(result.activity).toMatchObject({
      activityType: "forgeroom.artifact.v1",
      artifactId: "artifact_1",
      revision: 1,
      mimeType: "text/markdown",
    });
    expect(stored?.equals(fixtureContent)).toBe(true);
    expect(JSON.stringify(result.events)).not.toContain("tf_sess");
  });

  it("fails closed when sandbox has not completed", async () => {
    const result = await publishSandboxArtifactFromDiscovery(
      {
        downloadSandboxFile: async () => fixtureContent,
        publishArtifact: async () => ({
          ok: true,
          created: true,
          sha256: hashArtifactContent(fixtureContent),
          byteSize: fixtureContent.byteLength,
        }),
      },
      { ...baseInput, sandboxCommandState: "running" },
    );
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.kind).toBe("sandbox_not_ready");
  });

  it("executes publish_sandbox_artifact worker command with hash binding", async () => {
    const sha256 = hashArtifactContent(fixtureContent);
    const command = {
      schemaVersion: 1 as const,
      command_id: "cmd_1",
      name: "publish_sandbox_artifact" as const,
      payload: {
        sandbox_id: discovery.sandboxId,
        run_id: "run_1",
        run_step_id: "step_1",
        artifact_id: "artifact_1",
        expected_sandbox_state: "command_completed" as const,
        expected_artifact_revision: 0,
        next_artifact_revision: 1,
        content_hash: sha256,
        byte_size: fixtureContent.byteLength,
      },
    };

    const result = await executePublishSandboxArtifactCommand(
      {
        downloadSandboxFile: async () => fixtureContent,
        publishArtifact: async (input) => ({
          ok: true,
          created: true,
          sha256: hashArtifactContent(input.content),
          byteSize: input.content.byteLength,
        }),
        loadDiscovery: async () => baseInput,
      },
      command,
    );

    expect(result.ok).toBe(true);
  });

  it("requires sandbox download only at publication time", async () => {
    const first = await publishSandboxArtifactFromDiscovery(
      {
        downloadSandboxFile: async () => fixtureContent,
        publishArtifact: async (input) => ({
          ok: true,
          created: true,
          sha256: hashArtifactContent(input.content),
          byteSize: input.content.byteLength,
        }),
      },
      baseInput,
    );
    expect(first.ok).toBe(true);
    const second = await publishSandboxArtifactFromDiscovery(
      {
        downloadSandboxFile: async () => {
          throw new Error("sandbox torn down");
        },
        publishArtifact: async (input) => ({
          ok: true,
          created: false,
          sha256: hashArtifactContent(input.content),
          byteSize: input.content.byteLength,
        }),
      },
      baseInput,
    );
    expect(second.ok).toBe(false);
  });
});
