# ForgeRoom 0.1 test plan

| Field | Value |
| --- | --- |
| Status | Canonical P0 verification contract |
| Unit runner | Vitest |
| Browser runner | Playwright |
| Release rule | No skipped P0 security or E2E test |

Testing is part of each feature task. The final verification phase aggregates and reruns coverage; it does not postpone tests.

## Test layers

### Unit

Required suites:

- Channel sequence allocation and event ordering.
- Mention parsing, recipient resolution and ambiguous-recipient rejection.
- Direct one/two-recipient fan-out and recipient membership validation; coordinator input is unsupported.
- CoworkerDraft structured output, literal catalogue resolution, permission diff, stale revision and idempotent confirm.
- TaskRecord schema, field/transition grants, revision/history/provenance and idempotency.
- SkillDraft extraction/redaction, immutable SkillVersion hash, requirement intersection, binding and session rotation.
- Effective capability intersection.
- SessionRevision and approval-policy hashing.
- ToolPolicyDefinition descriptor validation, target extraction, redaction, preview, idempotency and receipt validation.
- Canonical argument normalization and hashing.
- Run, RunStep, AgentTurn, PauseGroup and ActionProposal transition guards.
- TrueForge delta merging and normalized event redaction.
- TrueForge-to-AG-UI mapping, lifecycle ordering and pinned-schema parsing.
- Multi-coworker AG-UI attribution; native-subagent activity is unsupported in P0.
- `STATE_SNAPSHOT/DELTA` and `ACTIVITY_SNAPSHOT/DELTA` RFC 6902 application/resync.
- Component manifest/descriptor hashing, positive-grant intersection and call-time revocation.
- Controlled DataTable/chart/TaskCard/ArtifactCard/ChoiceForm prop schemas, row/series/image/source limits and text fallbacks.
- UI interaction schemas, revision compare-and-swap and one-use server interaction-token behavior.
- UIComponentInterrupt CAS/idempotency, exact-generation queue binding and structured continuation never write PauseGroup rows.
- Channel context envelope and cross-channel exclusion.
- Artifact path normalization, MIME policy and content hashing.

### Database and API integration

- Empty-database migrations and seed idempotency.
- Unique channel sequence under concurrency.
- One remote-active AgentTurn constraint.
- Queue FIFO, priority and expired lease reclaim.
- One PauseGroup per turn, one RequiredAction per provider action and one PauseResume per group.
- Concurrent allow/deny records one decision.
- Auth session, logout revocation, Origin and CSRF enforcement.
- Channel and artifact authorization.
- SSE replay from `Last-Event-ID` without gaps or duplicate rendering.
- Stable logical AG-UI thread across TrueForge session rotation.
- AG-UI event persistence before broadcast and full-versus-compacted projection equivalence.
- Component/version uniqueness, default-deny grants and render/data/action grant independence.
- UIInstance revision uniqueness, interaction idempotency and concurrent state compare-and-swap.
- Interactive component reconnect resolves one durable interrupt and starts one same-RunStep continuation wire run; duplicate/stale input starts none.
- CoworkerDraft/Task/skill rows, unique revisions/hashes, stale/CAS behavior and atomic audit/channel event writes.

### TrueForge integration

- Separate session per channel and persistent coworker.
- Two messages to one busy session do not cancel the first.
- Different coworker sessions run concurrently.
- Deterministic application token and explicit predecessor on create.
- Lost create response reconciles from turn history.
- `turn.done` with required actions closes AgentTurn but not RunStep.
- Mixed approvals and questions create one response-only resume.
- Resume payload never includes a normal message.
- Stop enters cancelling and correction queues separately.
- Session rotation stales old proposals and does not migrate responses.
- Compiled P0 AgentSpec disables TrueForge native subagents; unexpected child activity is safely rejected/diagnosed.
- Browser stream reconnect produces no duplicate application event.
- Every emitted event parses with the exact pinned AG-UI schema and every run has one terminal event.
- `RUN_FINISHED` with interrupt outcome leaves the application RunStep nonterminal.
- Component frontend-tool calls may span several AG-UI wire runs without ending the logical turn.

### Composio integration

