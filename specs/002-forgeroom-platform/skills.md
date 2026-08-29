# Skill lifecycle specification

## Purpose

A skill is a reusable, versioned procedure that teaches a coworker how to perform a task. It answers **how**; a workflow answers **when, with which inputs, what next, and how failures are handled**.

TrueForge executes git-backed `SKILL.md` packages inside a sandbox-enabled agent. ForgeRoom owns discovery, review, versioning, permissions, tests, attachment, audit, and export.

## Objects

| Object | Purpose |
| --- | --- |
| `SkillDefinition` | Stable workspace-scoped identity, name, owner, visibility, tags, current version |
| `SkillVersion` | Immutable package content, manifest, hashes, inputs/outputs/tools/approvals, compatibility, provenance |
| `SkillDraft` | Editable/reviewable candidate before publication |
| `SkillBinding` | Exact skill version enabled for a coworker version |
| `SkillTestRun` | Safe fixture, expected assertions, actual evidence, runtime/tool versions, result |
| `SkillPackage` | Exportable directory containing `SKILL.md`, manifest, optional references/scripts/assets/tests within limits |

## Save a successful run as a skill

1. A human chooses **Save as skill** from a completed or accepted Run/RunStep.
2. The system extracts only allowed evidence: user request, normalized tool names/results, accepted record/artifact references, corrections, validation outcome, and approval boundaries. It excludes credentials, raw private reasoning, provider signatures, transient auth, unrelated messages, and unredacted tool bodies.
3. A no-external-tools drafting path produces a structured `SkillDraftV1`.
4. The server resolves required tools, connection classes, components, knowledge/record inputs, sandbox needs, and approval effects against the workspace catalogue.
5. The user reviews: when to use, required inputs/access, ordered procedure, decisions, validation, failure behavior, output contract, approval boundary, provenance, and package diff.
6. Confirmation publishes immutable version `1`, optionally attaches it to selected coworkers only within their existing authority, and rotates affected TrueForge sessions.
7. A safe test run is required before a version may be used by an unattended workflow.

Saving the result does not save the user's data values as instructions. Examples are synthetic/redacted or remain source references protected by their original permissions.

## Manifest

Every version has `SkillManifestV1`:

```ts
type SkillManifestV1 = {
  name: string;
  version: string;
  description: string;
  whenToUse: string[];
  inputSchema: JsonSchema;
  outputSchema: JsonSchema;
  requiredToolSlugs: string[];
  requiredEffects: Array<"read" | "write" | "destructive">;
  requiredComponentVersions: string[];
  requiredRecordCapabilities: string[];
  requiredKnowledgeScopes: string[];
  sandbox: { required: boolean; network: "none" | "public_only" | "policy" };
  approvalRules: Array<{ effect: string; rule: string }>;
  validation: Array<{ id: string; assertion: string }>;
  failurePolicy: { noData: string; staleData: string; partial: string };
  compatibility: { trueforge: string; forgeroom: string };
};
```

The canonical manifest and every package file are content-addressed. The UI never trusts a package-declared permission; it compares requirements with current server-held grants.

## Lifecycle

```text
draft → validating → private_ready → published
  ↘ invalid          ↘ deprecated → revoked
```

- Drafts can change; publication always creates a new immutable version.
- `private_ready` is usable only within its workspace.
- `published` may be shared according to package visibility and trust policy.
- `deprecated` remains usable for pinned bindings but cannot be newly attached by default.
- `revoked` cannot start a new run; affected coworker/workflow bindings are blocked until replaced.

## Requirements

| ID | Contract | First release |
| --- | --- | --- |
| SK-001 | A completed successful Run can become a reviewable SkillDraft with source Run/RunStep IDs and content hashes. | 0.1 |
| SK-002 | A confirmed immutable SkillVersion records exact inputs, outputs, steps, validation, failures, required tools/components/data and approval boundaries. | 0.1 |
| SK-003 | Draft/publish excludes credentials, private reasoning, signatures, transient answers, unrelated history, unredacted tool bodies and unreviewed executable package content. | 0.1 |
| SK-004 | Attachment cannot expand coworker authority; missing requirements display a diff and block attachment/use. | 0.1 |
| SK-005 | Attaching or detaching a skill creates a coworker runtime revision and safe session rotation. | 0.1 |
| SK-006 | Users can browse, inspect, enable/disable, test, version, compare, upgrade, deprecate, revoke, roll back, import, export, and archive skills; every binding-changing lifecycle action rotates affected runtimes safely. | 0.2 |
| SK-007 | Test runs pin skill/runtime/tool/source versions, use safe fixtures, assert output and approval stops, and retain redacted evidence. | 0.2 |
| SK-008 | A skill version used by a run or workflow is immutable and retained by reference even after a newer version publishes. | 0.2 |
| SK-009 | Unattended workflows require a passing compatible test for the exact skill version and current policy/tool descriptor set. | 0.3 |
| SK-010 | Shared packages declare provenance, license, integrity, publisher, compatibility, permissions, migrations, and vulnerability status. | 1.0 |

## Package safety

- `SKILL.md` instruction text is untrusted content and cannot override system policy.
- Executable scripts are separately declared, reviewed, hashed, sandbox-only, and limited by file type, size, command, network, secret, and output policy.
- Symlinks, path traversal, device files, binaries, hidden credentials, package-manager install hooks, and undeclared network dependencies fail import.
- References and assets inherit package visibility; external URLs are metadata until explicitly ingested through knowledge policy.
- Imported packages start disabled. Signature/reputation never replaces local permission review.

## Version and binding rules

- Semantic version labels are presentation; the immutable database ID/hash is authoritative.
- Updating a binding requires an explicit diff of instructions, permissions, schemas, scripts, tests, and approval rules.
- Coworker versions pin skill versions; workflows additionally pin the coworker/runtime revision.
- Removing a required tool blocks use rather than asking TrueForge to improvise.
- Rollback creates a new binding revision and session rotation; historical runs keep original hashes.

## Acceptance scenarios

- Save an accepted research run, review a draft, publish, attach to one coworker, rotate its session, and run it again with different safe input.
- A skill requiring a write tool cannot attach to a read-only coworker and clearly names the missing effect without exposing account secrets.
- Package import containing traversal, executable install hook, or secret pattern fails before persistence/publication.
- Revoking a skill blocks a scheduled run before TrueForge invocation and alerts the workflow owner.
- A historical run continues to show the exact old skill version and validation evidence after upgrade.
