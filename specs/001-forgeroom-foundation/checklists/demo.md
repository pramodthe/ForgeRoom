# Hackathon demo readiness checklist

## Contract freeze

- [ ] All `TBD` fields in `demo.md` are resolved.
- [ ] Exact tool slugs and descriptor hashes match live Composio session.
- [ ] Connected accounts are pinned and redacted identifiers recorded.
- [ ] Deterministic write and reconciliation read are proven manually.
- [ ] Fixture reset runs twice without duplicate or production data changes.
- [ ] Coworker Builder prompt produces the exact read-only draft/denials and confirms safely.
- [ ] Artifact storage survives the intended demo deployment lifecycle.
- [ ] Exact stable pure AG-UI matrix passes P0-210; optional CopilotKit is absent/disabled unless its separate parity probe passes.
- [ ] Controlled DataTable/chart/TaskCard/ArtifactCard props and bounded interaction are deterministic and polished.
- [ ] Fixed Task and Save-as-skill manifests/reset data are locked.

## Product path

- [ ] Login and seeded workspace work from a clean browser.
- [ ] Channel starts with one seeded coworker and adds the reviewed conversational coworker without exceeding two active demo coworkers.
- [ ] Recipient/tool preview is readable before send.
- [ ] Two persistent lanes run concurrently.
- [ ] Application-owned TaskRecord appears with source, status, assignee and revision.
- [ ] Real Composio read shows a safe receipt.
- [ ] Real read becomes an inline controlled DataTable/chart with accessible data view.
- [ ] Authenticated image/artifact component renders inline.
- [ ] One bounded interaction visibly updates shared state or continues the logical turn through AG-UI.
- [ ] Daytona produces a useful durable artifact.
- [ ] Approval card shows fixed account, exact target, redacted arguments, effect and expiry.
- [ ] Browser refresh restores the pending proposal.
- [ ] Approval reaches expected deterministic provider state under read reconciliation.
- [ ] Completed Run saves as a reviewed immutable private skill and attaches without new authority.
- [ ] Receipt traces declared source, coworkers, Task, skill, artifact, approval and result.
- [ ] Refresh restores identical controlled UI version, props, data and state hashes without regeneration.
- [ ] Receipt also links the rich UI instances and interactions.

## Presentation quality

- [ ] Preflight is green and contains no secrets.
- [ ] 1440 px layout shows coworkers, current work and required action together.
- [ ] No raw JSON, debug overlay, personal notification or unrelated browser tab appears.
- [ ] DataTable/chart/Task/Artifact/ChoiceForm look intentional at 1440 px and do not cause layout jumps.
- [ ] Only the separate trusted host card is presented as authoritative approval UI.
- [ ] Scenario is described as a demo inside a general AI coworker workspace.
- [ ] Three-minute timing has been rehearsed successfully at least three times.
- [ ] Fallback footage is labeled if used.
- [ ] Setup README and required review evidence are linked.

## Automated safety branches

- [ ] Denial/no-mutation test passes.
- [ ] Duplicate-resume test passes.
- [ ] API-restart approval persistence passes.
- [ ] Descriptor drift and account-expiry tests pass.
- [ ] Session-rotation and sandbox-egress tests pass.
- [ ] AG-UI conformance, forged component, invalid patch and rich replay tests pass.
- [ ] Iframe/open-generated feature absence plus CoworkerDraft/Task/skill overgrant and forgery tests pass.
