# Composio fixture contract

Exact application slugs, direct-tool names, connected-account IDs and descriptor hashes are **blocked-on-secrets** until a human runs the live probe checklist.

## Rules (frozen)

- At most two applications; prefer one if it covers read + deterministic write + reconciliation read.
- Expose only literal pinned direct tools (two to four total).
- Pin every toolkit to an exact connected-account ID (redacted suffix recorded here; full ID only in secrets).
- Multi-execute, workbench, remote bash, dynamic write discovery, Composio sandbox and account fallback stay disabled (ADR-003).
- Prefer setting a known issue/record field to a known synthetic value; never use email/message creation to claim exactly-once.
- Check in observed descriptor hashes only after export from a live session.

## Files

| File                              | Status                                        |
| --------------------------------- | --------------------------------------------- |
| `applications.candidate.json`     | Preferred pattern; no invented verified slugs |
| `tools.candidate.json`            | Role placeholders until live slug probe       |
| `accounts.redacted.template.json` | Suffix template only                          |
| `descriptors/`                    | Empty until hashed exports land               |
