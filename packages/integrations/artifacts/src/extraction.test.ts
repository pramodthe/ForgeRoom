import { describe, expect, it } from "vitest";
import {
  extractDiscoveredSandboxArtifacts,
  validateDiscoveredArtifactDownload,
  validateDiscoveredArtifactMetadata,
  validateSandboxArtifactPath,
  buildArtifactPreview,
  P0_MAX_ARTIFACT_BYTES,
} from "./index";

function testCrc32(content: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of content) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function createStoredZip(
  name: string,
  content: Buffer,
  comment = "",
  entryComment = "",
  extra: string | Buffer = "",
  gap: string | Buffer = "",
  useDescriptor = false,
): Buffer {
  const nameBytes = Buffer.from(name, "utf8");
  const commentBytes = Buffer.from(comment, "utf8");
  const entryCommentBytes = Buffer.from(entryComment, "utf8");
  const extraBytes = Buffer.isBuffer(extra) ? extra : Buffer.from(extra, "utf8");
  const gapBytes = Buffer.isBuffer(gap) ? gap : Buffer.from(gap, "utf8");
  const descriptorSize = useDescriptor ? 16 : 0;
  const local = Buffer.alloc(
    30 + nameBytes.length + extraBytes.length + content.length + descriptorSize,
  );
  const crc = testCrc32(content);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(useDescriptor ? 0x8 : 0, 6);
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(content.length, 18);
  local.writeUInt32LE(content.length, 22);
  local.writeUInt16LE(nameBytes.length, 26);
  local.writeUInt16LE(extraBytes.length, 28);
  nameBytes.copy(local, 30);
  extraBytes.copy(local, 30 + nameBytes.length);
  const dataOffset = 30 + nameBytes.length + extraBytes.length;
  content.copy(local, dataOffset);
  if (useDescriptor) {
    const descriptorOffset = dataOffset + content.length;
    local.writeUInt32LE(0x08074b50, descriptorOffset);
    local.writeUInt32LE(crc, descriptorOffset + 4);
    local.writeUInt32LE(content.length, descriptorOffset + 8);
    local.writeUInt32LE(content.length, descriptorOffset + 12);
  }

  const central = Buffer.alloc(
    46 + nameBytes.length + extraBytes.length + entryCommentBytes.length,
  );
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(useDescriptor ? 0x8 : 0, 8);
  central.writeUInt32LE(crc, 16);
  central.writeUInt32LE(content.length, 20);
  central.writeUInt32LE(content.length, 24);
  central.writeUInt16LE(nameBytes.length, 28);
  central.writeUInt16LE(extraBytes.length, 30);
  central.writeUInt16LE(entryCommentBytes.length, 32);
  nameBytes.copy(central, 46);
  extraBytes.copy(central, 46 + nameBytes.length);
  entryCommentBytes.copy(central, 46 + nameBytes.length + extraBytes.length);

  const end = Buffer.alloc(22 + commentBytes.length);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(1, 8);
  end.writeUInt16LE(1, 10);
  end.writeUInt32LE(central.length, 12);
  end.writeUInt32LE(local.length + gapBytes.length, 16);
  end.writeUInt16LE(commentBytes.length, 20);
  commentBytes.copy(end, 22);
  return Buffer.concat([local, gapBytes, central, end]);
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
    expect(
      validateDiscoveredArtifactDownload({
        discovery: {
          ...zipDiscovery,
          sandboxPath: "/home/daytona/results.bin",
          relativePath: "results.bin",
          name: "results.bin",
          mimeType: "application/octet-stream",
        },
        content: sensitiveZip,
      }),
    ).toMatchObject({ ok: false, reason: "sensitive_content" });

    const sensitiveCommentZip = createStoredZip(
      "summary.txt",
      Buffer.from("safe"),
      "aws_secret_access_key=provider-secret-value",
    );
    expect(
      validateDiscoveredArtifactDownload({ discovery: zipDiscovery, content: sensitiveCommentZip }),
    ).toMatchObject({ ok: false, reason: "sensitive_content" });
    const sensitiveEntryCommentZip = createStoredZip(
      "summary.txt",
      Buffer.from("safe"),
      "",
      "client_secret=provider-secret-value",
    );
    expect(
      validateDiscoveredArtifactDownload({
        discovery: zipDiscovery,
        content: sensitiveEntryCommentZip,
      }),
    ).toMatchObject({ ok: false, reason: "sensitive_content" });
    const sensitiveExtraZip = createStoredZip(
      "summary.txt",
      Buffer.from("safe"),
      "",
      "",
      "private_key=provider-secret-value",
    );
    expect(
      validateDiscoveredArtifactDownload({ discovery: zipDiscovery, content: sensitiveExtraZip }),
    ).toMatchObject({ ok: false, reason: "sensitive_content" });
    const unicodePath = Buffer.from(".env", "utf8");
    const unicodePathExtra = Buffer.alloc(9 + unicodePath.length);
    unicodePathExtra.writeUInt16LE(0x7075, 0);
    unicodePathExtra.writeUInt16LE(5 + unicodePath.length, 2);
    unicodePathExtra[4] = 1;
    unicodePathExtra.writeUInt32LE(testCrc32(Buffer.from("summary.txt", "utf8")), 5);
    unicodePath.copy(unicodePathExtra, 9);
    const sensitiveUnicodePathZip = createStoredZip(
      "summary.txt",
      Buffer.from("safe"),
      "",
      "",
      unicodePathExtra,
    );
    expect(
      validateDiscoveredArtifactDownload({
        discovery: zipDiscovery,
        content: sensitiveUnicodePathZip,
      }),
    ).toMatchObject({ ok: false, reason: "sensitive_content" });
    const staleUnicodePathExtra = Buffer.from(unicodePathExtra);
    staleUnicodePathExtra.writeUInt32LE(0, 5);
    const staleUnicodePathZip = createStoredZip(
      "summary.txt",
      Buffer.from("safe"),
      "",
      "",
      staleUnicodePathExtra,
    );
    expect(
      validateDiscoveredArtifactDownload({
        discovery: zipDiscovery,
        content: staleUnicodePathZip,
      }).ok,
    ).toBe(true);

    const traversalPath = Buffer.from("../x", "utf8");
    const traversalExtra = Buffer.alloc(9 + traversalPath.length);
    traversalExtra.writeUInt16LE(0x7075, 0);
    traversalExtra.writeUInt16LE(5 + traversalPath.length, 2);
    traversalExtra[4] = 1;
    traversalExtra.writeUInt32LE(testCrc32(Buffer.from("summary.txt", "utf8")), 5);
    traversalPath.copy(traversalExtra, 9);
    const traversalZip = createStoredZip(
      "summary.txt",
      Buffer.from("safe"),
      "",
      "",
      traversalExtra,
    );
    expect(
      validateDiscoveredArtifactDownload({ discovery: zipDiscovery, content: traversalZip }),
    ).toMatchObject({ ok: false, reason: "archive_invalid" });

    const gapZip = createStoredZip(
      "summary.txt",
      Buffer.from("safe"),
      "",
      "",
      "",
      "access_token=provider-secret-value",
    );
    expect(
      validateDiscoveredArtifactDownload({ discovery: zipDiscovery, content: gapZip }),
    ).toMatchObject({ ok: false, reason: "archive_invalid" });

    const descriptorZip = createStoredZip("summary.txt", Buffer.from("safe"), "", "", "", "", true);
    expect(
      validateDiscoveredArtifactDownload({ discovery: zipDiscovery, content: descriptorZip }).ok,
    ).toBe(true);
    const invalidDescriptorZip = Buffer.from(descriptorZip);
    const descriptorOffset = 30 + Buffer.byteLength("summary.txt") + Buffer.byteLength("safe");
    invalidDescriptorZip.writeUInt32LE(0, descriptorOffset + 4);
    expect(
      validateDiscoveredArtifactDownload({
        discovery: zipDiscovery,
        content: invalidDescriptorZip,
      }),
    ).toMatchObject({ ok: false, reason: "archive_invalid" });

    const symlinkZip = createStoredZip("safe-link", Buffer.from("../../.env"));
    const symlinkEndOffset = symlinkZip.length - 22;
    const symlinkCentralOffset = symlinkZip.readUInt32LE(symlinkEndOffset + 16);
    symlinkZip.writeUInt16LE(3 << 8, symlinkCentralOffset + 4);
    symlinkZip.writeUInt32LE((0xa000 << 16) >>> 0, symlinkCentralOffset + 38);
    expect(
      validateDiscoveredArtifactDownload({ discovery: zipDiscovery, content: symlinkZip }),
    ).toMatchObject({ ok: false, reason: "archive_invalid" });

    const mismatchedHeaderZip = createStoredZip("summary.txt", Buffer.from("safe"));
    mismatchedHeaderZip.writeUInt16LE(8, 8);
    expect(
      validateDiscoveredArtifactDownload({
        discovery: zipDiscovery,
        content: mismatchedHeaderZip,
      }),
    ).toMatchObject({ ok: false, reason: "archive_invalid" });

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
