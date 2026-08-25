# ForgeRoom 0.1 security and reliability specification

| Field | Value |
| --- | --- |
| Status | Canonical P0 security contract |
| Security posture | Default deny, least privilege, authenticated human, immutable per-call approval |
| Sensitive sandbox data | Prohibited unless outbound egress is externally restricted |

## Threat model

Protect against:

- Unauthenticated or cross-origin commands and approvals.
- A model or prompt-injected document attempting to expand tools or self-authorize.
- Cross-channel data, artifact, memory, account or approval access.
- Wrong-account selection by Composio fallback behavior.
- Hidden write actions behind generic MCP meta-tools.
- Approval replay, payload substitution or concurrent conflicting decisions.
- Duplicate resume after a lost TrueForge response.
- Session permissions remaining broader after a grant or policy change.
- Raw credentials, reasoning or provider payloads entering logs, database, browser or fixtures.
- Generated artifact scripts or sandbox network egress bypassing MCP approval.
- Prompt/model-generated UI attempting XSS, network exfiltration, UI redress, fake approvals or unauthorized host commands.
- Forged AG-UI tool definitions, malformed state/activity patches or stale component grants expanding capability.
- Ambiguous external writes being blindly retried.

P0 does not claim protection from a compromised application server, TrueForge deployment, Composio account, model provider or external provider. Service credentials and deployment hardening still minimize blast radius.

## Trust boundaries

1. Browser input is untrusted and authenticated commands are reauthorized server-side.
2. Human messages, model output, external tool results, web pages, email, artifacts and sandbox output are untrusted content.
3. The application API is the authorization boundary.
4. TrueForge is privately reachable and service-authenticated; its development no-login mode is never public.
5. Composio credentials remain inside Composio and opaque MCP headers remain server-side.
6. Daytona receives no application, model-provider or Composio credentials.
7. Controlled component props are untrusted content even after a model produced them.
8. The generated-UI iframe is not deployed in P0. Its retained P1 contract treats source and messages as untrusted across a separate opaque-origin boundary.

## Human authentication

- P0 provisions one owner account with a password hash supplied through deployment secrets.
- No public registration, invitation, password reset or test bypass in production.
- Login is rate-limited.
- Session cookie is Secure in production, HttpOnly and SameSite.
- Server stores only a hash of the session secret and supports revocation.
- Every state-changing endpoint checks expected Origin and CSRF token in addition to authentication and workspace role.
- Connector and approval actions require recent authentication.
- Production requires TLS.

## Service authentication

- Browser receives no TrueForge or Composio credentials.
- TrueForge is on localhost or a private network and requires an application service credential when remotely reachable.
- MCP URLs and headers live in the server secret store.
- Secret values are filtered from exception serialization and telemetry.
- Preflight reports presence and health, never values.

## Authorization and capability calculation

The model is never an authorization principal. Effective tool capability is the intersection of:

1. Workspace policy.
2. Channel grant.
3. Coworker grant or pinned version profile.
4. Exact connector binding and pinned account.
5. Literal AgentSpec enabled tools.
6. Per-call approval policy.

A connected account alone grants no capability. Unknown and newly discovered writes are unavailable.

AG-UI `RunAgentInput.tools`, state and forwarded properties are client claims, not authorization inputs. The server recomputes exact external tools, component tools, data functions and actions on every run.

Blocked P0 action classes:

- Payments.
- Permission or ownership changes.
- Production deployment.
- Bulk destructive operations.
- Unreviewed delete tools.

## Composio controls

- Use direct tools only; generic multi-execute is forbidden.
- Pin every toolkit to exact connected-account IDs.
- Disable multi-account fallback, Composio sandbox, remote bash, workbench and runtime write search.
- Preflight connection state before dispatch.
- Verify connector descriptor and compiled AgentSpec approval sets separately.
- Descriptor drift fails closed and stales pending proposals.
- OAuth expiry becomes `blocked_connection`; no alternate account is selected.
- Reconnect state is bound to the authenticated workspace session.

## Approval integrity

Each proposal binds:

