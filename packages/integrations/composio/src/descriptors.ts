import { createHash } from "node:crypto";
import { P0_COMPOSIO_DIRECT_TOOLS } from "./p0-contract";
import type { P0ComposioDirectToolSlug } from "./types";

/**
 * Checked-in observed descriptor hashes from
 * `provider-fixtures/composio/descriptors/manifest.json`.
 * Digests are sha256 of the raw GET /api/v3.1/tools/{slug} response body.
 */
export const P0_COMPOSIO_DESCRIPTOR_HASHES = {
  GITHUB_GET_AN_ISSUE: "c5b2dac56410d0576d400324aee0cd1d53a5ebc167f1a6b6f3066822c827ba1e",
  GITHUB_ADD_LABELS_TO_AN_ISSUE: "ff40ac2f1e6015f6aa280e2056790551ba651b6a755651c130af181846a02855",
  GITHUB_REMOVE_A_LABEL_FROM_AN_ISSUE:
    "b6c618fc6702ea82bffe53605ed5ef93c5cf41ff7a02fe24d7c9e034a59d6bbb",
} as const satisfies Record<P0ComposioDirectToolSlug, string>;

export type ObservedToolDescriptor = {
  toolSlug: string;
  /** Raw response body bytes hashed for comparison. */
  body: string;
  sha256: string;
};

export function hashComposioToolDescriptorBody(body: string): string {
  return createHash("sha256").update(body, "utf8").digest("hex");
}

export function expectedDescriptorHash(toolSlug: string): string | null {
  if (toolSlug in P0_COMPOSIO_DESCRIPTOR_HASHES) {
    return P0_COMPOSIO_DESCRIPTOR_HASHES[toolSlug as P0ComposioDirectToolSlug];
  }
  return null;
}

export type DescriptorDriftFinding =
  | { kind: "missing_tool"; toolSlug: string }
  | { kind: "added_tool"; toolSlug: string }
  | { kind: "schema_change"; toolSlug: string; expected: string; observed: string }
  | { kind: "unapproved_surface"; toolSlug: string };

/**
 * Compare observed Composio tool descriptor hashes to the checked-in manifest.
 * Fail-closed: any missing, added, or changed surface is a finding.
 */
export function compareDescriptorHashes(
  observed: ReadonlyArray<Pick<ObservedToolDescriptor, "toolSlug" | "sha256">>,
): DescriptorDriftFinding[] {
  const findings: DescriptorDriftFinding[] = [];
  const observedBySlug = new Map(observed.map((row) => [row.toolSlug, row.sha256]));

  for (const required of P0_COMPOSIO_DIRECT_TOOLS) {
    const hash = observedBySlug.get(required);
    if (!hash) {
      findings.push({ kind: "missing_tool", toolSlug: required });
      continue;
    }
    const expected = P0_COMPOSIO_DESCRIPTOR_HASHES[required];
    if (hash !== expected) {
      findings.push({
        kind: "schema_change",
        toolSlug: required,
        expected,
        observed: hash,
      });
    }
  }

  for (const slug of observedBySlug.keys()) {
    if (!(P0_COMPOSIO_DIRECT_TOOLS as readonly string[]).includes(slug)) {
      findings.push({ kind: "added_tool", toolSlug: slug });
      findings.push({ kind: "unapproved_surface", toolSlug: slug });
    }
  }

  return findings;
}
