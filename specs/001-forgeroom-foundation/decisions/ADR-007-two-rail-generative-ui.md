# ADR-007 — Two-rail in-chat generative UI

| Field | Value |
| --- | --- |
| Status | accepted |
| Date | 2026-08-25 |
| Deciders | Product, runtime, frontend, and security review |

## Release-phasing amendment

The two-rail architecture remains accepted, but the 0.1 release implements only `registry_v1`. `iframe_v1` moves intact to the P1 experimental track and is off by default. P0 does not register its tool/activity, accept its rail value, create its source/revision/capability records, deploy its origin or require its verifier/preflight. P1-317 and P1-506 must pass the complete contract below before any activation; partial activation is forbidden.

## Context

ForgeRoom needs OpenBot-like interactive results inside a shared agent channel. Most results can be represented safely as structured tables, charts, graphs, images, forms, and human-in-the-loop cards. Some valuable results need a domain-specific mini-interface that a fixed component set cannot express.

A single rendering mechanism creates a bad tradeoff:

- A registry-only approach is deterministic and accessible but cannot express every useful interaction.
- Direct model-authored React, HTML, or JavaScript in the application DOM gives untrusted output application authority.
- Generic HTML artifact previews conflict with the existing script-disabled artifact boundary.
- Treating AG-UI as the UI schema couples application state and security to a runtime transport protocol.
- An iframe alone is flexible but has weaker accessibility, reliability, and data-safety properties.

The product also needs refresh-safe replay, progressive generation, independent data and action authority, and exact approval semantics.

## Decision

Adopt two application-owned rendering rails:

1. **registry_v1 is the default.** A versioned declarative document selects only allowlisted local React components and bounded data bindings. No model-authored code, HTML, CSS, expression, URL, callback, or dynamic component import is evaluated.
2. **iframe_v1 is a policy-gated declarative escape hatch.** A coworker may stream bounded CSS, HTML and a closed behavior manifest through a private generated-UI tool stream. Raw/partial source stays out of channel/AG-UI JSON and the host DOM; source-free Open Generative UI activities expose progress and final revision hashes. After validation, only the complete immutable response is served to an isolated dedicated-origin frame. The application parses fixed allowlists, rejects model-authored JavaScript, persists complete immutable revisions, and the opaque-origin iframe executes only a hash-pinned application bootstrap.

A compiled Daytona mini-app publisher is a possible later profile, not the P1 iframe mechanism. Daytona remains used in P0 for the separate required sandbox/artifact proof.

The rail is fixed for one surface. Switching rail creates a replacement surface. The trusted application owns surface chrome, provenance, status, errors, and all canonical approval controls.

AG-UI carries versioned ForgeRoom UI domain events between the runtime adapter and application. ForgeRoom owns the RenderDocument, iframe manifest, state, grants, interaction, persistence, validation, and replay schemas. AG-UI run events or state events do not implicitly authorize or define a surface.

## Capability decision

Render, data, and action are separate server-issued grants:

- RenderGrant selects one rail, registry/build version, allowed components, and limits.
- DataGrant selects one retained immutable, redacted, schema/field/byte-bounded data snapshot or artifact revision and is bound to an exact render revision/manifest hash.
- ActionGrant selects one registered server handler, exact input schema, allowed component, mode, expiry, and use limit.

The model may request these capabilities but cannot mint or widen them. Effective authority is their intersection with current workspace, channel, coworker/session, source, account, tool, policy, and human-approval rules.

No iframe has direct data-source or action access. The trusted parent supplies an eligible bounded snapshot after server checks. The frame emits typed intents only. The interaction gateway reauthenticates and reauthorizes every intent.

## HITL decision

approval_card, required_question_card, and connection_card are server-only controlled React components populated only from canonical server records. They are not offered as frontend tools or model-authorable.

Generated registry controls and iframe documents may ask the host to open the exact existing trusted HITL card in a grant or, after trusted confirmation, enqueue a normal agent turn. Generic UI interactions cannot create an ActionProposal, approve, deny, answer, resume a turn, select a provider account, or perform an external mutation. Only TrueForge RequiredAction/tool-call ingestion creates the canonical proposal/PauseGroup.

Consequential iframe intents always require a separate trusted-host confirmation. Existing ToolPolicyDefinition, exact account/descriptor binding, approval, PauseGroup, CSRF, recent-authentication, and uncertain-outcome semantics remain authoritative.

## State and replay decision

The application database stores surfaces, immutable render revisions, state revisions, grants, and interaction records. Normalized UI changes receive the existing monotonic channel sequence.

Registry updates may use validated add/remove/replace patches with an exact base revision. Private iframe producer ingress assembles CSS → HTML → behavior manifest; source-free browser carriage uses the exact closed setup/revision/progress/status/text/final-profile snapshot and revision-tested delta schemas. Partial source never renders or becomes replay-authoritative. After schema, monotonic-session classification, size and source validation, complete blobs publish and a trusted headless verifier checks the exact immutable response. The server then atomically commits the render revision, current/last-good pointers and final channel event without depending on a connected browser. `BOOT -> INIT -> READY` gates only replacement of a browser's local mount; its timeout cannot roll back server promotion or keep a detached run open.

On a gap, the client fetches a complete server snapshot. On refresh, the application replays the last good render, canonical shared state, and action status without asking the model to reconstruct them.

## Sandbox decision

iframe_v1:

- Runs with allow-scripts and without allow-same-origin, forms, popups, downloads, top navigation, modals, or privileged Permissions-Policy features.
- Loads a complete immutable response from a dedicated cookieless generated-UI origin, never srcdoc, the application origin, or the host DOM.
- Rejects scripts, event handlers, forms/inputs/contenteditable, navigation/external resources, CSS imports/URLs, SVG/MathML/custom elements and nonempty `jsFunctions`/`jsExpressions`.
- Executes only a versioned hash-pinned application bootstrap under hash-only response-header CSP; no arbitrary expressions, packages, APIs, storage or navigation helpers exist.
- Uses a closed `BOOT -> INIT -> READY`/intent protocol, per-mount nonce, exact source-window/revision/manifest checks, sequence/message limits and a separate one-use server interaction token.
- Uses a closed data-binding manifest: generated HTML contains placeholders only, while the fixed bootstrap writes text/ARIA or creates object URLs from server-sanitized PNG/WebP bytes delivered in INIT. Generated `src`/`href`/`data:`/`blob:` values are rejected.
- Is enabled only while the stable producing logical session's classification high-water mark—and all retained data snapshots—remain synthetic/public under ADR-005. Any restricted/unknown history permanently disables this rail across TrueForge rotations.
- Collects no text/files/credentials/private answers/approval decisions; those open in trusted host components outside the frame.
- Sends `Cache-Control: no-store`, `allow=""`, an explicit versioned privileged-feature deny list and checks `event.origin === "null"` together with exact source-window/revision/nonce bindings.

The iframe is a generated UI package, not an exception that makes generic executable artifact previews safe.

Arbitrary model-authored browser JavaScript is P1-disabled: sandbox/CSP cannot universally prevent a script from navigating its own frame and causing blind requests. Sensitive iframe data or arbitrary-script simulations require a new accepted security design.

## Consequences

Positive:

- Common results are deterministic, theme-consistent, replayable, and accessible.
- Purpose-built declarative interfaces remain possible without putting generated code in the application DOM.
- The product can stream useful progress as validated registry revisions or complete iframe builds.
- UI authority is explicit and narrower than the coworker's tool authority.
- Approval integrity and existing application event replay remain intact.
- AG-UI can evolve independently of the application UI schema.

Costs and limitations:

- Two renderers, validators, test matrices, and failure paths must be maintained.
- iframe_v1 needs an ordered activity assembler, HTML/CSS/manifest parsers, dedicated delivery origin, pinned bootstrap/CSP, accessibility verifier, and interaction bridge.
- Generated iframe accessibility and browser resource usage are harder to guarantee; registry_v1 remains preferred.
- The frame may reveal generation progress, but only a complete validated source revision is authoritative after refresh.
- P1 iframe_v1 cannot receive workspace-sensitive data under its initial profile.
- The component registry needs deliberate versioning and migration.

## Rejected alternatives

- **Registry only:** safe but removes the custom mini-interface capability central to the product direction.
- **Iframe only:** makes routine cards less reliable and accessible and expands the untrusted-code surface unnecessarily.
- **Generated React in the host bundle or DOM:** crosses the application trust boundary and exposes state, credentials, navigation, and handlers.
- **Executable source in the host DOM or generic artifact preview:** weakens isolation and conflicts with the artifact preview contract.
- **allow-same-origin for easier messaging:** would remove the opaque-origin boundary and increase storage and DOM risk.
- **Direct iframe calls to application, Composio, TrueForge, or data APIs:** leaks authority into untrusted code and bypasses grants and approvals.
- **Use AG-UI state as the generative-UI schema and database:** confuses transport with application semantics and makes replay and authorization provider-dependent.
- **Let model-authored UI render approval controls:** permits phishing and misleading approval context even if the backend later rejects the click.
- **Execute arbitrary/out-of-order source or model-authored JavaScript:** produces transient unsafe states, cannot be deterministically replayed and defeats navigation/CPU claims. P1 accepts inert bounded producer fragments only in the private assembler, exposes only source-free browser projections and promotes complete parsed declarative revisions.

## Invariants

1. registry_v1 is chosen whenever the approved registry can express the result.
2. A surface renders nothing without a current RenderGrant.
3. RenderGrant never implies data or action authority.
4. iframe_v1 receives no secrets, credentials, workspace-sensitive data, or direct APIs.
5. Model-authored output never creates a privileged HITL component.
6. An iframe may request only a trusted host flow or normal agent continuation; canonical approval remains bound to an existing RequiredAction and cannot originate from generic UI.
7. Only complete validated revisions become current; last known-good remains available.
8. Server promotion never depends on a particular browser mount; READY is local activation only.
9. Ordinary expiry may preserve exact read-only historical replay for a current member, but security quarantine, integrity failure or deletion tombstones delivery.
10. Channel replay reconstructs UI without runtime rerun.
11. An invalid AG-UI event, patch, iframe message, revision, grant, or state transition fails closed.
12. Generic artifact previews remain non-executable.

## Verification

P0 acceptance covers the registry subset of `generative-ui.md`. P1-506 owns the iframe GUIT/security/browser suite below and it does not block P0. Enabling iframe_v1 requires:

- Manual inspection of iframe sandbox attributes, effective CSP and generated-UI bootstrap/delivery path.
- Browser fixtures proving scripts/handlers/forms/inputs/navigation/external resources are rejected and the fixed bootstrap cannot access protected API/storage/host-DOM capabilities in every supported profile.
- Credential and workspace-sensitive-data canaries proving they never enter the build workspace, bundle, AG-UI payload, frame INIT message, browser storage, or audit export.
- Adversarial interaction tests proving a malicious frame can at most request an allowed intent and cannot execute or approve an external action.
- Replay and duplicate-delivery tests proving deterministic render/state hashes and one interaction result per idempotency key.

If the deployed origin cannot enforce the required iframe profile, iframe_v1 is disabled and registry_v1 plus accessible static fallback remains available.