- Exact pinned service account is used.
- Only checked-in direct tools appear.
- Meta-execute, remote bash, workbench and dynamic write discovery are absent.
- Connector descriptor drift fails startup.
- Compiled AgentSpec approval set is verified separately.
- Real selected read returns an adapter-normalized safe receipt.
- Account expiry becomes `blocked_connection`, never fallback.
- Deterministic selected update cannot begin before approval.
- Changed payload makes the old proposal stale.
- Unknown write result is read-reconciled without blind retry.

### Daytona and artifacts

- Sandbox creates and streams normalized activity.
- Application and Composio credentials are absent in the sandbox.
- Fixture produces one file.
- Path traversal, oversized file and disallowed MIME are rejected.
- Published artifact survives sandbox teardown.
- Identical content publish is idempotent.
- Active HTML or script does not execute in preview.
- Outbound internet reachability is measured; open egress blocks sensitive-data readiness.

### AG-UI and generative UI

- Official AG-UI client consumes the authenticated per-coworker run endpoint without a fork.
- Two top-level coworker streams interleave in the channel envelope without message/tool/activity ownership loss.
- Controlled DataTable, bar/line chart, TaskCard, ArtifactCard and ChoiceForm tools render from complete server-validated props.
- Revocation between tool offer and call produces a refused component and no data-function access.
- Unknown component/version/activity and renderer exceptions produce inert text fallbacks.
- Table/chart/image limits have boundary, one-over and aggregate tests; oversized payloads never persist.
- Image components reject arbitrary URLs, cross-channel artifact IDs, spoofed MIME and unsafe SVG.
- Refresh replays exact controlled component/version/props/data/state hashes without rerunning the model.
- Interaction gateway rejects wrong channel, instance, revision/manifest, one-use server token, input hash, intent schema, ActionGrant, expiry or state revision.
- `generate_open_ui`, `iframe_v1`, `open-generative-ui`, generated-origin and render-capability requests are absent/unsupported in P0.
- Generated fake approval-like controlled content carries no authority and cannot call the decision API.
- Charts expose a data-table fallback, images alt text and forms complete labels/errors.

## Security acceptance matrix

| ID | Scenario | Expected result |
| --- | --- | --- |
| SEC-001 | New channel with no grants | Zero external capability |
| SEC-002 | Coworker granted one read calls another tool | Server and AgentSpec reject |
| SEC-003 | P0 AgentSpec or unexpected provider event attempts native child work | Native subagents remain disabled; unexpected event grants/executes nothing |
| SEC-004 | Channel A requests Channel B state | Not found or forbidden; no leakage |
| SEC-005 | Non-owner or unauthenticated approval | Rejected |
| SEC-006 | Missing/stale/forged CSRF or forged Origin on any mutation, including pure AG-UI and the optional `/api/copilotkit` POST when enabled | Rejected before human message/Run persistence |
| SEC-007 | Mutation before approval | Provider call count remains zero |
| SEC-008 | One payload byte changes | Old approval becomes stale |
| SEC-009 | Approval replay | No second decision, PauseResume or application attempt |
| SEC-010 | Simultaneous allow and deny | One stored decision only |
| SEC-011 | Expired proposal, revoked connector or archived channel | Resume blocked |
| SEC-012 | Malicious document asks for exfiltration | May influence proposal, cannot expand grants or self-authorize |
| SEC-013 | Malicious artifact contains script | Script does not execute or invoke command |
| SEC-014 | Descriptor changes | Startup fails and proposal stales |
| SEC-015 | Write times out ambiguously | `unknown`, no automatic retry, read reconciliation |
| SEC-016 | API process restarts while awaiting approval | Proposal persists, no execution |
| SEC-017 | Resume response is lost | History reconciliation, no blind second resume |
| SEC-018 | Grant is revoked | Queue blocked, session rotated, old proposal stale |
| SEC-019 | Code Mode calls a write | Same exact approval pause occurs |
| SEC-020 | Composio account expires | `blocked_connection`; no alternate account |
| SEC-021 | Sandbox has open egress | Production-sensitive readiness fails |
| SEC-022 | Audit export inspected | No credentials, reasoning or fixture secret |
| SEC-023 | Browser advertises forged component tool | Effective component set unchanged |
| SEC-024 | Component revoked after run start | Call-time refusal, audit row, no data read |
| SEC-025 | Component has render but no data-function grant | Renderer may mount; server data read denied |
| SEC-026 | AG-UI state patch targets grant/approval/account path | Patch rejected and fresh safe snapshot sent |
| SEC-027 | Malformed or unknown AG-UI event/activity | Not persisted/broadcast; safe diagnostic only |
| SEC-028 | Controlled props contain script/HTML/prototype keys | Inert text or schema rejection; no execution |
| SEC-029 | Image references remote/cross-channel/SVG/HTML/polyglot source | Reject; authorized raster input is decoded with caps, metadata-stripped and re-encoded PNG/WebP |
| SEC-030 | Model/client requests `generate_open_ui`, `iframe_v1`, open-generated activity or generated-origin capability | Typed unsupported/fallback; no descriptor, persistence, origin response or capability exists |
| SEC-031 | CoworkerDraft asks for unavailable/broader tools/accounts or is confirmed after catalogue/policy change | Exact denials or stale draft; zero broadened grants/partial coworker |
| SEC-032 | Task tool changes an ungranted field/transition or stale revision | Rejected; no TaskRevision/channel event |
| SEC-033 | Skill drafting attempts an inherited tool, MCP, Composio or external-application provider mutation, or draft/package contains credential, raw reasoning/tool body, executable content or missing capability | Dedicated structured drafting path makes zero such calls while allowing pinned model inference; unsafe content is redacted/rejected and publish/attach cannot expand authority |
| SEC-034 | Choice/filter tries to approve, resume unrelated work or call external tool | Rejected; only its exact component interrupt/state may resolve |
| SEC-035 | Controlled UIInstance replay after component/data grant change | Exact committed safe snapshot or inert fallback; no model rerun/duplicate interaction |

