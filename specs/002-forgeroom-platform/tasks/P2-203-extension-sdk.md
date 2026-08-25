---
id: P2-203
title: Publish the team-beta extension SDK
status: blocked
owner: unassigned
depends_on: [P1-301, P1-302, P2-000]
requirements: [PLAT-009, OSS-009, OSS-010, PSEC-008]
specs: [../open-source.md, ../architecture.md, ../security.md]
release_gate: required
---

# P2-203 — Publish extension SDK

## Outcome

Developers can build versioned skills, record schemas, controlled components, connector policy packs and triggers through documented capabilities—not internal database access.

## Acceptance criteria

- [ ] Manifest, compatibility range, permissions, package hashes, lifecycle hooks and test harness are versioned.
- [ ] Extension kinds use narrow APIs and cannot access arbitrary workspace data, credentials, network or filesystem by default.
- [ ] Local install previews code origin, requested capabilities and affected runtime rotations before confirmation.
- [ ] Disable/uninstall/revoke is safe, auditable and leaves historical records renderable through fallbacks.
- [ ] SDK includes schemas, examples, conformance fixtures and a compatibility test command.
- [ ] No public registry trust is implied before P3 signing/distribution work.

## Verification

Run valid/invalid packages, capability escalation, dependency confusion/path traversal, revoke, compatibility and sample-extension E2E tests.

## Evidence

- SDK/package:
- Conformance report:
- Examples:
