import { P0_SANDBOX_ARTIFACT_ROOT } from "./extraction-p0-contract";

export type SandboxPathValidationResult =
  | { ok: true; normalizedPath: string; relativePath: string }
  | { ok: false; reason: "empty" | "traversal" | "outside_root" | "absolute_outside_root" };

function collapseSlashes(value: string): string {
  return value.replace(/\/+/g, "/");
}

/**
 * Normalize and confine a sandbox file path to the P0 Daytona root.
 * Accepts relative paths under the fixture root or absolute paths under `/home/daytona/`.
 */
export function validateSandboxArtifactPath(inputPath: string): SandboxPathValidationResult {
  const trimmed = inputPath.trim();
  if (!trimmed) {
    return { ok: false, reason: "empty" };
  }
  if (trimmed.includes("\\") || trimmed.includes("\0")) {
    return { ok: false, reason: "traversal" };
  }

  const segments = collapseSlashes(trimmed).split("/").filter(Boolean);
  if (segments.some((segment) => segment === "..")) {
    return { ok: false, reason: "traversal" };
  }

  const root = P0_SANDBOX_ARTIFACT_ROOT.replace(/\/+$/, "");
  let normalized: string;
  if (trimmed.startsWith("/")) {
    normalized = collapseSlashes(trimmed);
    if (normalized !== root && !normalized.startsWith(`${root}/`)) {
      return { ok: false, reason: "outside_root" };
    }
  } else {
    normalized = `${root}/${segments.join("/")}`;
  }

  if (!normalized.startsWith(`${root}/`) && normalized !== root) {
    return { ok: false, reason: "absolute_outside_root" };
  }

  const relativePath = normalized.slice(root.length + 1);
  if (!relativePath) {
    return { ok: false, reason: "empty" };
  }

  return { ok: true, normalizedPath: normalized, relativePath };
}
