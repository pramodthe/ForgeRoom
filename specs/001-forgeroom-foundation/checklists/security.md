# P0 security release checklist

Every checkbox requires automated or redacted manual evidence linked from its task.

## Identity and service boundary

- [ ] Production build has no auth bypass or public registration.
- [ ] Secure session, logout revocation, rate limiting, Origin and CSRF tests pass.
- [ ] TrueForge is not publicly exposed in no-login mode.
- [ ] Browser bundles and network responses contain no service credentials.
- [ ] Connect Link state is bound to authenticated workspace session.

## Authorization and isolation

- [ ] New channel has no external capability by default.
- [ ] Cross-channel messages, pins, artifacts, accounts and approvals are inaccessible.
- [ ] Model output cannot change grants, connectors, account binding or approval policy.
- [ ] Effective tools equal the intersection of every server policy layer.
- [ ] Payments, permissions, deployment and bulk destructive tools are absent.

## Composio and approval

- [ ] Exact pinned connected-account IDs are configured for every toolkit.
- [ ] Meta-execute, workbench, remote bash, dynamic write search and fallback accounts are absent.
- [ ] Descriptor drift fails closed.
- [ ] Every mutation is literal in the TrueForge approval-required set.
- [ ] Approval preview comes from reviewed adapter and redacted canonical arguments.
- [ ] One-byte argument change, descriptor change, generation change or expiry stales the proposal.
- [ ] Unauthenticated, forged-Origin, replayed and concurrent conflicting decisions are rejected correctly.
- [ ] Denied proposal makes zero provider mutation call.
- [ ] Mixed approvals and questions from one turn produce one PauseResume.
- [ ] Lost resume response is reconciled and never blindly retried.
- [ ] Ambiguous write becomes unknown and receives no automatic retry.

## Session and cancellation

- [ ] Grant or policy reduction blocks queue, requests cancellation, stales actions and rotates session.
- [ ] Normal queued messages may rebind; old approval/question responses never migrate.
- [ ] Archive blocks new turns/resumes while honestly handling an already-running MCP call.
- [ ] Process restart fails uncertain work closed.

## Sandbox and artifact

- [ ] Sandbox receives no application, model-provider or Composio credentials.
- [ ] Fixture inputs are synthetic or explicitly public.
- [ ] Outbound reachability test records open/closed status.
- [ ] Sensitive-data readiness fails if outbound egress is open.
- [ ] Artifact path traversal, oversized files and unsafe MIME types are rejected.
- [ ] Active scripts cannot execute in previews.
- [ ] Artifact download requires channel authorization.

## AG-UI and controlled components

- [ ] Exact pure AG-UI versions are pinned; mixed/unsupported profiles fail startup, and optional CopilotKit is absent unless its coherent-graph parity gate passes.
- [ ] Every outbound AG-UI event/activity validates before persistence/broadcast.
- [ ] `RAW`, reasoning/thinking, raw TrueForge IDs, signatures, credentials and arbitrary tool bodies never cross the adapter.
- [ ] Forged browser tool definitions/state cannot expand component, external-tool, account or approval capability.
- [ ] Components are default deny and call-time publication/version/descriptor/grant checks are audited.
- [ ] Render, data-function, interaction and external-action grants are independent.
- [ ] Controlled props reject HTML/scripts/prototype keys/arbitrary URLs and enforce table/chart/image limits.
- [ ] Image components accept authorized artifact revisions only, decode with byte/pixel/decompression caps, strip metadata, re-encode PNG/WebP and reject SVG/HTML/polyglots.
- [ ] `generate_open_ui`, `iframe_v1`, open-generated activities, source assembly, render capabilities and generated-origin routes are absent/unsupported in P0.
- [ ] Trusted parent uses one-use interaction tokens for bounded controlled modes; generic UI cannot create/decide ActionProposals, answer Questions, resume PauseGroups or call Composio/TrueForge.
- [ ] Canonical approval/connection controls remain trusted host React UI.
- [ ] Invalid patch/version/renderer failure contains one controlled instance and leaves an accessible fallback.
- [ ] Refresh verifies identical controlled UIInstance/component/data/state hashes without model rerun or falls back inertly.

## Coworker drafts, Tasks and skills

- [ ] Builder output cannot create/grant/connect; exact server resolution and stale confirmation checks pass.
- [ ] Task tools cannot mutate ungranted fields/transitions or bypass optimistic revision/audit.
- [ ] Skill drafts/packages exclude credentials, reasoning, raw tool bodies and executable content; required capabilities grant nothing.
- [ ] Skill attachment cannot expand authority and rotates the exact affected sessions.

## Data and audit

- [ ] Database/log/event fixtures contain no reasoning, OAuth headers, credentials, raw provider bodies or fixture secrets.
- [ ] Pending response ciphertext is encrypted, access-restricted and expires.
- [ ] Generic MCP response is not mislabeled as verified provider receipt.
- [ ] Audit UI says application history and declared lineage, not cryptographic proof.

## Sign-off

- [ ] Security acceptance suite passes without skipped P0 tests.
- [ ] One reviewer independently inspected redacted evidence.
- [ ] P0-506 AG-UI/controlled-GenUI conformance and iframe-absence review pass.
- [ ] Remaining risks are documented and outside P0 claims.
