# Experimental open-generated UI specification

## Status and authority

This is an **optional, off-by-default 0.2 experiment**, not an alpha release requirement. P0 implements only registered controlled GenUI. The exhaustive renderer, manifest, message, delivery and test contract retained in [`../001-forgeroom-foundation/generative-ui.md`](../001-forgeroom-foundation/generative-ui.md) and its security section becomes normative only when P1-317 and P1-506 both pass for one exact build/profile.

No partial mode is supported. If any producer, parser, immutable publisher, dedicated origin, verifier, capability, replay, accessibility or log-redaction control is absent, `iframe_v1` remains unregistered and unavailable.

## Requirements

| ID | Contract |
| --- | --- |
| XGUI-001 | The feature is compiled/routed off by default, separately enabled per deployment/workspace, visibly experimental, and never blocks controlled GenUI or the 0.2 release. |
| XGUI-002 | Model output is bounded declarative HTML/CSS/closed behavior data only; model-authored JavaScript, executable expressions, forms/credential inputs, navigation, external resources and arbitrary packages/network are rejected before publication. |
| XGUI-003 | Only a versioned hash-pinned application bootstrap executes in a dedicated cookieless opaque-origin sandbox under the exact CSP/Permissions-Policy/header profile; host DOM and application credentials are unreachable. |
| XGUI-004 | Complete revisions are immutable and bind canonical manifest, source/body/index/data/state/renderer/bootstrap/sanitizer/CSP/header hashes; partial/failed staging never becomes durable replay state. |
| XGUI-005 | The initial profile accepts only synthetic/explicitly public classified data; the producing logical session's monotonic classification high-water mark cannot be reset by compaction or rotation. |
| XGUI-006 | Browser AG-UI events are source-free and replay exact committed revisions/state or an inert text fallback without model regeneration. |
| XGUI-007 | Frame messages use closed direction-aware schemas, source-window/opaque-origin/nonce/revision/manifest/sequence/size/rate checks and grant-bound render-node IDs. |
| XGUI-008 | Generated UI has no canonical authority: it can submit only bounded intents through one-use host tokens; approval, question, secret, record mutation and external action stay in trusted host/application gateways. |
| XGUI-009 | A trusted headless verifier checks the exact immutable response/profile before atomic server promotion; a browser READY event gates local activation only and cannot attest security. |
| XGUI-010 | Capability redemption reauthorizes membership/grants/profile/epoch and verifies retained bytes/hashes; revocation, quarantine, canary, deletion and integrity tombstones block future delivery. |
| XGUI-011 | The rail has accessible text fallback, keyboard/focus/zoom/reduced-motion behavior, deterministic limits/failures, and cannot cover or impersonate trusted system controls. |
| XGUI-012 | Raw source, data, capabilities, URLs, nonces and verifier material are absent from AG-UI/channel/audit/log/analytics/test traces according to the retention policy. |
| XGUI-013 | The full retained GUIT/SEC/browser matrix passes without skips for every supported browser and exact hash profile, and an independent security reviewer approves activation. |

## Activation gate

Activation records deployment/workspace, feature/profile version, producing tool descriptor, generated origin, renderer/bootstrap/sanitizer/CSP/header hashes, supported browsers, conformance report, reviewer, date and rollback switch. A configuration mismatch or missing exact artifact disables the rail at startup. Controlled registry/text fallback remains available.

## Non-goals

- Arbitrary React/npm/CDN component generation.
- Generated approval/login/payment/credential/file/private-answer controls.
- Private workspace data in the initial iframe profile.
- Reusable component publication or marketplace distribution.
- Treating an iframe as security merely because it is sandboxed.
