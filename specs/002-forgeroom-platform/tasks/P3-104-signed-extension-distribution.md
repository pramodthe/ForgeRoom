---
id: P3-104
title: Implement signed extension distribution and vulnerability response
status: blocked
owner: unassigned
depends_on: [P2-203, P3-000]
requirements: [SK-010, OSS-008, OSS-009, OSS-010, PSEC-013]
specs: [../open-source.md, ../security.md]
release_gate: required
---

# P3-104 — Implement signed extension distribution

## Outcome

Extensions can be discovered and updated through verifiable provenance, explicit trust/capability review and an enforceable revoke/advisory process.

## Acceptance criteria

- [ ] Package signatures, publisher identity, transparency/provenance and immutable content hashes are verified before install.
- [ ] Catalogue distinguishes official, verified and community trust without implying safety beyond evidence.
- [ ] Install/update diff shows code origin, permissions, compatibility and affected sessions/workflows.
- [ ] Revocation/advisory can disable vulnerable versions safely while retaining historical fallbacks and audit.
- [ ] Offline/manual signed install remains supported for self-hosters.
- [ ] Vulnerability disclosure, response SLAs, signing-key rotation and compromise recovery are documented/tested.

## Verification

Run forged/signature downgrade, key rotation/compromise, typosquat/dependency confusion, malicious update, revoke and offline install tests.

## Evidence

- Signing/provenance fixtures:
- Incident drill:
