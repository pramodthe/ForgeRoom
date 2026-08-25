# Connections and external tools specification

## Purpose

Connections let humans, coworkers and workflows use external applications without turning Composio's catalogue into ambient product authority. Composio or another adapter may own OAuth credentials and transport; ForgeRoom owns the workspace-visible connection identity, exact account/tool grants, policy, lifecycle, health, runtime compilation and audit.

## Objects

| Object | Purpose |
| --- | --- |
| `Connection` | Stable workspace reference to one provider-managed integration identity and lifecycle |
| `ConnectionAccount` | Exact external account/tenant identity with redacted display metadata and provider reference |
| `ToolDescriptorVersion` | Immutable normalized tool slug/schema/effect/descriptor hash observed from the adapter |
| `ConnectionGrant` | Positive human/coworker/workflow/channel permission to one account and literal tool/effect set |
| `ConnectionIntent` | Short-lived trusted OAuth/connect/reconnect attempt bound to actor, workspace, redirect and anti-CSRF state |
| `ConnectionHealth` | Last verified auth/account/descriptor status and safe remediation state |
| `ToolPolicyDefinition` | Application-owned argument/target/effect/redaction/approval/reconciliation rules for a tool version |

## Release model

- **0.1:** one preconfigured workspace service identity, exact connected-account IDs and two-to-four literal direct tools. Health/Test/Reconnect only.
- **0.2:** admins can add/revoke multiple workspace service connections, browse adapter metadata, select exact accounts/tools, review effects and grant them to coworkers.
- **0.3:** supported per-human connections, delegation, approver groups and workflow service principals.
- **1.0:** stable adapter/extension contract, exportable safe metadata and signed policy packs.

The product may advertise broad adapter availability, but a workspace sees only installed/connected applications and a coworker sees only exact positively granted accounts/tools. “1,000 integrations” never means “1,000 tools enabled.”

## Connection flow

1. An authorized human starts a trusted `ConnectionIntent` for a named adapter/application and intended ownership scope.
2. The server binds workspace, actor, return path, provider, nonce/state, PKCE where supported, expiry and intended effects. Provider secrets never enter chat, GenUI or coworker context.
3. The provider callback/reconciliation verifies state and obtains exact connected-account metadata through the server-side adapter.
4. ForgeRoom stores only the required opaque provider reference plus safe redacted identity/scopes/health metadata; Composio retains OAuth credentials where it is the provider.
5. The server fetches and normalizes tool descriptors. Administrators review literal slugs, effects, schemas, targets, approval/reconciliation support and any unavailable/denied tools.
6. A revision-bound grant selects one exact account and literal tools/effects for a coworker/workflow/channel. Runtime compilation and call-time authorization use that snapshot.
7. Revoke/expiry/descriptor drift blocks new work, rotates affected sessions and stales bound proposals. In-flight provider outcomes are reconciled rather than claimed cancelled.

## Requirements

| ID | Contract | First release |
| --- | --- | --- |
| CN-001 | ForgeRoom stores a stable connection/account reference and safe metadata; adapter credentials/tokens remain server/provider-side and never enter browser, model, events, logs, export or GenUI. | 0.1 |
| CN-002 | Every enabled external tool is a literal direct-tool slug pinned to one exact connected-account ID; no ambient account fallback, meta-execute or dynamic write discovery exists. | 0.1 |
| CN-003 | Tool descriptor versions are immutable and hashed; startup/claim/call-time descriptor drift fails closed and stales affected proposals. | 0.1 |
| CN-004 | Every write/destructive tool has a reviewed ToolPolicyDefinition and exact approval/reconciliation behavior before enablement. | 0.1 |
| CN-005 | Connection UI and approvals show safe acting identity, owner class, scopes, tools/effects, health and verification time without exposing secrets. | 0.1 |
| CN-006 | Expiry/revocation/account mismatch blocks new work, rotates affected runtime revisions and truthfully reconciles any in-flight external outcome. | 0.1 |
| CN-007 | Authorized admins can add, test, reconnect, disable and revoke multiple workspace service connections through revisioned auditable commands. | 0.2 |
| CN-008 | Tool browsing/granting is default deny, effect-labelled, searchable and constrained by workspace policy and the grantor's delegation ceiling. | 0.2 |
| CN-009 | OAuth/connect callbacks bind workspace, actor/session, state/nonce, redirect allowlist, PKCE where available and expiry; login/connection CSRF or account-link confusion fails closed. | 0.2 |
| CN-010 | Per-human connection ownership/delegation is explicit; a workflow/coworker never substitutes another human or service account when the selected account is unavailable. | 0.3 |
| CN-011 | Background workflows use explicit service-principal/account grants with budgets, approval policy and revocation semantics identical to interactive work. | 0.3 |
| CN-012 | Adapter/policy-pack contracts are versioned and portable; export includes safe configuration/provenance but no provider credential and import requires fresh reconnection/regrant. | 1.0 |

## Authorization and safety

- Workspace role never implies connection delegation automatically. `connection.manage`, `connection.delegate` and tool/effect grants are separate.
- Connection ownership does not grant private-channel, record, memory or knowledge access.
- A tool schema describes possible arguments, not permission. The action gateway rechecks actor/coworker/workflow, channel/resource, account, tool descriptor, policy revision and target at every call.
- Reads remain budgeted/redacted and can require approval by policy; write/destructive effects always follow the exact TrueForge pause plus application proposal/decision/resume/reconciliation path.
- Reconnect never silently changes the external account behind a grant. Identity mismatch requires a visible new account/grant revision.
- Provider/webhook/error bodies are normalized and bounded before persistence or user display.

## Failure behavior

- Provider timeout leaves the intent/connection in a visible pending/unknown state; reconciliation uses the provider idempotency/reference rather than creating duplicates.
- Missing scopes list the exact unavailable tool/effect without suggesting a broader account.
- Descriptor incompatibility quarantines the version and blocks affected runtime compilation.
- Revocation may not retract an already executing provider call; the application records `unknown` until read reconciliation or explicit operator resolution.
- Provider outage does not erase connection identity, grants or audit. Work becomes `blocked_connection` with safe retry guidance.

## Acceptance scenarios

- Connect two workspace service accounts for the same application; a coworker granted account A never calls or previews account B.
- A read-only coworker sees only literal read tools even though the adapter exposes hundreds of write tools.
- OAuth state replay, redirect substitution and callback from another browser session fail without creating a connection.
- A descriptor changes after an approval card is displayed; the proposal becomes stale and no call executes.
- Revoking an account while a call is uncertain blocks new work and records the reconciled provider result without blind retry.
- Export/import carries redacted connection configuration and required adapter/tool hashes, then requires explicit reconnection and fresh grants.