- Channel, Run and RunStep.
- Persistent coworker lineage; P1-209 adds child-thread lineage before native subagents may be enabled.
- TrueForge tool-call ID.
- Connector, tool and observed descriptor hash.
- Exact pinned acting account.
- Canonical argument hash and extracted target.
- Referenced artifact revision.
- Session generation and approval-policy hash.
- Expiry.

The UI displays adapter-approved redacted fields, not model-authored summaries alone. Any bound-field change makes the proposal stale.

All required actions from one paused turn form one PauseGroup. Decisions and answers may arrive separately, but one database compare-and-swap creates one durable response intent only after all are resolved. The HTTP decision handler never calls TrueForge directly.

A lost resume response becomes uncertain. Reconcile against TrueForge turn history using application token, predecessor and response hash. Never blindly send a second resume.

## Prompt injection

Untrusted content may influence model output and cause a bad proposal. Prompts and approval do not prove benign intent.

Server-enforced guarantees:

- Model output cannot mutate stored instructions, grants, bindings or approval policy.
- Model output cannot expand the literal enabled-tool set or register MCP servers.
- Model-selected targets and payloads stay proposals until exact human approval.
- Model output cannot confirm memory or authorize itself.
- Without the required approval response, ForgeRoom does not permit the mutation call.

The same rule applies to UI output. In P0, only registered controlled components render; trusted host chrome and server authorization prevent model-authored labels or interaction requests from becoming authority. P1-506 adds the separate opaque-origin iframe guarantees before open-generated UI may ship.

## P1 native-subagent controls

P0 disables native-subagent creation and rejects unexpected child lineage. Before P1-209 enables it:

- Native subagents inherit parent tools and filesystem.
- Every inherited mutation remains approval-gated.
- Hard permission separation uses another persistent coworker session.
- UI actor identity comes from server and TrueForge lineage metadata.
- Count, cost and token watchdogs are best effort; do not describe them as hard provider limits.

## Sandbox and artifact controls

Keeping credentials out of Daytona does not prevent data exfiltration through open internet access.

P0 rules:

- Only synthetic or explicitly public input enters the sandbox.
- Sandbox-enabled coworker has no sensitive external-read tools.
- No sensitive content is copied through channel context or artifacts into Daytona.
- Production with sensitive data requires a network or provider outbound allowlist or disabled internet plus a reachability test.
- Artifact paths are normalized and confined to the expected sandbox root.
- Size and MIME type are checked before durable copy.
- Executable artifact HTML and script are never rendered directly; artifact previews use safe renderers or script-disabled sandboxed frames. The P1-506 open-generated UI renderer follows the separately gated controls below and never doubles as an artifact preview.
- Artifact download is authenticated and channel-authorized.

## AG-UI and controlled-component controls

- Pin one compatible pure AG-UI version set and reject mixed schema profiles at startup; optional CopilotKit must pass a separate coherent-graph parity gate or remain absent/disabled.
- Parse every outbound event and registered activity with checked-in schemas before persistence/broadcast.
- P0 has no `generate_open_ui` descriptor or source ingress; such calls/activities are rejected as unsupported before persistence or broadcast.
- Drop `RAW`, readable reasoning/thinking events, provider signatures and unknown events at the adapter.
- Persist before broadcast and bind each event to server-owned channel, logical thread, RunStep and actor metadata.
- Treat client-advertised frontend tools as renderer capability only; forged names/schemas grant nothing.
- Default-deny components. Effective render permission intersects publication, exact version, workspace, channel and coworker positive grants.
- Recheck component publication, version, descriptor hash and grant at call time; audit both allowed and refused calls.
- Keep render, data-function, interaction and external-tool grants distinct.
- Controlled React components accept validated plain data and never use `dangerouslySetInnerHTML`, `eval`, dynamic imports or model-selected modules.
- Component schemas bound depth, string length, object keys, rows, series, points, graph nodes/edges and total encoded bytes.
- Data functions are reviewed read-only adapters with channel authorization, field redaction, time/row/byte limits and no arbitrary query language.
- State and activity JSON Patch paths are allowlisted. They cannot address membership, grants, accounts, approval decisions, connector secrets or audit history.
- Registry image props carry authenticated artifact revision IDs, never raw URLs. The server authorizes channel/revision, decodes with no outbound fetch, enforces byte/pixel/decompression limits, strips metadata and re-encodes PNG/WebP. Original SVG, HTML and polyglots are rejected in P0. Any later external proxy must revalidate every redirect and DNS/IP hop, deny private/link-local/loopback ranges, send no cookies/auth/referrer, apply time/byte/pixel caps and retain only immutable re-encoded output.
- Trusted approval, connection and security-warning components are reserved host renderers and cannot be shadowed by generated names.

