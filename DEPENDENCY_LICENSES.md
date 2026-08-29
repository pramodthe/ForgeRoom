# Production dependency license review

Reviewed on 2026-08-29 from the committed `pnpm-lock.yaml` with Node.js
22.20.0 and pnpm 10.34.5.

## Reproduce the inventory

```bash
pnpm install --frozen-lockfile
pnpm licenses list --prod --long
```

The review covers production dependencies installed for the current platform.
The lockfile was also inspected for the platform-specific Sharp packages that
pnpm does not install on the current machine.

## Result

| SPDX expression             | Installed package records |
| --------------------------- | ------------------------: |
| MIT                         |                        31 |
| Apache-2.0                  |                         6 |
| Apache-2.0 AND BSD-3-Clause |                         1 |
| ISC                         |                         1 |
| 0BSD                        |                         1 |
| Unlicense                   |                         2 |
| LGPL-3.0-or-later           |                         1 |

No installed production package reported an unknown, proprietary, AGPL, or GPL
license. The LGPL record is the platform-specific prebuilt libvips package used
by Sharp (`@img/sharp-libvips-*`, version 1.2.4 in the lockfile). Equivalent
libvips packages exist for the other supported Sharp platforms. Any binary or
container distribution that includes those packages must preserve their license
and satisfy the applicable LGPL source and relinking requirements. ForgeRoom's
own source remains licensed under Apache-2.0.

This file is a reproducible engineering inventory, not legal advice. Release
approval remains a separate decision under PD-002.
