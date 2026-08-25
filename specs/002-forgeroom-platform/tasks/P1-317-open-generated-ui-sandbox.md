---
id: P1-317
title: Implement progressive open-generated UI and hardened iframe
status: blocked
owner: unassigned
depends_on: [P0-505, P1-101, P1-102, P1-103]
requirements: [XGUI-001, XGUI-002, XGUI-003, XGUI-004, XGUI-005, XGUI-006, XGUI-007, XGUI-008, XGUI-009, XGUI-010, XGUI-011, XGUI-012]
specs: [../experimental-ui.md, ../../001-forgeroom-foundation/generative-ui.md#p1-progressively-generated-document-rail, ../../001-forgeroom-foundation/contracts/events.md#p1-open-generated-ui-activity, ../../001-forgeroom-foundation/security.md#p1-open-generated-ui-sandbox, ../security.md]
adrs: [ADR-007]
touches: [packages/ui/generated-ui, packages/integrations/ag-ui, packages/storage, apps/api, apps/web]
release_gate: experimental_only
---

# P1-317 — Implement experimental progressive open-generated UI and hardened iframe

## Outcome

Behind a disabled-by-default experimental flag, a coworker can stream a purpose-built declarative widget inline while only a fixed application bootstrap executes and the result remains replayable and powerless.

This task cannot gate 0.2; the feature cannot be enabled for any workspace until P1-506 passes.

## Acceptance criteria

- [ ] Private assembler enforces setup → CSS → HTML → closed behavior-manifest order and rejects executable fields; browser activity uses the exact closed source-free snapshot and revision-test/phase/count/generating/status/finalProfile delta allowlist.
- [ ] Partial drafts are memory-only or per-assembly encrypted non-backed-up staging with a 15-minute hard TTL; failure/cancel/timeout and post-promotion cleanup leave no staging body.
- [ ] Partial/invalid source never renders; the content-addressed final HTTP body is durably published and trusted verification passes first, then one transaction persists its blob key/body-index/hash, length-framed pre-binding source hash, revision/pointers/final event, closed RenderManifestV1 JSON, every required subhash, verifier evidence and text fallback; replay verifies indexed byte ranges and serves retained bytes rather than regenerating them.
- [ ] Complete documents load only from the dedicated cookieless generated-UI origin—never srcdoc/application origin—under opaque `allow-scripts`, `allow=""`, the exact normalized hash CSP and canonical GeneratedUiDeliveryHeadersV1 object/hash, `Cache-Control: no-store`, no CORS/cookies and the explicit versioned Permissions-Policy deny list.
- [ ] Generated origin redeems only an unexpired capability bound to exact instance/revision/manifest/body/body-index/header hashes and current delivery-security epoch, verifies retained bytes plus in-bounds marker-adjacent ranges and extracted source hash, rechecks historical-delivery blocks, returns one immutable response, and rejects forged, expired, cross-instance, hash-mismatch, stale-epoch and newly tombstoned capabilities.
- [ ] Parser allowlists reject scripts/handlers/forms/inputs/contenteditable/navigation/external resources/SVG/MathML/custom elements, CSS imports/URLs and every model-authored src/srcset/href/data:/blob: value; only the operation-budgeted fixed bootstrap executes.
- [ ] A closed binding manifest maps each placeholder node and safe sink to an exact DataGrant/data_ref/literal path/formatter; bootstrap uses textContent/safe ARIA or creates object URLs only from server-sanitized PNG/WebP INIT bytes.
- [ ] Closed hash-bound iframe state schema allows only finite boolean/number/enum domains; local fields stay local and shared STATE_INTENT requires an exact commit_state grant plus server CAS.
- [ ] iframe_v1 fails closed unless the stable logical session's monotonic classification high-water mark and all retained DataGrant snapshots are synthetic/public; rotation/downgrade attempts, inline copied data and credential canaries are rejected before persistence/delivery.
- [ ] Checked-in strict schemas/fixtures cover exact FrameBindingV1 and BOOT, INIT, READY, RESIZE, STATE_INTENT, INTERACTION_INTENT and CLIENT_ERROR records; BOOT is the only pre-INIT record, INIT the only host→frame protocol-v1 record, READY must occur exactly once at sequence 1, and only then may later messages increment from 2.
- [ ] `BOOT -> INIT -> READY` validates exact source window, literal `event.origin === "null"`, surface/revision/manifest, mount nonce, sequence, schema and rate/size limits; unknown keys and stale bindings fail closed, and shared-state commits remount with a fresh nonce.
- [ ] Frame→host is capped at 64 KiB and INIT at 1.25 MiB including at most 1 MiB retained data/assets; INIT text/ARIA values bind exact grant/ref/path/snapshot fields, raster payloads are hash-checked PNG/WebP Uint8Array only, intents bind a renderNodeId allowed by both behavior and ActionGrant, and CLIENT_ERROR contains no free text/stack/source.
- [ ] Trusted parent obtains a separate one-use interaction token; frame intents can request only bounded state, an exact DataGrant read/component interrupt, an existing HITL card, or host-confirmed normal agent turn and cannot create/decide a canonical action.
- [ ] Refresh verifies and replays identical source/data/profile/state hashes; missing, quarantined or unavailable exact renderer/security profile degrades to the text alternative.
- [ ] Generated frame is visibly labeled and meets keyboard/focus/reduced-motion/summary requirements.
- [ ] A trusted headless verifier loads the exact immutable response and persists profile/results/evidence bound to source/delivery-body/manifest/renderer/bootstrap/sanitizer/CSP/header hashes before a browser-independent atomic server promotion; the host never pretends to inspect opaque frame DOM.
- [ ] Pre-promotion verification uses a service-authenticated one-use staging URL bound to published-but-unpromoted blob/profile hashes—not the member render-capability endpoint—and proves staged/eventual bytes and headers are identical.
- [ ] Raw member/verifier capability URLs and source bodies are redacted from generated-origin/proxy/access/exception/analytics/test-trace logs; evidence scans compressed traces and edge logs.
- [ ] READY gates only local mount replacement; no-browser completion succeeds after server promotion, and READY timeout keeps prior local mount without globally failing/rolling back the revision.
- [ ] Generated documents cannot create free-text/file/credential/private-answer/payment/OAuth/approval inputs and delegate those flows to trusted host UI.

## Verification

Run activity fixtures plus canonical manifest/header-hash fixtures, parser/CSP/Permissions-Policy, executable-field and authored-URL rejection, classification downgrade/canary, every closed iframe message, placeholder binding, BOOT/INIT/READY/no-browser completion, token separation, message forgery, resize abuse, tombstone-after-issuance, patch/replay and fallback tests in every supported browser.
