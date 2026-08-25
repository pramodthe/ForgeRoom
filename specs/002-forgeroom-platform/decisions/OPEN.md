# Open product and platform decisions

Only choices that materially alter contracts or release work belong here. Every decision has an owner before implementation and closes through an ADR/spec update.

| ID | Decision | Blocks | Required evidence |
| --- | --- | --- | --- |
| PD-001 | Trademark/domain clearance for the confirmed ForgeRoom name | Public launch branding only | Trademark/domain search and founder/legal approval |
| PD-002 | Confirm Apache-2.0 core license and any hosted/commercial boundary | P0-505 and first public release | Dependency/license review, committed LICENSE/NOTICE, founder/legal approval |
| PD-003 | Supported identity providers and local-auth posture for 0.2 | P1 identity tasks | Threat model, self-host setup, logout/revocation/MFA tests |
| PD-004 | Object-storage and search/vector reference implementations | P1 knowledge/self-host tasks | Persistence, isolation, backup/restore, load and license evidence |
| PD-005 | File scanners/parsers/OCR providers and supported deployment profiles | P1 knowledge tasks | Format corpus, isolation, retention/privacy, failure and license review |
| PD-006 | Email/browser-push providers and safe external notification contents | P1/P2 notifications | Delivery/retry/privacy/opt-in tests |
| PD-007 | Record-schema closed field set and migration compatibility classes | P1 records | Schema fixtures, migration/rollback review |
| PD-008 | Workflow schedule library, recurrence subset, DST/misfire defaults | P2 workflow tasks | Standards/zone corpus, duplicate/failover tests |
| PD-009 | Webhook signature schemes and first provider event adapters | P2 triggers | Official provider fixtures and replay/rotation tests |
| PD-010 | Extension package format, registry, signing and trust governance | P2/P3 ecosystem | Threat model, manifest fixtures, install/revoke tests |
| PD-011 | Hosted tenancy topology, regions, encryption-key hierarchy, billing/quotas | P3 hosted release | Architecture/security/load/cost review |
| PD-012 | SSO/SCIM and enterprise external-policy/ABAC integration scope | Optional P3 enterprise identity | Protocol/authorization/migration tests |
| PD-013 | Supported connection adapters, OAuth redirect/secret storage profile and descriptor normalization for 0.2 | P1 connection tasks | Official adapter fixtures, two-account isolation, callback/revocation/drift tests and license review |
| PD-014 | Closed 0.3 custom-role capability set, scope grammar and protected owner bundle | P2-201 | Capability fixtures, delegation-ceiling proof, migration and escalation tests |

Defaults already accepted in the specifications:

- TrueForge is the default execution harness.
- AG-UI is the northbound run protocol.
- Controlled registered GenUI is the default rich-output rail.
- Composio is a connection provider, not the product domain or policy authority.
- Computer/browser takeover is excluded through 1.0.
- Self-host telemetry is off by default.
- The custom iframe rail is absent from 0.1 and experimental/off by default in 0.2.
