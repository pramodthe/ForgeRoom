# Notifications specification

## Purpose

Notifications bring people back only when their attention is useful. Token/tool/activity noise remains inside a run; mentions, assignments, questions, approvals, failures, handoffs, conflicts, and security events become durable user-scoped notifications.

## Objects

| Object | Purpose |
| --- | --- |
| `Notification` | Durable inbox item for one user, domain event, reason, resource, and state |
| `NotificationPreference` | User/category/resource/channel and delivery preference |
| `NotificationEndpoint` | Verified email/browser-push endpoint reference; secrets encrypted |
| `NotificationDelivery` | One provider attempt, result, retry, suppression, redacted error |
| `NotificationDigest` | Time-zone-aware collection of eligible items |

## Requirements

| ID | Contract | First release |
| --- | --- | --- |
| NT-001 | Every active member has a durable in-app inbox and authenticated user-scoped realtime stream. | 0.2 |
| NT-002 | Fanout consumes domain events idempotently and deduplicates by event, recipient, category, and resource/thread. | 0.2 |
| NT-003 | Default attention events are mentions, assignments, required questions/approvals, handoff requests, workflow failures, connection expiry, source/memory conflicts, and security events. | 0.2 |
| NT-004 | Token, progress, ordinary tool, presence, and successful background-step events do not create individual notifications. | 0.2 |
| NT-005 | Users can read/archive, mute channels, and configure category/resource delivery preferences. | 0.2 |
| NT-006 | Authorization is rechecked before inbox creation, stream delivery, external delivery, and resource opening; the item/link grants nothing. | 0.2 |
| NT-007 | Payloads are minimized and never include credentials, private file/memory content, raw tool arguments, or approval authority. | 0.2 |
| NT-008 | Email and browser push are opt-in, endpoint-verified, retryable, observable, unsubscribable, preference/quiet-hour aware, and support deterministic immutable digests. | 0.3 |
| NT-009 | Workflow notifications resolve registered users/groups server-side; models cannot select arbitrary email/push destinations. | 0.3 |
| NT-010 | Security-critical classes may bypass quiet hours only through fixed workspace policy. | 0.3 |

## State

```text
notification: unread → read → archived
delivery: queued → sending → delivered | failed | suppressed
endpoint: pending_verification → active → revoked | invalid
digest: collecting → sealed → queued → delivered | failed | cancelled
```

Digest windows bind user, endpoint/channel, timezone, preference revision and source-event high-water. A notification appears at most once in one sealed digest for that window; retries reuse the immutable safe digest rather than recollecting a changed set. Authorization and preferences are rechecked before seal and delivery.

An authorization loss may suppress an unsent notification. An already delivered external message cannot be recalled, so it contains only safe generic metadata and a link that reauthorizes.

## UX

The inbox groups **Needs you**, **Mentions**, **Workflows**, **Handoffs**, and **System**. Items state who/what needs attention, why the user received it, the safe resource title, and age. Approval emails link to trusted application UI and contain no decision token or actionable one-click URL.

## Acceptance scenarios

- Duplicate consumption creates one inbox item and at most one active delivery chain.
- A user removed from a private channel receives no pending email/push and cannot open an already received link.
- Clicking an approval notification cannot decide or resume anything without authenticated trusted-host confirmation.
- Muting a channel suppresses ordinary mentions according to preference but not a fixed critical security alert.
