import { describe, expect, it } from "vitest";
import {
  extractDiscoveredSandboxArtifacts,
  validateDiscoveredArtifactDownload,
  validateDiscoveredArtifactMetadata,
  validateSandboxArtifactPath,
  buildArtifactPreview,
  P0_MAX_ARTIFACT_BYTES,
} from "./index";

describe("P0-312 sandbox artifact discovery", () => {
  it("reads canonical fenced sandbox_artifacts links from model.message", () => {
    const wire = [
      { type: "sandbox.created", id: "e1", sandbox_id: "sb_abc123" },
      {
        type: "model.message",
        id: "e2",
        content:
          "Completed.\n```sandbox_artifacts\n[Demo records](/home/daytona/forgeroom-p0-probe-sample.md)\n```",
      },
    ];
    const discovered = extractDiscoveredSandboxArtifacts(wire);
    expect(discovered).toHaveLength(1);
    expect(discovered[0]).toMatchObject({
      sandboxId: "sb_abc123",
      relativePath: "forgeroom-p0-probe-sample.md",
      mimeType: "text/markdown",
      name: "Demo records",
      declaredByteSize: null,
      sourceWireType: "model.message",
    });
  });

  it("rejects invented sandbox.file and sandbox_files JSON shapes", () => {
    const discovered = extractDiscoveredSandboxArtifacts([
      { type: "sandbox.created", id: "e1", sandbox_id: "sb_abc123" },
      { type: "sandbox.file", id: "e2", path: "/home/daytona/fake.md" },
      {
        type: "model.message",
        id: "e3",
        content: JSON.stringify({ sandbox_files: [{ path: "/home/daytona/fake.md" }] }),
      },
    ]);
    expect(discovered).toEqual([]);
  });
});

describe("P0-312 sandbox path validation", () => {
  it("rejects traversal and paths outside /home/daytona", () => {
    expect(validateSandboxArtifactPath("../etc/passwd").ok).toBe(false);
    expect(validateSandboxArtifactPath("/tmp/evil.md").ok).toBe(false);
    expect(validateSandboxArtifactPath("forgeroom-p0-probe-sample.md").ok).toBe(true);
  });
});

describe("P0-312 download validation", () => {
  it("rejects oversized, bad MIME and size mismatch before durable copy", () => {
    const discovery = {
      sandboxId: "sb_1",
      sandboxPath: "/home/daytona/sample.md",
      relativePath: "sample.md",
      name: "sample.md",
      mimeType: "text/html",
      declaredByteSize: 4,
      trueforgeEventId: "evt_1",
      sourceWireType: "model.message",
    } as const;
    expect(validateDiscoveredArtifactMetadata(discovery).ok).toBe(false);

    const allowed = {
      ...discovery,
      mimeType: "text/markdown",
      declaredByteSize: 3,
    };
    expect(validateDiscoveredArtifactMetadata(allowed).ok).toBe(true);
    expect(
      validateDiscoveredArtifactDownload({
        discovery: allowed,
        content: Buffer.from("abc", "utf8"),
      }).ok,
    ).toBe(true);
    expect(
      validateDiscoveredArtifactDownload({
        discovery: allowed,
        content: Buffer.from("abcd", "utf8"),
      }),
    ).toMatchObject({ ok: false, reason: "size_mismatch" });

    const oversized = Buffer.alloc(P0_MAX_ARTIFACT_BYTES + 1, 1);
    expect(
      validateDiscoveredArtifactDownload({
        discovery: { ...allowed, declaredByteSize: oversized.byteLength },
        content: oversized,
      }),
    ).toMatchObject({ ok: false, reason: "size_exceeded" });
  });
});

describe("P0-312 safe preview", () => {
  it("returns text preview for markdown without executable HTML", async () => {
    const preview = await buildArtifactPreview({
      mimeType: "text/markdown",
      content: Buffer.from("# hello\n", "utf8"),
    });
    expect(preview).toMatchObject({ kind: "text", mimeType: "text/markdown" });
  });

  it("rejects active HTML and SVG before preview", async () => {
    const html = await buildArtifactPreview({
      mimeType: "text/plain",
      content: Buffer.from("<script>alert(1)</script>", "utf8"),
    });
    expect(html).toMatchObject({ kind: "unsupported", reason: "active_html_or_script" });

    const svg = await buildArtifactPreview({
      mimeType: "image/png",
      content: Buffer.from('<svg onload="alert(1)"></svg>', "utf8"),
    });
    expect(svg.kind).toBe("unsupported");
  });

  it("re-encodes raster images through the processor and records alt-text status", async () => {
    const preview = await buildArtifactPreview({
      mimeType: "image/png",
      content: Buffer.from([0x89, 0x50, 0x4e, 0x47]),
      altText: "chart",
      imageProcessor: {
        async decodeAndReencode() {
          return {
            content: Buffer.from("safe-image"),
            width: 100,
            height: 50,
            mimeType: "image/png" as const,
          };
        },
      },
    });
    expect(preview).toMatchObject({
      kind: "image",
      width: 100,
      height: 50,
      altTextStatus: "provided",
    });
  });
});
