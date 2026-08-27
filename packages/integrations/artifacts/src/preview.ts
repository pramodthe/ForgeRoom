import { P0_MAX_ARTIFACT_BYTES, P0_MAX_IMAGE_ENCODED_BYTES, P0_MAX_IMAGE_PIXELS } from "./extraction-p0-contract";
import { isAllowedArtifactMimeType, isForbiddenArtifactMimeType } from "./validate-download";

export type ArtifactPreviewText = {
  kind: "text";
  mimeType: string;
  content: string;
  truncated: boolean;
};

export type ArtifactPreviewImage = {
  kind: "image";
  mimeType: "image/png" | "image/webp";
  width: number;
  height: number;
  altTextStatus: "missing" | "provided";
  content: Buffer;
};

export type ArtifactPreviewUnsupported = {
  kind: "unsupported";
  reason: string;
};

export type ArtifactPreviewResult =
  | ArtifactPreviewText
  | ArtifactPreviewImage
  | ArtifactPreviewUnsupported;

const HTML_SIGNATURE = /<(?:script|iframe|object|embed|svg|html|body|meta)\b/i;
const SVG_SIGNATURE = /<svg[\s>]/i;

function looksLikeHtmlOrScript(content: Buffer): boolean {
  const sample = content.subarray(0, Math.min(content.byteLength, 512)).toString("utf8");
  return HTML_SIGNATURE.test(sample) || SVG_SIGNATURE.test(sample);
}

function looksLikePolyglot(content: Buffer, declaredMime: string): boolean {
  if (declaredMime.startsWith("text/") && content.includes(0)) {
    return true;
  }
  const head = content.subarray(0, 16);
  const png = head[0] === 0x89 && head[1] === 0x50;
  const jpeg = head[0] === 0xff && head[1] === 0xd8;
  const webp =
    head[0] === 0x52 &&
    head[1] === 0x49 &&
    head[2] === 0x46 &&
    head[3] === 0x46 &&
    content.subarray(8, 12).toString("ascii") === "WEBP";
  if (declaredMime.startsWith("text/") && (png || jpeg || webp)) {
    return true;
  }
  if (declaredMime === "image/png" && !png) {
    return true;
  }
  if (declaredMime === "image/jpeg" && !jpeg) {
    return true;
  }
  if (declaredMime === "image/webp" && !webp) {
    return true;
  }
  return false;
}

export type BuildArtifactPreviewInput = {
  mimeType: string;
  content: Buffer;
  altText?: string | null;
  imageProcessor?: {
    decodeAndReencode(input: {
      content: Buffer;
      maxPixels: number;
      maxEncodedBytes: number;
      outputFormat: "png" | "webp";
    }): Promise<{ content: Buffer; width: number; height: number; mimeType: "image/png" | "image/webp" }>;
  };
};

export async function buildArtifactPreview(
  input: BuildArtifactPreviewInput,
): Promise<ArtifactPreviewResult> {
  const mimeType = input.mimeType.split(";")[0]?.trim().toLowerCase() ?? "";
  if (isForbiddenArtifactMimeType(mimeType)) {
    return { kind: "unsupported", reason: "forbidden_mime_type" };
  }
  if (!isAllowedArtifactMimeType(mimeType)) {
    return { kind: "unsupported", reason: "unsupported_mime_type" };
  }
  if (input.content.byteLength > P0_MAX_ARTIFACT_BYTES) {
    return { kind: "unsupported", reason: "content_too_large" };
  }
  if (looksLikeHtmlOrScript(input.content)) {
    return { kind: "unsupported", reason: "active_html_or_script" };
  }
  if (looksLikePolyglot(input.content, mimeType)) {
    return { kind: "unsupported", reason: "polyglot_or_mime_mismatch" };
  }

  if (mimeType.startsWith("text/")) {
    const decoded = input.content.toString("utf8");
    const maxChars = P0_MAX_ARTIFACT_BYTES;
    const truncated = decoded.length > maxChars;
    return {
      kind: "text",
      mimeType,
      content: truncated ? decoded.slice(0, maxChars) : decoded,
      truncated,
    };
  }

  if (!input.imageProcessor) {
    return { kind: "unsupported", reason: "image_processor_unavailable" };
  }
  if (input.content.byteLength > P0_MAX_IMAGE_ENCODED_BYTES) {
    return { kind: "unsupported", reason: "image_encoded_bytes_exceeded" };
  }

  try {
    const outputFormat = mimeType === "image/webp" ? "webp" : "png";
    const processed = await input.imageProcessor.decodeAndReencode({
      content: input.content,
      maxPixels: P0_MAX_IMAGE_PIXELS,
      maxEncodedBytes: P0_MAX_IMAGE_ENCODED_BYTES,
      outputFormat,
    });
    if (processed.width * processed.height > P0_MAX_IMAGE_PIXELS) {
      return { kind: "unsupported", reason: "image_pixels_exceeded" };
    }
    return {
      kind: "image",
      mimeType: processed.mimeType,
      width: processed.width,
      height: processed.height,
      altTextStatus: input.altText?.trim() ? "provided" : "missing",
      content: processed.content,
    };
  } catch {
    return { kind: "unsupported", reason: "image_decode_failed" };
  }
}

export function previewSecurityHeaders(): Record<string, string> {
  return {
    "Content-Security-Policy": "default-src 'none'; script-src 'none'; style-src 'none'; img-src 'self'",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
  };
}
