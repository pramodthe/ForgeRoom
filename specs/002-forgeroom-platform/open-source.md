# Open-source product contract

## Position

ForgeRoom is an open-source product with an optional managed service. The self-hosted edition is not a demo shell: it must run the core workspace, coworkers, TrueForge integration, AG-UI, controlled GenUI, approvals, connections, knowledge, memory, skills, records, workflows, teams, audit, and export without calling a proprietary ForgeRoom control plane.

## License and repository

- The intended core license is **Apache License 2.0**. A dependency/license review and committed `LICENSE`/`NOTICE` are mandatory before the first public release; any change requires an ADR and updated contributor/business documentation.
- The canonical repository includes build sources, migrations, generated-code inputs, deployment manifests, API/event schemas, test fixtures, docs, and release notes needed to reproduce supported binaries.
- No source-available or hosted-only component may be described as open source. Optional commercial services are named precisely and use stable interfaces.
- Third-party trademarks, copied assets, private prompts, provider credentials, and unredistributable fixtures are excluded from releases.

## Requirements

| ID | Contract | First release |
| --- | --- | --- |
| OSS-001 | A clean public clone builds, tests, starts, and runs the documented local fixture without private ForgeRoom credentials. | 0.1 |
| OSS-002 | Supported self-host uses documented container images/config, health checks, secrets, TLS/proxy assumptions, persistent volumes, migrations, backup, restore, and upgrade path. | 0.2 |
| OSS-003 | Telemetry is off by default for self-host, opt-in and documented; payload preview, destination, retention, and deletion controls are visible. | 0.2 |
| OSS-004 | A versioned portable snapshot covers every domain shipped in that release—users/memberships, channels/messages, coworkers/versions, redacted connection/tool configuration (never credentials), skills, knowledge/files, memory, records/history, workflows/runs where shipped, artifacts, approvals/audit and integrity metadata—subject to authorization, secrets and retention policy. | 0.2 |
| OSS-005 | Import/restore never broadens permissions, accounts, public visibility, triggers, schedules, or enabled workflows without explicit destination review. | 0.2 |
| OSS-006 | `CONTRIBUTING`, `CODE_OF_CONDUCT`, `SECURITY`, architecture, setup, testing, migration, release, support, and governance documentation ship with the public project. | 0.2 |
| OSS-007 | Releases publish source tag, changelog, migration notes, compatibility matrix, checksums/signatures, SBOM, and provenance for official images/artifacts. | 0.2 |
| OSS-008 | Public API/event/extension compatibility follows documented semantic versioning/deprecation windows and contract tests. | 1.0 |
| OSS-009 | Extensions declare license, publisher, integrity, permissions, compatibility, migrations, uninstall behavior, and vulnerability status. | 0.3 |
| OSS-010 | Security reports have a private channel, acknowledgement target, supported-version policy, coordinated disclosure process, and signed advisories. | 0.2 |

## Supported installation

Release 0.2 supports one documented single-node topology:

- ForgeRoom web/API/worker/scheduler images.
- PostgreSQL.
- S3-compatible object storage or documented local-development adapter.
- PostgreSQL-backed authorized search or the one required documented search service; 0.2 global search may not silently disappear.
- User-supplied TrueForge and model endpoints/credentials are required for agent execution. Daytona and Composio are optional capability adapters; their features are visibly unavailable when unconfigured.
- Reverse proxy/TLS and secure cookie/OIDC configuration.

The bootstrap refuses production mode with default secrets, unauthenticated admin, unsafe CORS, missing encryption keys or pending migrations. Generated-origin settings are validated only when the experimental iframe rail is explicitly enabled; otherwise no generated origin is deployed.

## Configuration and secrets

- A checked-in `.env.example` contains names and safe descriptions only.
- Secret values live in environment/secret-manager references, never database JSON, events, logs, exports, screenshots, or support bundles.
- Runtime config is schema-validated at startup with unknown/deprecated key warnings and environment-specific safe defaults.
- A generated support bundle is opt-in, previewable, redacted, bounded, and contains no workspace content by default.

## Upgrades, backups, and portability

- Every release states supported previous versions and required migration order.
- Database migrations are forward-tested against representative prior fixtures and have backup/restore or forward-fix instructions.
- Blob/database backup consistency uses a manifest and hash verification; restoring a database without required blobs is visibly degraded, never silently successful.
- Restore is tested automatically and through a release-gate drill. It verifies identities, permissions, messages, hashes, pending approvals, schedule next-runs, event/outbox continuity, and search rebuild.
- Import stages data disabled: connections require reauthorization, triggers/workflows are paused, and user/coworker grants receive an impact preview before activation.
- The 0.2 snapshot/import promise applies to data shipped by the same supported release line. Cross-version/LTS compatibility and complete historical preservation become the 1.0 `OSS-008`/domain export contract.

## Extension ecosystem

Supported public extension contracts are skills, controlled UI components, connector/policy packs, knowledge extractors, record schemas/views, workflow triggers, and notification adapters. Each type has:

- Manifest and compatibility schema.
- Permission and data-flow declaration.
- Deterministic install/upgrade/uninstall.
- Fixture/contract tests.
- Trust state: local/unreviewed, workspace-approved, verified publisher, revoked.
- Server/browser isolation appropriate to the type.

There is no unrestricted plugin process with database/secret access. Self-host administrators may make unsafe local modifications, but the supported product labels them outside the trust contract.

## Community and governance

- Small changes use issues/pull requests; contract or security changes require an ADR/RFC.
- The maintainer file states decision rights and review expectations.
- A Developer Certificate of Origin (`DCO`) is the default contribution attestation unless legal counsel selects another path.
- Public roadmap/status separates accepted direction, scheduled work, active implementation, and ideas.
- Security, safety, privacy, accessibility, and migration compatibility are review categories, not optional polish.

## Acceptance scenarios

- A new contributor follows documentation on a clean machine and reaches the fixture without a hosted ForgeRoom key.
- A self-host backup restores into a fresh deployment with identical hashes and no workflows or connections unexpectedly enabled.
- Telemetry remains network-silent until opt-in and its preview matches emitted fields.
- A full export is readable/documented and a destination import preserves or narrows access.
- An extension requesting an undeclared browser/tool/network capability fails installation or activation.
