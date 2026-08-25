# ADR-003 — Composio direct tools with pinned accounts

| Field | Value |
| --- | --- |
| Status | accepted |
| Date | 2026-08-25 |
| Deciders | Integration and security review |

## Context

Composio's broad catalog is valuable, but generic meta-execute or runtime search hides the inner action from TrueForge approval policy. Automatic account selection can choose the wrong connected identity.

## Decision

The P0 hosted MCP session exposes two to four literal direct tools across at most two applications. Every toolkit is pinned to exact connected-account IDs. Multi-execute, workbench, remote bash, dynamic write discovery, Composio sandbox and account fallback are disabled.

Every supported tool has a checked-in observed descriptor hash. Every write has a reviewed ToolPolicyDefinition and literal TrueForge approval rule.

## Consequences

- The demo has narrow, understandable authority.
- TrueForge can pause on the actual mutation tool.
- Tool or descriptor changes require review and session rotation.
- Catalog breadth becomes an owner-driven onboarding path, not ambient runtime access.
- Supporting new writes requires server adapter work.

## Rejected alternatives

- Generic multi-execute: approval sees the wrapper rather than consequential inner tool.
- Runtime search over all writes: capability can expand after review.
- Most-recent account selection: wrong-account risk.
- Tool annotations as sole policy: useful hints but not authoritative enforcement.

## Verification

- Startup manifest comparison.
- Compiled AgentSpec enabled and approval-set comparison.
- Pinned-account integration assertion.
- Negative tests prove meta-tools and unknown writes are absent.
