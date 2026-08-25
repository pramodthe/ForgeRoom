---
id: P0-104
title: Implement owner authentication and authorization
status: blocked
owner: unassigned
depends_on: [P0-103]
requirements: [AP-003]
specs: [../security.md#human-authentication, ../contracts/api.md#authentication]
adrs: []
touches: [apps/api, apps/web, packages/domain]
---

# P0-104 — Implement owner authentication and authorization

## Outcome

The seeded owner authenticates through a secure server session and every protected command derives identity and role server-side.

## Acceptance criteria

- [ ] Login, session query and logout work; logout revokes the session.
- [ ] Secure cookie, hashed server session, expiry and login rate limiting exist.
- [ ] Mutation endpoints enforce Origin and CSRF.
- [ ] Approval/connector commands require recent authentication.
- [ ] No production auth bypass, public registration or password-reset path exists.

## Verification

Run API tests for success, invalid login, rate limit, revoked session, forged user ID, missing CSRF and forged Origin.

## Completion evidence

- Files changed:
- Security tests/results:
