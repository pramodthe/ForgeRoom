# Provider and demo fixtures (P0-000)

Safe, reproducible contract inputs for the ForgeRoom 0.1 demo. Credentials never live here.

## Verification status labels

| Label | Meaning |
| --- | --- |
| `frozen` | Documented P0 choice; implementation must honor it |
| `candidate` | Preferred value pending live probe or P0-210 selection |
| `blocked-on-secrets` | Requires human-provisioned credentials / live provider access |
| `verified` | Live probe succeeded and evidence is attached to P0-000 |

Do not invent `verified` rows. Promote a `candidate` only after a redacted probe.

## Layout

```text
provider-fixtures/
  p0-feature-profile.json          # frozen P0 disables
  ag-ui/                           # package candidates + CopilotKit policy for P0-210
  run-limits.candidate.json
  deployment-topology.candidate.json
  artifact-storage.candidate.json
  composio/                        # apps/slugs/accounts/hashes (mostly blocked-on-secrets)
  coworkers/                       # seeded + conversational draft fixtures
  tasks/                           # TaskRecord + Save-as-skill fixtures
  controlled-ui/                   # DataTable/chart/Task/Artifact/ChoiceForm props
  daytona/                         # sample sandbox artifact candidate
  LIVE_PROBE_CHECKLIST.md          # human secrets + probe checklist
```

## Ownership

- P0-000 freezes structure, feature profile, AG-UI candidates/policy, and safe synthetic fixtures.
- P0-105 seeds application DB rows from these fixtures.
- P0-210 selects the exact `@ag-ui/*` lockfile graph.
- P0-301+ / live probes fill Composio/Daytona/TrueForge verified fields.
