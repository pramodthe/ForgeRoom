---
id: P0-318
title: Save a successful Run as a reviewed private skill
status: in_progress
owner: unassigned
depends_on: [P0-104, P0-106, P0-206, P0-208, P0-403]
requirements: [SK-001, SK-002, SK-003, SK-004, SK-005]
specs: [../spec.md#s7-save-successful-work-as-a-skill, ../data-model.md#private-skills, ../contracts/api.md#skills, ../../002-forgeroom-platform/skills.md]
adrs: [ADR-001, ADR-002]
touches: [packages/contracts, packages/domain, packages/db, packages/integrations/trueforge, apps/api, apps/worker, apps/web]
---

# P0-318 — Save a successful Run as a reviewed private skill

## Outcome

The owner can turn one completed Run into an immutable instruction-only TrueForge skill, review its boundaries, and attach its pinned version to one coworker.

## Scope

- Completed Run/RunStep evidence extraction and `SkillDraftV1` generation.
- Review/edit, private Skill/SkillVersion publication and content-addressed `SKILL.md` materialization.
- Exact requirements preview, one-coworker binding and session rotation. Invocation lifecycle and regression testing begin in 0.2.

## Non-goals

- Public catalogue, imported packages, scripts/references/assets, marketplace, broad version-history UI, unattended workflows or skill-created authority.

## Acceptance criteria

- [x] Only a completed successful/accepted application Run can start a draft; source Run/RunStep IDs and normalized evidence hashes are retained. *(slice 1: `POST /api/runs/:runId/skill-drafts` + `GET /api/skill-drafts/:draftId`; completed-run gate, `source_content_hash` + `draft_hash`)*
- [ ] Draft generation runs through a dedicated structured, no-external-tools path with no inherited coworker tools, MCP/Composio/external-application provider calls or mutation authority; pinned model inference remains allowed under its retention/redaction policy.
- [x] Draft contains when-to-use, inputs, ordered procedure, decision rules, validation, expected output, failure/no-data behavior, exact required tools/components/data and approval boundary. *(deterministic structured builder from normalized run evidence in slice 1)*
- [x] Credentials, raw private reasoning, provider signatures, transient private answers, unrelated messages and unredacted tool bodies never enter draft/package/event/log/UI. *(forbidden-key scan on evidence payloads; only normalized redacted run events ingested)*
- [x] Explicit confirmation publishes one immutable private version with manifest/content hashes; edits require a new draft/version. *(slice 2: `POST /api/skill-drafts/:draftId/publish`; hash-gated confirm, `skill_versions` draft→published, `skill.version_published` event, idempotent `skill_draft.publish`)*
- [ ] Attachment intersects all requirements with existing coworker/channel/account grants and cannot grant or substitute anything.
- [ ] Attach/detach rotates the exact affected sessions; live TrueForge manifest pins the expected skill version/hash and requires sandbox as documented.
- [x] Duplicate publish/attach requests are idempotent. *(create via `skill_draft.create`; publish via `skill_draft.publish`; attach deferred)*

## Verification

Run extraction/redaction/secret fixtures, manifest/hash/schema tests, an asserted zero inherited-tool/MCP/Composio/external-application-provider-call drafting test, missing-capability and cross-workspace authorization tests, publish/attach idempotency and session-rotation integration.

## Evidence

- Files changed:
  - `packages/domain/src/skills/{draft,publish}.*`
  - `packages/db/src/skill-drafts.ts`
  - `apps/api/src/skills/{drafts,publish,markdown-storage}.*`
  - `apps/api/src/workspace/service.ts`, `routes.ts`
  - `packages/contracts/src/skills.ts`
- Commands and results:
  - `pnpm --filter @forgeroom/domain test`
  - `pnpm --filter @forgeroom/db exec vitest run src/skill-drafts.integration.test.ts`
  - `pnpm --filter @forgeroom/api exec vitest run src/skills/drafts.integration.test.ts src/skills/publish.integration.test.ts`
  - `pnpm lint && pnpm typecheck`
- Reviewed skill manifest/package hash: publish integration test asserts `manifest_hash` + `content_hash` round-trip
- Redacted attachment/session-rotation trace: deferred to attach slice

## Work log

- 2026-08-29 — Slice 1 (merged #57): create/get skill draft from completed run.
- 2026-08-29 — Slice 2: publish skill draft to immutable version 1 with hash confirmation and optional `SKILL.md` materialization.

## Handoff

- Outcome:
- Open risks:
- Follow-up tasks: P1 skill catalogue/test/import/export
