---
id: P3-103
title: Implement optional SSO, SCIM and custom policy integration
status: blocked
owner: unassigned
depends_on: [P3-000, P3-102]
requirements: [TEAM-001, TEAM-002, TEAM-003, PSEC-001, PSEC-003, PSEC-005]
specs: [../teams.md, ../security.md]
release_gate: optional
---

# P3-103 — Implement enterprise identity

## Outcome

Organizations can federate identity and lifecycle management while the platform keeps explicit, reviewable workspace/channel/coworker/action authorization.

This package is optional for 1.0. When absent, core local/OIDC identity remains supported; when present, every conditional GA identity test below must pass.

## Acceptance criteria

- [ ] Supported OIDC/SAML profiles validate issuer/audience/signature/nonce/time and safe account linking.
- [ ] SCIM create/update/suspend/group sync is idempotent and cannot remove the last required owner without recovery policy.
- [ ] Session/MFA/recent-auth and IdP logout/revocation behavior are documented and tested.
- [ ] Custom roles/ABAC compile into the central evaluator with explainable decisions and safe fallback on policy error.
- [ ] Group sync never grants connection, coworker, approval or private-channel access absent explicit mapping.
- [ ] Enterprise packaging does not weaken core local-auth, export or self-host portability promises.

## Verification

Run protocol conformance, account takeover/linking, SCIM replay/order/suspend, group escalation and policy failure tests.

## Evidence

- Protocol report:
- Security review:
