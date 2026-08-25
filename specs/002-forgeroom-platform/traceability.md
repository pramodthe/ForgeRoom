# Platform requirement traceability

This matrix maps product/domain requirements to their implementation and release evidence. Task front matter remains the exact per-task mapping; this file is the coverage audit. A requirement is not shipped because a task exists—it is shipped only when the task and release gate contain passing evidence.

The `002-forgeroom-platform` product and domain files are the canonical owners of `PLAT`, `CW`, `SK`, `CN`, `KN`, `MEM`, `SRCH`, `XGUI`, `AOR`, `REC`, `TEAM`, `NT`, `WF`, `RET`, `OSS` and `PSEC` requirements. The 0.1 slice remains canonical for its local `AG`, `TL`, `AP`, `GUI`, `AGUI`, `AU`, `TR`, `CH`, `RUN`, `OR` and related foundation requirements. Any platform ID repeated in the P0 slice is a release mirror and must match or link to the canonical contract; P0 tasks may cite platform IDs directly.

## Product-wide requirements

| Requirements | Primary implementation | Release evidence |
| --- | --- | --- |
| PLAT-001–PLAT-002 | P1-101, P1-102, P1-107 | P1-501, P1-502 |
| PLAT-003–PLAT-004 | P0 action/record gates; P1-102/P1-105/P1-302/P1-303; P2-102 | P0-502/P0-503; P1-501; P2-501 |
| PLAT-005–PLAT-006 | P0-210–P0-212, P0-314–P0-316, P0-408 | P0-506; P1-506 only for experimental iframe |
| PLAT-007 | P1-106/P1-401; P3-101/P3-502 | P1-501/P1-503; P3-502 |
| PLAT-008 | P1-107/P1-401; P3-102/P3-105 | P1-503; P3-501/P3-502 |
| PLAT-009 | P1-108; P2-203; P3-105 | P1-501; P2-501; P3-501 |
| PLAT-010 | P1-108 and release claim gates | P1-504/P2-503/P3-503 plus `parity.md` register |

## Domain requirements

| Requirements | Primary implementation | Release evidence |
| --- | --- | --- |
| CW-001–CW-007 | P0-208/P0-213/P0-410; P1-213 regression | P0-504; P1-501/P1-502 |
| CW-008–CW-011 | P1-103/P1-213 | P1-501/P1-502 |
| CW-012 | P2-102/P2-105/P2-501 | P2-501/P2-502 |
| SK-001–SK-005 | P0-208/P0-318/P0-410 | P0-501–P0-504 |
| SK-006–SK-008 | P1-301 | P1-501/P1-502 |
| SK-009 | P2-101 | P2-501/P2-502 |
| SK-010 | P3-104 | P3-501/P3-503 |
| CN-001–CN-006 | P0-208/P0-301–P0-305/P0-309; P1-304 regression | P0-502/P0-503; P1-501 |
| CN-007–CN-009 | P1-304 | P1-501/P1-502 |
| CN-010–CN-011 | P2-202/P2-102 | P2-501/P2-502 |
| CN-012 | P2-203/P3-105 | P3-501/P3-503 |
| KN-001–KN-003, KN-009–KN-010 | P1-201/P1-203 | P1-501/P1-502 |
| KN-004–KN-008 | P1-202/P1-203 | P1-501/P1-502 |
| KN-011 | P2-205 | P2-501/P2-502 |
| KN-012 | P3-502 | P3-502/P3-503 |
| MEM-001–MEM-009 | P1-211/P1-212 | P1-501/P1-502 |
| MEM-010 | P2-201 | P2-501/P2-502 |
| MEM-011 | P3-502 | P3-502/P3-503 |
| SRCH-001–SRCH-008 | P1-305 | P1-501/P1-502 |
| SRCH-009 | P2-106 | P2-501/P2-502 |
| XGUI-001–XGUI-012 | P1-317 | P1-506 (experimental only) |
| XGUI-013 | P1-506 | P1-506 independent activation review |
| AOR-001–AOR-006 | P1-207 | P1-207 task-local optional evidence; not an alpha gate |
| AOR-007–AOR-012 | P1-209 | P1-209 task-local optional evidence; not an alpha gate |
| REC-001–REC-004 | P0-109/P0-410 | P0-501–P0-504 |
| REC-005–REC-010 | P1-302/P1-303 | P1-501/P1-502 |
| REC-011 | P2-101 | P2-501/P2-502 |
| REC-012 | P3-502 | P3-502/P3-503 |
| REC-013 | P1-303 | P1-501/P1-502 |
| TEAM-001–TEAM-006 | P1-102/P1-103 | P1-501/P1-502 |
| TEAM-007–TEAM-008, NT-001–NT-007 | P1-104 | P1-501/P1-502 |
| TEAM-009–TEAM-010 | P2-201 | P2-501/P2-502 |
| TEAM-011 | P2-202 | P2-501/P2-502 |
| TEAM-012 | P3-101 | P3-501/P3-502 |
| NT-008–NT-010 | P2-204 | P2-501/P2-502 |
| WF-001–WF-002 | P2-101/P2-106 | P2-501/P2-502 |
| WF-003 | P2-103/P2-104 | P2-501/P2-502 |
| WF-004 | P2-103 | P2-501/P2-502 |
| WF-005 | P2-104 | P2-501/P2-502 |
| WF-006–WF-008 | P2-102 | P2-501/P2-502 |
| WF-009–WF-010 | P2-105 | P2-501/P2-502 |
| WF-011 | P2-102/P2-103/P2-106 | P2-501/P2-502 |
| WF-012 | P2-102/P2-105 | P2-501/P2-502 |
| WF-013 | P3-101 | P3-501/P3-502 |
| RET-001–RET-005, RET-007–RET-008 | P1-106 | P1-501/P1-503 |
| RET-006 | P1-106 policy/manifest hooks + P1-401 portability | P1-503/P1-504 |
| RET-009 | P2-201/P2-501 | P2-501/P2-502 |
| RET-010 | P3-502 | P3-502/P3-503 |
| OSS-001 | P0-101/P0-505 | P0-501/P0-505 |
| OSS-002, OSS-004–OSS-007, OSS-010 | P1-401 | P1-503/P1-504 |
| OSS-003 | P1-402 | P1-503/P1-504 |
| OSS-009 | P2-203 | P2-501/P2-503 |
| OSS-008 | P3-105 | P3-501/P3-503 |
| PSEC-001–PSEC-006 | P1-102/P1-201/P1-301/P1-401/P1-402 | P1-501/P1-503 |
| PSEC-007 | P2-104 | P2-501/P2-502 |
| PSEC-008 | P1-301; P2-203 extension expansion | P1-501; P2-501 |
| PSEC-009–PSEC-011 | P1-102/P1-201/P1-211/P1-305/P1-402 | P1-501/P1-503 |
| PSEC-012 | P1-105/P1-106 | P1-501/P1-503 |
| PSEC-013 | P3-104/P3-501 | P3-501/P3-503 |

## Coverage rule

Any new or changed requirement must update:

1. Its owning domain spec and API/event/data implications.
2. At least one implementation task.
3. At least one negative/security case when authority or data is affected.
4. A release journey or explicit reason why unit/integration evidence is sufficient.
5. This matrix and the relevant release checklist.
