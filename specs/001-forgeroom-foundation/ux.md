# ForgeRoom 0.1 UX specification

| Field | Value |
| --- | --- |
| Status | Canonical P0 UX contract |
| Requirements | CH-001–CH-006, CH-009–CH-011, AG-006–AG-012, RUN-004–RUN-007, RUN-009, AGUI-001–AGUI-009, GUI-001–GUI-014, TR-001–TR-003, SK-001–SK-003, TL-011, AP-004, ME-003 |
| Primary viewport | 1440 px desktop demo |

## Experience principle

The interface is a calm, visual channel workroom. It is not a terminal, a raw agent trace, or a Slack clone with bot messages pasted into it. Coworkers communicate with concise text, a controlled live chart/table, a TaskCard, an artifact/image or a bounded form. A viewer should understand who is working, on what, with which tools, and what needs human action without reading provider logs.

## P0 navigation

1. Channels
2. Tasks
3. Coworkers
4. Skills
5. Connections

Approvals and run details stay inline or in drawers. P0 has no dedicated dashboard, approvals inbox, cross-run search, audit application, or settings hierarchy.

Routes:

~~~text
/login
/w/:workspaceId/channels/:channelId
/w/:workspaceId/tasks
/w/:workspaceId/tasks/:taskId
/w/:workspaceId/coworkers
/w/:workspaceId/coworkers/:coworkerId
/w/:workspaceId/skills
/w/:workspaceId/skills/:skillId
/w/:workspaceId/connections
~~~

## Channel workroom

The desktop view has three panes:

- Left: channel list, selected channel, unread or active-run indicators.
- Center: channel timeline, structured work cards, composer.
- Right: Work panel with Work, Artifacts, and Context tabs.

At 1440 px the view must show:

- Selected channel and both coworker states.
- Current assignment or latest result.
- Any pending human decision.
- Composer recipient preview.

The center reading column should remain roughly 720–820 px. Side panes are visually quieter and may collapse at narrower widths, but a mobile-optimized product is not P0.

## Channel header

Show:

- Channel name.
- Coworker roster with availability and current assignment.
- Active and blocked Run counts.
- Connector health.
- Noninteractive fixed service-account badge.
- Add existing coworker and New coworker controls.

The service-account badge must never look like a per-user account picker.

## Composer and recipient resolution

Supported P0 input:

- Plain text.
- One `@coworker` mention.
- Multiple explicit coworker mentions.
- `@team`.
- Assign as task.
- Stop and correct.
- Save a completed run as skill from its menu, not as an ambiguous composer side effect.

P0 does not support human file attachments.

Before send, show:

- Exact recipient names.
- Whether routing is direct or two-coworker team fan-out.
- Concise effective-tool summary for each recipient.

Block send when:

- A handle is unknown, disabled, or not in the channel.
- `@team` has more than two enabled coworkers.
- A multi-coworker channel has no explicit recipient.
- A recipient is being rotated or is otherwise unavailable for new work.

Sending a normal message never implicitly stops current work.

## Coworker roster and editor

Each roster row and directory card shows:

- Avatar, name and role title.
- Available, queued, busy, needs you, cancelling, disabled, or offline.
- Current assignment.
- Exact connected tools in a disclosure.
- Last active time.

The P0 editor includes only:

- Name and handle.
- Role title and standing instructions.
- Model preset.
- Exact tool grants.
- Exact private skill bindings.
- Controlled component grants.
- Sandbox and GenUI toggles; native subagents are visibly unavailable in P0.

Saving a capability-affecting edit communicates that the coworker's channel sessions will rotate and pending proposals may become stale.

### Conversational creation

**New coworker** opens an application-owned builder conversation. It accepts a natural-language job, then shows a trusted review containing name/role/instructions, model, channels, exact tools and acting account, private skills, components, TaskRecord scope/grants, sandbox, budgets, read/write/destructive effects, approval rules, unavailable requests (including P0 knowledge/memory/workflow/native-child denials) and data-leaving-workspace notice. The Create button binds the displayed immutable draft revision. Ordinary coworker text never impersonates this confirmation. Provisioning, failure/retry and ready states are visible.

## Timeline content

Human and coworker messages use stable visual identities. P0 has no visible native-subagent or coordinator lane.

Typed cards are required for:

- Direct assignment.
- Persistent-coworker handoff or result.
- Application-owned Task creation/update.
- Tool proposal and safe receipt.
- Sandbox creation and command state.
- Artifact.
- Clarifying question.
- Approval request.
- Blocked connection.
- Cancellation and uncertain external result.
- Error or partial completion.
- Final Run receipt.

Rich response renderers are required for:

- DataTable with bounded local sort/filter and accessible table behavior.
- One bar/line chart family with synchronized data-table fallback.
- TaskCard/TaskList backed by authoritative TaskRecord revisions.
- ArtifactCard backed by authenticated artifact revisions, including a safe image preview when available.
- Model-authorable bounded ChoiceForm plus server-only RequiredQuestion/HITL components.

These components appear inline in the coworker's message lane and may be the primary answer. They are not relegated to the Artifacts tab.

Do not render raw provider JSON in the primary path. Advanced disclosures may show only safely normalized and redacted fields.

## In-chat generative UI

Every rich response shows:

- Coworker identity.
- AI-generated or reviewed-component label.
- Component title and concise text alternative.
- Live status: preparing, streaming, ready, waiting for input, refused, stale, incompatible or failed.
- Source/artifact links where the component visualizes stored data.
- Replay/version indicator in a quiet disclosure, not as primary chrome.

Component tool-call argument fragments never flash as JSON. Show a stable skeleton until enough validated data exists. Controlled components may progressively reveal complete series/rows; partial invalid props never enter the renderer.

Each renderer is contained by an error boundary. Failure replaces only that instance with its text alternative, Retry rendering control and technical reference ID. It never removes the transcript or trusted approval controls.

## Controlled component behavior

- Charts use stable semantic colors, human-readable axes, useful empty states and a “View data” table.
- Artifact/image components accept artifact IDs/revisions, not arbitrary model URLs. Show alt text, creator, MIME type and download/open control through the authenticated API.
- Tables cap visible rows, virtualize only when needed and expose a downloadable artifact when the full dataset is larger.
- Model-authored ChoiceForms use labels, descriptions, finite/enum/date controls and explicit Submit/Cancel. Free text and sensitive/open-ended input use the trusted channel composer or a canonical RequiredQuestionCard. A submitted form becomes a visible channel event.
- Choice and HITL components state whether the answer merely informs the agent or requests a real action.
- Backend Composio/TrueForge tools use reviewed renderers and a generic safe fallback; their cards are not mistaken for frontend component calls.
- Choice/filter state is revisioned and replays after refresh. It may resolve only the exact associated component interrupt and cannot approve, resume unrelated work or call an external tool.

## P1 open-generated UI behavior

This section is retained for P1 design and is absent from every P0 route, tool, preflight and release gate.

The open-generated widget is visually distinct but feels native to the timeline:

1. Reserve the declared initial height to avoid layout jumps.
2. Show “Generating interface…” and a reduced-motion-safe skeleton.
3. Update only source-free phase/count/status progress while the private assembler validates CSS, HTML and constrained behavior in protocol order; never inject or reveal partial source.
4. Auto-resize through the trusted host bridge within configured min/max height.
5. Mark it server-ready only after immutable publication, trusted verification and atomic promotion; replace a browser's local mount only after its BOOT/INIT/READY handshake.
6. Persist and replay the exact source/delivery-body/manifest/profile hashes and shared state on refresh.

The frame contains no browser chrome suggesting a normal website. P1 documents contain no generated script, navigation/input/external-resource surface, and the fixed bootstrap exposes no network, storage, download, popup, clipboard/camera/microphone or protected-API helper. When an interaction is supported, the iframe emits a descriptive intent such as `select_node` or `change_filter`; the host supplies any form or consequential next step in trusted React UI.

Open-generated UI always has a View text alternative control. If JavaScript is disabled, source is quarantined, the renderer version is unavailable or the frame fails, that alternative is the complete answer.

## P1 components screen

There is no P0 component-catalogue route. Exact controlled-component grants and their session-rotation impact appear inside the coworker draft/editor review.

P1 provides a governed, mostly read-only catalogue rather than a full code editor:

- Name, kind, stable version and model-facing description.
- Live preview using checked-in sample props.
- Published/revoked state and descriptor hash.
- Which coworkers hold the render grant.
- Declared server data reads and interaction intents.
- Grant/revoke control for the owner, with affected session rotations stated before save.

Reusable runtime component authoring, source editing and draft/publish workflow remain later work. Per-response open-generated UI does not create a reusable catalogue entry.

## Work panel

### Work

- Active and queued assignments grouped by persistent coworker.
- Run-level summary counters for running, awaiting input, awaiting approval, blocked connection, and queued steps.
- Stop control for the Run and each active persistent step.
- Authoritative TaskRecords linked to their source messages/Runs, with revision, assignee, status and allowed transitions.

### Artifacts

- Durable artifact cards with preview, name, MIME type, revision, creator and source step.
- Download action through the authenticated application API.
- Clear unsupported-preview state.

### Context

- Current bounded channel summary.
- Pinned messages and artifacts with source links.
- Pin and unpin controls.
- No editable hidden memory or cross-channel data in P0.

Rich components may read only the state and data functions declared by their registry version. Context tab never exposes hidden component state or executable source.

## Save as skill

Completed Run menus expose **Save as skill**. The trusted review shows when to use it, inputs, procedure, validation, output, no/stale-data behavior, required tools/components and approval boundaries plus source Run lineage. The owner edits a draft, publishes immutable version 1 and explicitly attaches it to one coworker. Publication/attachment/provisioning states and session rotation are visible. P0 has no marketplace, imported scripts/assets, public sharing or broad catalogue management.

## Approval card

The approval card is generated from the reviewed ToolPolicyDefinition and server-normalized arguments. It shows:

- Requesting persistent coworker.
- Exact service, tool and observed descriptor hash.
- Fixed connected account and acting identity.
- Target or recipient.
- Safely redacted arguments.
- Data leaving the workspace, where defined by the adapter.
- Expected effect and risk class.
- Referenced artifact revision.
- Expiry and payload hash.

Actions:

- Approve once.
- Deny with optional reason.
- Request changes, which denies the immutable proposal and opens a correction message.

One click records a decision only. It does not directly create a TrueForge turn from the HTTP request. The worker resumes only after the complete PauseGroup is resolved and atomically claimed.

The approval card is always trusted host React UI. P0 controlled surfaces cannot open, create or decide a proposal; approvals appear only from the canonical RequiredAction/ActionProposal projection. The P1 experimental iframe may request that the host open one exact existing server-bound card only after its separate grant/conformance gate. Generated pixels may imitate a button, so permanent untrusted labeling and separate host chrome—not visual inspection of pixels—identify authority; P1 height/stacking limits prevent a frame from covering the real card.

## Question card

- Clearly identify the requesting persistent coworker; P0 has no child-thread requester.
- Show one bounded prompt.
- Warn the user not to paste passwords, API keys, or OAuth credentials.
- Store the pending answer encrypted until the response-only resume is confirmed.
- If approvals and questions share a PauseGroup, show that all items must be resolved before work continues.

## Run detail drawer

Show:

- Goal and source message.
- Direct routing mode and resolved recipients.
- Persistent RunSteps and current state.
- No coordinator or native-subagent lane in P0.
- Normalized event timeline.
- Tool and sandbox summaries.
- Approvals and questions.
- Artifacts and revisions.
- Current failure, cancellation, or unknown-outcome explanation.
- Safe final receipt.

Full retry history, standalone inspector, and cross-run search are P1.

## Connections screen

P0 is a fixed-account status surface, not account management:

- Acting service identity.
- Toolkit connection state.
- Granted scopes.
- Exact direct-tool names and descriptor hashes.
- Last verification time.
- Test action.
- Reconnect action using a Composio Connect Link.

It cannot browse the full catalog, add another acting account, switch identity, or expand grants.

## Required states

- Empty workspace and empty channel.
- Queued, planning and running.
- Awaiting question or approval.
- Blocked connection.
- Reconnecting stream.
- Missing or expired connector.
- Permission denied.
- Cancelling with an external call settling.
- Cancelled.
- Sandbox unavailable or timed out.
- No artifacts and unsupported preview.
- Partial and failed.
- Unknown external-write outcome.
- Stale approval.
- Session rotating.
- Completed with receipt.
- Component preparing, streaming and waiting for input.
- Component grant revoked between offer and call.
- Component schema/version mismatch.
- AG-UI state/activity resynchronizing after a bad or missed patch.

## Visual system

- Neutral ink or slate base and one restrained product accent.
- Stable per-coworker accent tokens with AA contrast.
- Typography and spacing create hierarchy before borders.
- Cards share icon, status, owner, time, and disclosure placement.
- Avoid rainbow agents, equally loud boxes, dense trace logs and continuous shimmer.
- Stream text in place without layout jumps.
- Approval is the highest-contrast temporary state; ordinary reads are not alarming.
- Artifact previews are visually prominent and always show creator and source.
- Rich response cards share the product typography, spacing, radii and status language; generated content cannot redefine host chrome.
- Charts, tables, Tasks and artifact/image cards receive deliberate space and may span the center reading column.
- Use progressive skeletons without continuous shimmer or height thrashing.

## Accessibility

- WCAG AA color contrast.
- Visible keyboard focus.
- Keyboard access to navigation, composer, tabs, Run controls, questions and approval actions.
- Live regions announce important state changes without reading every token delta.
- Identity uses text and icon, not color alone.
- Reduced-motion mode disables decorative streaming and lane animation.
- Approval and denial actions use explicit labels, not icon-only controls.
- Every chart has a screen-reader summary and table alternative.
- Images require meaningful alt text or an explicit decorative marker.
- Streaming updates do not repeatedly steal focus or announce every patch.

## UX acceptance

- A first-time viewer can name both coworkers, their current work and the pending human action within ten seconds.
- Recipient and tool previews are visible before send.
- A first-time owner can create a read-only coworker from natural language and understand every effective/denied permission before confirming.
- Refresh restores the same pending decision and timeline position.
- A first-time viewer can discover the Task, chart/table and artifact response without opening a debug view.
- A controlled visualization and bounded interaction survive refresh with identical component/data/state hashes.
- A bad component or invalid patch degrades to its text alternative without breaking the channel.
- A completed Run can be saved as a reviewed immutable skill and attached without gaining new authority.
- No credential, private reasoning, or raw provider payload appears in UI or screenshot evidence.
