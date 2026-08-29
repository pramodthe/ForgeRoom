# P0 security release checklist

Every checkbox requires automated or redacted manual evidence linked from its task.

## Identity and service boundary

- [x] Production build has no auth bypass or public registration.
- [x] Secure session, logout revocation, rate limiting, Origin and CSRF tests pass.
- [ ] TrueForge is not publicly exposed in no-login mode.
- [x] Browser bundles and network responses contain no service credentials.
- [x] Connect Link state is bound to authenticated workspace session.

## Authorization and isolation

- [x] New channel has no external capability by default.
- [x] Cross-channel messages, pins, artifacts, accounts and approvals are inaccessible.
- [x] Model output cannot change grants, connectors, account binding or approval policy.
- [x] Effective tools equal the intersection of every server policy layer.
- [x] Payments, permissions, deployment and bulk destructive tools are absent.

## Composio and approval

- [x] Exact pinned connected-account IDs are configured for every toolkit.
- [x] Meta-execute, workbench, remote bash, dynamic write search and fallback accounts are absent.
- [x] Descriptor drift fails closed.
- [x] Every mutation is literal in the TrueForge approval-required set.
- [x] Approval preview comes from reviewed adapter and redacted canonical arguments.
- [x] One-byte argument change, descriptor change, generation change or expiry stales the proposal.
- [x] Unauthenticated, forged-Origin, replayed and concurrent conflicting decisions are rejected correctly.
- [x] Denied proposal makes zero provider mutation call.
- [x] Mixed approvals and questions from one turn produce one PauseResume.
- [x] Lost resume response is reconciled and never blindly retried.
- [x] Ambiguous write becomes unknown and receives no automatic retry.

## Session and cancellation

- [x] Grant or policy reduction blocks queue, requests cancellation, stales actions and rotates session.
- [x] Normal queued messages may rebind; old approval/question responses never migrate.
- [x] Archive blocks new turns/resumes while honestly handling an already-running MCP call.
- [x] Process restart fails uncertain work closed.

## Sandbox and artifact

- [x] Sandbox receives no application, model-provider or Composio credentials.
- [x] Fixture inputs are synthetic or explicitly public.
- [x] Outbound reachability test records open/closed status.
- [x] Sensitive-data readiness fails if outbound egress is open.
- [x] Artifact path traversal, oversized files and unsafe MIME types are rejected.
- [x] Active scripts cannot execute in previews.
- [x] Artifact download requires channel authorization.

## AG-UI and controlled components

- [x] Exact pure AG-UI versions are pinned; mixed/unsupported profiles fail startup, and optional CopilotKit is absent unless its coherent-graph parity gate passes.
- [x] Every outbound AG-UI event/activity validates before persistence/broadcast.
- [x] `RAW`, reasoning/thinking, raw TrueForge IDs, signatures, credentials and arbitrary tool bodies never cross the adapter.
- [x] Forged browser tool definitions/state cannot expand component, external-tool, account or approval capability.
- [x] Components are default deny and call-time publication/version/descriptor/grant checks are audited.
- [x] Render, data-function, interaction and external-action grants are independent.
- [x] Controlled props reject HTML/scripts/prototype keys/arbitrary URLs and enforce table/chart/image limits.
- [x] Image components accept authorized artifact revisions only, decode with byte/pixel/decompression caps, strip metadata, re-encode PNG/WebP and reject SVG/HTML/polyglots.
- [ ] `generate_open_ui`, `iframe_v1`, open-generated activities, source assembly, render capabilities and generated-origin routes are absent/unsupported in P0.
- [x] Trusted parent uses one-use interaction tokens for bounded controlled modes; generic UI cannot create/decide ActionProposals, answer Questions, resume PauseGroups or call Composio/TrueForge.
- [x] Canonical approval/connection controls remain trusted host React UI.
- [x] Invalid patch/version/renderer failure contains one controlled instance and leaves an accessible fallback.
- [ ] Refresh verifies identical controlled UIInstance/component/data/state hashes without model rerun or falls back inertly.

## Coworker drafts, Tasks and skills

- [x] Builder output cannot create/grant/connect; exact server resolution and stale confirmation checks pass.
- [x] Task tools cannot mutate ungranted fields/transitions or bypass optimistic revision/audit.
- [x] Skill drafts/packages exclude credentials, reasoning, raw tool bodies and executable content; required capabilities grant nothing.
- [x] Skill attachment cannot expand authority and rotates the exact affected sessions.

## Data and audit

- [x] Database/log/event fixtures contain no reasoning, OAuth headers, credentials, raw provider bodies or fixture secrets.
- [x] Pending response ciphertext is encrypted, access-restricted and expires.
- [x] Generic MCP response is not mislabeled as verified provider receipt.
- [x] Audit UI says application history and declared lineage, not cryptographic proof.

## Sign-off

- [x] Security acceptance suite passes without skipped P0 tests.
- [x] One reviewer independently inspected redacted evidence.
- [ ] P0-506 AG-UI/controlled-GenUI conformance and iframe-absence review pass.
- [x] Remaining risks are documented and outside P0 claims.
