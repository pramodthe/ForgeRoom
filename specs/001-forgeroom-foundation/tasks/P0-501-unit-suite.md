---
id: P0-501
title: Complete unit-test suite
status: blocked
owner: unassigned
depends_on: [P0-108, P0-109, P0-212, P0-213, P0-303, P0-306, P0-312, P0-314, P0-315, P0-316, P0-318]
requirements: [CH-004, AG-010, TR-001, SK-001, AGUI-004, AGUI-006, GUI-002, GUI-004, TL-006, AP-005, ME-001, AU-001]
specs: [../test-plan.md#unit]
adrs: [ADR-001, ADR-002, ADR-003, ADR-004, ADR-005, ADR-006, ADR-007]
touches: [all-test-packages]
---

# P0-501 — Complete unit-test suite

## Outcome

All unit behaviors required by the canonical test plan are present, deterministic and passing.

## Acceptance criteria

- [ ] Sequence, direct routing, CoworkerDraft, Task and skill capability tests pass.
- [ ] Session/policy/argument hashing and transition guards pass.
- [ ] ToolPolicyDefinition golden/adversarial tests pass.
- [ ] Event normalization/redaction and context exclusion tests pass.
- [ ] Artifact path/MIME/hash tests pass.
- [ ] AG-UI mapping/reducer/patch, controlled component manifest/grant/props/interaction and unsupported P1 capability tests pass.
- [ ] No P0 unit suite is skipped or `.only`-filtered.

## Verification

~~~bash
pnpm test
~~~

## Completion evidence

- Report path:
- Command/result:
