---
id: P3-105
title: Stabilize public APIs, events, SDKs and LTS compatibility
status: blocked
owner: unassigned
depends_on: [P3-000, P3-104]
requirements: [CN-012, PLAT-008, PLAT-009, OSS-007, OSS-008, OSS-010]
specs: [../contracts/api.md, ../contracts/events.md, ../open-source.md]
release_gate: required
---

# P3-105 — Stabilize public contracts

## Outcome

Clients and extensions have documented version negotiation, compatibility, deprecation and migration behavior backed by executable conformance suites.

## Acceptance criteria

- [ ] Public HTTP, event, export/import and extension schemas have semantic compatibility rules and generated reference docs.
- [ ] Additive/behavioral/breaking changes are classified and enforced in CI against released fixtures.
- [ ] Version negotiation and unsupported-version errors are deterministic and safe.
- [ ] Deprecations include telemetry-free local detection, replacement path, timeline and migration tooling.
- [ ] LTS branches, security-fix policy and supported upgrade paths are published.
- [ ] Official SDKs/examples pass the same conformance server and never rely on internal endpoints.

## Verification

Run schema/behavior diff, previous-client, previous-server where supported, export/import and extension compatibility matrices.

## Evidence

- Contract baselines:
- Compatibility reports:
