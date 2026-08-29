import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { buildArtifactPreview, createSharpImageProcessor } from "./index";

async function png(width = 2, height = 2): Promise<Buffer> {
  return sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: 15, g: 100, b: 200, alpha: 1 },
    },
  })
    .png({ compressionLevel: 9 })
    .toBuffer();
}

describe("Sharp artifact preview security", () => {
  it("enforces the decoded pixel/decompression budget", async () => {
    const compressed = await png(64, 64);
    expect(compressed.byteLength).toBeLessThan(64 * 64 * 4);

    await expect(
      createSharpImageProcessor().decodeAndReencode({
        content: compressed,
        maxPixels: 64 * 64 - 1,
        maxEncodedBytes: 1_000_000,
        outputFormat: "png",
      }),
    ).rejects.toThrow();
  });

  it("enforces the re-encoded byte budget", async () => {
    await expect(
      createSharpImageProcessor().decodeAndReencode({
        content: await png(),
        maxPixels: 100,
        maxEncodedBytes: 1,
        outputFormat: "png",
      }),
    ).rejects.toThrow(/byte budget/);
  });

  it("strips input metadata during decode and re-encode", async () => {
    const withExif = await sharp(await png())
      .withMetadata({ orientation: 6, density: 300 })
      .png()
      .toBuffer();
    expect((await sharp(withExif).metadata()).exif).toBeDefined();

    const preview = await buildArtifactPreview({
      mimeType: "image/png",
      content: withExif,
      altText: "Blue test square",
      imageProcessor: createSharpImageProcessor(),
    });
    expect(preview).toMatchObject({
      kind: "image",
      mimeType: "image/png",
      width: 2,
      height: 2,
      altTextStatus: "provided",
    });
    if (preview.kind !== "image") {
      throw new Error("expected a safe image preview");
    }
    const outputMetadata = await sharp(preview.content).metadata();
    expect(outputMetadata.exif).toBeUndefined();
    expect(outputMetadata.icc).toBeUndefined();
    expect(outputMetadata.xmp).toBeUndefined();
  });

  it("rejects MIME mismatches, SVG, image/text polyglots, and malformed raster input", async () => {
    const validPng = await png();
    await expect(
      buildArtifactPreview({
        mimeType: "image/jpeg",
        content: validPng,
        imageProcessor: createSharpImageProcessor(),
      }),
    ).resolves.toMatchObject({ kind: "unsupported", reason: "polyglot_or_mime_mismatch" });

    await expect(
      buildArtifactPreview({
        mimeType: "image/png",
        content: Buffer.from('<svg onload="alert(1)"></svg>', "utf8"),
        imageProcessor: createSharpImageProcessor(),
      }),
    ).resolves.toMatchObject({ kind: "unsupported", reason: "active_html_or_script" });

    await expect(
      buildArtifactPreview({ mimeType: "text/plain", content: validPng }),
    ).resolves.toMatchObject({ kind: "unsupported", reason: "polyglot_or_mime_mismatch" });

    await expect(
      buildArtifactPreview({
        mimeType: "image/png",
        content: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00]),
        imageProcessor: createSharpImageProcessor(),
      }),
    ).resolves.toMatchObject({ kind: "unsupported", reason: "image_decode_failed" });
  });
});