## P1 open-generated UI sandbox

P0 must not register/offer `generate_open_ui`, accept `iframe_v1`, create generated-document revisions/capabilities, deploy the generated origin or require any iframe table/profile/preflight. Unexpected iframe input receives a typed unsupported fallback. The controls below become mandatory only for P1-317/P1-506 and cannot be partially enabled.

P1 open-generated UI is an untrusted declarative document, not arbitrary JavaScript. The model may provide bounded HTML, CSS, a closed behavior manifest and a text alternative. Parser-based allowlists reject scripts, event attributes, every model-authored `javascript:`, `data:` or `blob:` URL, `src`/`srcset`/`href`, SVG/MathML/custom elements, forms/inputs/contenteditable, navigation, external resources, CSS URL/import and unreviewed properties. Nonempty `jsFunctions`/`jsExpressions` fail closed. Only a fixed, versioned, hash-pinned application bootstrap executes.

Private `generate_open_ui` CSS/HTML/behavior arguments are suppressed from `TOOL_CALL_ARGS`, activities, channel JSON and logs; browser events carry only the exact closed source-free setup/revision/progress/status/text/final-profile projections.

Required delivery and isolation:

- Serve a complete immutable revision from a dedicated cookieless generated-UI origin; never `srcdoc` or the application origin. Parse/classify/hash it, persist and recompute the closed RFC-8785-hashed RenderManifestV1, publish blobs, run the trusted headless gate against the exact response, then atomically commit the revision/current pointers/event. Browser `READY` is only a local-mount gate and cannot hold a detached run open or mutate server promotion.
- Use `sandbox="allow-scripts"`, `allow=""` and `referrerpolicy="no-referrer"`; never allow same-origin, forms, popups, modals, downloads, top navigation, presentation or storage access.
- Send response-header CSP with the exact normalized value `default-src 'none'; connect-src 'none'; img-src blob:; media-src 'none'; font-src 'none'; frame-src 'none'; child-src 'none'; worker-src 'none'; object-src 'none'; manifest-src 'none'; form-action 'none'; base-uri 'none'; script-src <exact-bootstrap-hash>; script-src-attr 'none'; style-src <exact-generated-style-hash>; style-src-attr 'none'; frame-ancestors <exact-app-origin>` and no trailing semicolon. Only the fixed bootstrap may create a blob URL, and only from server-decoded/re-encoded PNG/WebP bytes in the exact INIT binding manifest.
- Canonicalize the application-owned security-header profile as GeneratedUiDeliveryHeadersV1, hash it with RFC 8785 JCS and bind that hash plus the normalized CSP hash into the manifest and verifier evidence. Transport-managed Date/length/framing/server fields are outside the profile; they cannot override named values or add content encoding, forbidden CORS or cookies. The route disables compression, sends `Cache-Control: no-store`, no permissive CORS or Set-Cookie, nosniff and no-referrer. `generated-ui-permissions-v1` is the explicit deny list: `camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=(), hid=(), bluetooth=(), clipboard-read=(), clipboard-write=(), display-capture=(), fullscreen=(), autoplay=(), encrypted-media=(), publickey-credentials-get=(), screen-wake-lock=(), storage-access=(), web-share=(), xr-spatial-tracking=()`. If the generated origin or exact pinned profile is unavailable, disable iframe_v1.
- A member render capability is one-use and binds authenticated user/current membership, exact surface/revision/manifest, current delivery-security epoch, expiry and random ID. Redemption atomically consumes it and rechecks current membership/status, historical-replay block, epoch, retained body hash, body-index hash/ranges, extracted source hash and header hashes before bytes. Security tombstoning increments the epoch; an already-started response cannot be retracted, but every new redemption fails.
- Treat member render-capability and internal verifier-staging URLs as bearer secrets. Redact the raw path/query/header from application, generated-origin, CDN/proxy/access, exception, analytics and Playwright trace logs; retain only the route template, outcome and nonreversible correlation hash. Evidence scans must cover compressed traces and edge logs.
- The bootstrap implements only operation-budgeted tabs/toggle/filter/sort/select/resize and typed intents. It has no arbitrary expression, API, data-fetch, storage, navigation, package or provider helper.
- The producing logical session has a monotonic classification high-water mark covering all retained/compacted history, system/context envelopes, user input, tool output and native-subagent input. Once any restricted or unknown content enters, iframe_v1 remains disabled across TrueForge session rotations; a narrow current call/DataGrant cannot reset it. Every retained iframe DataGrant snapshot must also be synthetic/public. Credential-canary/classification scans run before persistence and delivery. The frame never receives credentials, raw external results, whole channel state, approval tokens, CSRF tokens or private answers.
- HTML contains validated binding placeholders only. The closed binding manifest names each node, safe sink, exact DataGrant/data_ref, literal field path and formatter. The bootstrap assigns `textContent`, safe ARIA text or a sanitized PNG/WebP object URL; generated source cannot inline data or choose a URL.
- Generated documents contain no free text inputs, files, credentials, payment/OAuth or approval controls. Sensitive or open-ended input uses trusted host React.

