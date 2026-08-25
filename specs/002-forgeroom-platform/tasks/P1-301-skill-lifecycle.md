---
id: P1-301
title: Complete the private skill lifecycle and catalogue
status: blocked
owner: unassigned
depends_on: [P0-505, P1-101, P1-102]
requirements: [SK-006, SK-007, SK-008]
specs: [../skills.md, ../contracts/api.md, ../data-model.md, ../ux.md]
release_gate: required
---

# P1-301 — Complete the private skill lifecycle

## Outcome

Teams can create, test, version, attach, detach, rollback, import and export reviewable private skills without granting new authority.

## Acceptance criteria

- [ ] Draft, validate, test, publish, deprecate and rollback use immutable SkillVersions and revision-bound commands.
- [ ] Catalogue shows requirements, approval boundaries, source/evidence, versions, bindings, tests and recent outcomes.
- [ ] Sandbox test uses synthetic or explicitly selected data and cannot perform an unapproved external mutation.
- [ ] Attach computes the complete capability intersection and previews missing/denied requirements before rotation.
- [ ] Import/export uses a versioned manifest, content hashes, size/path rules and no executable package by default.
- [ ] Revocation/deprecation blocks new invocations while historical Run lineage remains readable.

## Verification

Run lifecycle, malformed package, secret scan, cross-workspace, capability escalation, concurrent publish/bind, rollback and invocation lineage tests.

## Evidence

- Package fixtures/hashes:
- Test report:
- Catalogue screenshots:
