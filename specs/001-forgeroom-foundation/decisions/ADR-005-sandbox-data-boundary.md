# ADR-005 — Synthetic/public sandbox data until egress is restricted

| Field | Value |
| --- | --- |
| Status | accepted |
| Date | 2026-08-25 |
| Deciders | Security review |

## Context

TrueForge keeps application credentials out of Daytona, but Code Mode can bridge retrieved content into a sandbox and the current AgentSpec does not provide a hard network-egress policy. Generated code could exfiltrate sensitive data with ordinary network calls outside MCP approval.

## Decision

P0 sends only synthetic or explicitly public data to Daytona. The sandbox-enabled coworker has no sensitive external-read tools. Sensitive production data requires an externally enforced outbound allowlist or disabled internet plus automated reachability verification.

## Consequences

- Hackathon artifact generation remains safe and demonstrable.
- P0 cannot claim sensitive-data exfiltration prevention.
- Tool and sandbox roles may require separate persistent coworkers.
- Production expansion depends on deployment-level network controls.

## Rejected alternatives

- Treat sandbox isolation as egress control: process isolation does not stop outbound data transfer.
- Rely on prompt instructions: generated code is untrusted.
- Route arbitrary tool results into Code Mode: bypasses the intended MCP approval boundary.

## Verification

- Fixture contains only synthetic/public values.
- Sandbox environment contains no application or Composio credentials.
- Automated outbound reachability probe records whether sensitive-data readiness must fail.
- Context-envelope test excludes marked sensitive content from sandbox-enabled sessions.