Mount handshake is `BOOT -> parent INIT -> READY`. The high-entropy mount nonce is per mount, known to the frame and reused with a monotonic message sequence; it binds source-window/revision but grants no authority. The host validates exact `contentWindow`, opaque-origin string `event.origin === "null"`, instance/revision/manifest, protocol, nonce, message type/schema and byte/rate limits. The only accepted P1 records are the closed direction-aware BOOT/INIT/READY/RESIZE/STATE_INTENT/INTERACTION_INTENT/CLIENT_ERROR schemas in `generative-ui.md`: BOOT is the only pre-INIT frame record, INIT the only host→frame record, READY is required exactly once at sequence one, and no other frame message is accepted until READY succeeds. Every intent's render node must belong to both the behavior target set and ActionGrant. Trusted parent code separately obtains a one-use server interaction token bound to user/channel/instance/revision/render-node/ActionGrant/input hash/expiry; the frame never receives or selects it.

Generated UI may request bounded local state, an exact retained DataGrant read, resolution of an exact durable component-input interrupt, an existing server-bound HITL card, or a host-confirmed normal agent turn. A confirmed turn uses a two-stage host-owned challenge flow: preparation returns no dispatch token; a CSRF-protected, recent-authenticated explicit host click records confirmer/time and atomically enqueues once. Component resolution creates only a structured internal continuation and never resumes a PauseGroup. It cannot create/decide an ActionProposal, answer a canonical Question, resume a PauseGroup, or call application/TrueForge/Composio/data APIs directly.

Every frame has permanent host chrome stating “AI-generated interface,” naming the coworker and exposing a text alternative. Generated pixels can imitate controls, so only host chrome is presented as authoritative. Enforce source/patch/message/revision/height/rate limits; DOM/accessibility verification occurs in a separate trusted headless verifier when used as a promotion gate. Parent watchdog/CPU observations are availability mitigations, not hard accounting claims.

Raw generated source necessarily passes through the configured model, TrueForge and possibly MCP transport before application ingestion. Application guarantees cover its own channel/AG-UI/browser/log/audit stores and disable source-body tracing under its control; deployment review must separately disclose and verify upstream retention, training and tracing settings rather than claiming a single global copy.

Partial source is bounded-memory data. If spill is unavoidable, it is per-assembly encrypted, excluded from backups/replication and has a 15-minute hard TTL. Failure, cancellation or timeout destroys the body/key and retains only safe counts/hashes/reason; success deletes pre-binding staging after publishing the access-controlled immutable final delivery body.

## Data minimization

ForgeRoom stores allowlisted normalized fields and hashes only. Strip:

- `reasoning_content` and private model reasoning.
- Provider signatures and opaque metadata.
- OAuth tokens, MCP headers and API keys.
- Arbitrary raw tool request or result bodies.
- Credentials accidentally entered into a question.

When the P1 experiment is enabled, open-generated source is retained only as an untrusted content-addressed replay blob after secret scanning and size validation. It is never logged, server-executed or included in prompts beyond its originating run. P0 has no such source or ingress.

Pending question answers and response payloads needed for crash reconciliation are encrypted, tightly access-restricted and deleted after the short recovery window. Audit views retain redacted summaries and hashes only.

TrueForge may retain replay state. Its storage, access, encryption and retention are configured as a separate trusted service; ForgeRoom does not claim the data is absent there.

## External write semantics

- One PauseGroup produces one application resume intent.
- A single application intent is not a generic exactly-once provider guarantee.
- TrueForge's remote MCP transport or the provider may retry under some failure modes.
- Provider idempotency is trusted only when the exact tool accepts and forwards a verified key or has deterministic set semantics.
- An ambiguous non-idempotent result becomes `unknown` and is never automatically retried.
- Reconciliation uses a reviewed allowlisted read.
- The demo uses a deterministic field/state update, not email or message creation, for its final write proof.

## Revocation and closure

- Grant, account, connector or policy restriction blocks queue claims and rotates the session.
- Old pending actions become stale.
- Active cancellation is best effort; an MCP call already executing may finish and must be recorded or reconciled.
- Archiving a channel blocks new messages, turns, proposals and resumes but cannot retract a provider call already in flight.

## Audit claims

The product provides append-only application audit history. It is not cryptographic proof of causation or tamper evidence.

- Source links are declared lineage.
- Hashes identify captured payloads relative to the trusted database.
- A generic MCP response is not called a provider receipt unless its ToolPolicyDefinition verifies it.
- P1 may add hash chaining, signatures, external anchoring and independently verified receipts.

## Reliability posture

- Channel commands and event appends use database transactions.
- Provider stream ingestion is at least once with deduplication.
- Browser channel SSE resumes by channel sequence.
- AG-UI full replay and compacted snapshot replay produce the same messages, activities, UIInstances and shared-state revision.
- Process restart never automatically reissues an uncertain normal or resume turn.
- Pending approval survives restart without execution.
- Tool drift, auth expiry and unknown outcomes fail closed.

## Mandatory security evidence

Release evidence must show:

- Unauthenticated, forged-Origin and missing-CSRF approvals rejected.
- Cross-channel reads denied.
- Unapproved mutation provider call count is zero.
- Concurrent allow/deny yields one decision and one resume intent.
- Mixed approvals/questions yield one response-only turn.
- Lost resume response is reconciled, not resent.
- Grant revocation rotates session and stales proposals.
- Descriptor drift fails startup.
- Unexpected child-thread/native-subagent lineage fails closed in P0; Code Mode writes still pause.
- Open sandbox egress is detected and blocks sensitive-data readiness.
- Audit export contains no fixture secrets or reasoning.
- Official AG-UI client parses the pinned conformance stream; malformed/unknown events fail closed.
- Forged frontend-tool schemas and security-sensitive state patches cannot expand grants.
- Component revocation between offer and call is refused and audited.
- Controlled-component XSS payloads render as inert text.
- P0 has no generated-UI route, source ingress, iframe rail or render capability; unexpected `iframe_v1` input fails closed. P1-506 owns parser/CSP/fixed-bootstrap/opaque-origin and `postMessage` evidence before that experiment can be enabled.
- Forged/replayed controlled-component interaction tokens, stale UIInstance revision and unregistered intent are rejected.
- Generated fake approval pixels carry no authority and cannot submit a decision; the trusted host card remains the only approval surface.
- Oversized controlled chart/table input and patch flood quarantine only the offending P0 instance. P1-506 separately owns graph/source/iframe-resize abuse containment evidence.
