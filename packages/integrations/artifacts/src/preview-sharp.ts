import sharp from "sharp";

export function createSharpImageProcessor() {
  return {
    async decodeAndReencode(input: {
      content: Buffer;
      maxPixels: number;
      maxEncodedBytes: number;
      outputFormat: "png" | "webp";
    }) {
      const image = sharp(input.content, {
        failOn: "error",
        animated: false,
        limitInputPixels: input.maxPixels,
      });
      const metadata = await image.metadata();
      const width = metadata.width ?? 0;
      const height = metadata.height ?? 0;
      if (width <= 0 || height <= 0) {
        throw new Error("invalid image dimensions");
      }
      if (width * height > input.maxPixels) {
        throw new Error("image pixel budget exceeded");
      }

      const encoded =
        input.outputFormat === "webp"
          ? await image.webp().toBuffer()
          : await image.png().toBuffer();
      if (encoded.byteLength > input.maxEncodedBytes) {
        throw new Error("re-encoded image exceeds byte budget");
      }

      return {
        content: encoded,
        width,
        height,
        mimeType: input.outputFormat === "webp" ? ("image/webp" as const) : ("image/png" as const),
      };
    },
  };
}