## Browser end-to-end scenario

One Playwright scenario must:

1. Authenticate as the seeded owner.
2. Open a channel with one seeded coworker.
3. Use the trusted builder prompt to create a read-only Research coworker; review exact denials and confirm.
4. Send one Task to both coworkers and observe one authoritative TaskRecord plus two concurrent lanes.
5. Observe the selected real Composio read in a controlled DataTable/bar-or-line chart.
6. Interact with one bounded ChoiceForm/filter and observe persisted AG-UI state/continuation.
7. Observe Daytona create a durable artifact rendered by ArtifactCard.
8. Reach the deterministic write approval in trusted host UI.
9. Deny and verify provider state is unchanged.
10. Request the changed action again.
11. Refresh while awaiting approval and restore the exact Task, proposal and controlled UI state hashes.
12. Approve the exact proposal.
13. Read-reconcile the expected provider final state.
14. Save the completed Run as a reviewed immutable private skill and attach it to the originating coworker.
15. Open the safe audit receipt and verify declared lineage.

The test uses stable `data-testid` only for elements without a good accessible role/name. It must not use fixed sleeps for streamed state.

## Visual verification

Capture at 1440 px:

- Empty channel.
- Two coworkers running.
- Coworker creation/permission review and provisioning states.
- Approval card with service-account badge.
- Reconnecting state.
- Artifact preview.
- Controlled DataTable/chart with accessible fallback, TaskCard and ArtifactCard.
- Interactive form/filter plus trusted approval boundary.
- Save-as-skill review and attached state.
- Partial or failed state.
- Final receipt.

Review for hierarchy, clipping, raw JSON, contrast, focus, layout jumps and actor confusion.

## Release commands

Exact package scripts are created by P0-101. The clean-clone contract is:

~~~bash
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm test:security
pnpm test:e2e
pnpm build
~~~

Provider-backed suites may require an explicit environment flag and demo credentials, but release evidence must include one successful live run. Mock-only success is insufficient.

## Evidence

For every suite, retain:

- Command and exit result.
- Test report path.
- Redacted integration trace or verified provider receipt where applicable.
- AG-UI conformance fixture and controlled UIInstance component/data/state hashes.
- Screenshot paths for visual checks.
- Fixture reset evidence.

Never retain OAuth headers, cookies, raw provider payloads, passwords, private reasoning or unredacted external data.
