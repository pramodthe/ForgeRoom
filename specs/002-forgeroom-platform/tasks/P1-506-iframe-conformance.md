---
id: P1-506
title: Complete experimental iframe security and conformance evidence
status: blocked
owner: unassigned
depends_on: [P1-317, P1-501]
requirements: [XGUI-001, XGUI-002, XGUI-003, XGUI-004, XGUI-005, XGUI-006, XGUI-007, XGUI-008, XGUI-009, XGUI-010, XGUI-011, XGUI-012, XGUI-013]
specs: [../experimental-ui.md, ../../001-forgeroom-foundation/generative-ui.md, ../../001-forgeroom-foundation/security.md, ../../001-forgeroom-foundation/test-plan.md]
release_gate: experimental_only
---

# P1-506 — Complete iframe conformance

## Outcome

The open-generated iframe rail may be enabled only when its exact browser, delivery, integrity, authorization, replay and accessibility contract has independent evidence.

## Acceptance criteria

- [ ] Every retained GUIT/SEC iframe case passes in every supported browser without waiver or skipped adversarial fixture.
- [ ] Immutable body/manifest/header/CSP/source hashes and dedicated-origin response are recomputed and verified end to end.
- [ ] Parser rejects scripts, handlers, forms/inputs, navigation, external resources, unsafe SVG/MathML/CSS URLs and executable behavior fields.
- [ ] Opaque-origin BOOT/INIT/READY and frame→host messages enforce exact direction, schema, nonce, sequence, size/rate and grant-bound node IDs.
- [ ] Classification history, data grants, tombstones, quarantine and delivery epoch prevent restricted/stale/redacted content from redemption.
- [ ] A frame can request only bounded intent; trusted host confirmation and the canonical action/approval gateways remain authoritative.
- [ ] Replay, no-browser completion, timeout, fallback, focus, reduced-motion and text-alternative behavior are deterministic.
- [ ] Capability/source/body URLs and content are absent from application, edge, analytics and test trace logs.
- [ ] Independent security reviewer approves the exact versioned renderer/bootstrap/sanitizer/profile hashes.

## Verification

Run the full retained iframe unit/integration/security/Playwright matrix and inspect deployed headers/policies from a non-privileged browser session.

## Evidence

- Matrix/reports:
- Deployed header proof:
- Reviewer/sign-off:
