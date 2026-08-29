import { describe, expect, it } from "vitest";
import {
  extractDiscoveredSandboxArtifacts,
  validateDiscoveredArtifactDownload,
  validateDiscoveredArtifactMetadata,
  validateSandboxArtifactPath,
  buildArtifactPreview,
  P0_MAX_ARTIFACT_BYTES,
} from "./index";

function createStoredZip(name: string, content: Buffer, comment = ""): Buffer {
  const nameBytes = Buffer.from(name, "utf8");
  const commentBytes = Buffer.from(comment, "utf8");
  const local = Buffer.alloc(30 + nameBytes.length + content.length);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt32LE(content.length, 18);
  local.writeUInt32LE(content.length, 22);
  local.writeUInt16LE(nameBytes.length, 26);
  nameBytes.copy(local, 30);
  content.copy(local, 30 + nameBytes.length);

  const central = Buffer.alloc(46 + nameBytes.length);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt32LE(content.length, 20);
  central.writeUInt32LE(content.length, 24);
  central.writeUInt16LE(nameBytes.length, 28);
  nameBytes.copy(central, 46);

  const end = Buffer.alloc(22 + commentBytes.length);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(1, 8);
  end.writeUInt16LE(1, 10);
  end.writeUInt32LE(central.length, 12);
  end.writeUInt32LE(local.length, 16);
  end.writeUInt16LE(commentBytes.length, 20);
  commentBytes.copy(end, 22);
  return Buffer.concat([local, central, end]);
}

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

  it("discovers canonical artifact paths without dropping unknown extensions", () => {
    const discovered = extractDiscoveredSandboxArtifacts([
      { type: "sandbox.created", id: "e1", sandbox_id: "sb_abc123" },
      {
        type: "model.message",
        id: "e2",
        content:
          "```sandbox_artifacts\n[Report](/home/daytona/report.pdf)\n[Data](/home/daytona/data.json)\n[Bundle](/home/daytona/bundle.zip)\n[Output](/home/daytona/output)\n```",
      },
    ]);
    expect(discovered.map(({ relativePath, mimeType }) => ({ relativePath, mimeType }))).toEqual([
      { relativePath: "report.pdf", mimeType: "application/pdf" },
      { relativePath: "data.json", mimeType: "application/json" },
      { relativePath: "bundle.zip", mimeType: "application/zip" },
      { relativePath: "output", mimeType: "application/octet-stream" },
    ]);
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

    expect(
      validateDiscoveredArtifactMetadata({
        ...allowed,
        sandboxPath: "/home/daytona/.env",
        relativePath: ".env",
      }),
    ).toMatchObject({ ok: false, reason: "sensitive_path" });
    expect(
      validateDiscoveredArtifactMetadata({
        ...allowed,
        sandboxPath: "/home/daytona/tool-output-summary.md",
        relativePath: "tool-output-summary.md",
      }).ok,
    ).toBe(true);
    const rawToolPayload = Buffer.from('{"access_token":"provider-secret-value"}', "utf8");
    expect(
      validateDiscoveredArtifactDownload({
        discovery: { ...allowed, declaredByteSize: rawToolPayload.byteLength },
        content: rawToolPayload,
      }),
    ).toMatchObject({ ok: false, reason: "sensitive_content" });
  });

  it("screens ZIP entries and accepts a real terminator signature inside the ZIP comment", () => {
    const zipDiscovery = {
      sandboxId: "sb_1",
      sandboxPath: "/home/daytona/results.zip",
      relativePath: "results.zip",
      name: "results.zip",
      mimeType: "application/zip",
      declaredByteSize: null,
      trueforgeEventId: "evt_1",
      sourceWireType: "model.message",
    } as const;
    const sensitiveZip = createStoredZip(
      "report.json",
      Buffer.from('{"private_key":"-----BEGIN PRIVATE KEY-----"}', "utf8"),
    );
    expect(
      validateDiscoveredArtifactDownload({ discovery: zipDiscovery, content: sensitiveZip }),
    ).toMatchObject({ ok: false, reason: "sensitive_content" });

    const nestedZip = createStoredZip(
      "inner.zip",
      createStoredZip("safe.txt", Buffer.from("safe")),
    );
    expect(
      validateDiscoveredArtifactDownload({ discovery: zipDiscovery, content: nestedZip }),
    ).toMatchObject({ ok: false, reason: "archive_invalid" });

    expect(
      validateDiscoveredArtifactDownload({
        discovery: zipDiscovery,
        content: Buffer.from("not a ZIP", "utf8"),
      }),
    ).toMatchObject({ ok: false, reason: "archive_invalid" });

    const oversizedClaimZip = createStoredZip("summary.txt", Buffer.from("safe"));
    const endOffset = oversizedClaimZip.length - 22;
    const centralOffset = oversizedClaimZip.readUInt32LE(endOffset + 16);
    oversizedClaimZip.writeUInt32LE(P0_MAX_ARTIFACT_BYTES + 1, centralOffset + 24);
    expect(
      validateDiscoveredArtifactDownload({ discovery: zipDiscovery, content: oversizedClaimZip }),
    ).toMatchObject({ ok: false, reason: "archive_invalid" });

    const safeZip = createStoredZip(
      "summary.txt",
      Buffer.from("safe"),
      `note PK\u0005\u0006 ${"x".repeat(30)}`,
    );
    expect(
      validateDiscoveredArtifactDownload({ discovery: zipDiscovery, content: safeZip }).ok,
    ).toBe(true);
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

  it("retains download-only formats without attempting an executable preview", async () => {
    const pdf = await buildArtifactPreview({
      mimeType: "application/pdf",
      content: Buffer.from("%PDF-1.7", "utf8"),
    });
    expect(pdf).toEqual({ kind: "unsupported", reason: "unsupported_preview_type" });
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
