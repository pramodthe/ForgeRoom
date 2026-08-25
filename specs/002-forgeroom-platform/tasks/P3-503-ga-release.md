---
id: P3-503
title: Release ForgeRoom 1.0 GA
status: blocked
owner: unassigned
depends_on: [P3-502]
requirements: [PLAT-001, PLAT-006, PLAT-007, PLAT-009, PLAT-010, OSS-001, OSS-010]
specs: [../roadmap.md#10-general-availability, ../checklists/1.0-ga.md, ../STATUS.md, ../open-source.md]
release_gate: required
---

# P3-503 — Release 1.0 GA

## Outcome

The open-source core and supported hosted deployment ship with stable contracts, recovery evidence, governance and a truthful support boundary.

## Acceptance criteria

- [ ] Every required P3 task and GA exit gate is complete; no unresolved critical/high finding remains.
- [ ] Signed release artifacts, SBOM/provenance, migrations, conformance fixtures and checksums are published.
- [ ] Documentation covers install, architecture, security, privacy, APIs/events/SDK, backup/restore, upgrade, export and incident reporting.
- [ ] LTS/deprecation/vulnerability/contributor governance and support boundaries are public.
- [ ] RPO/RTO and performance budgets pass in every supported topology.
- [ ] A self-host workspace exports all user-owned data without contacting hosted services.
- [ ] Release notes distinguish shipped, experimental, enterprise/hosted and excluded capabilities without parity overclaim.

## Verification

Run the final release checklist from clean artifacts and obtain product, engineering, security and OSS-governance sign-off.

## Evidence

- Release/tag:
- Final matrix:
- Sign-offs:
