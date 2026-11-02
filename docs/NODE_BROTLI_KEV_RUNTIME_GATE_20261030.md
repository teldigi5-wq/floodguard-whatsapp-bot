# Node.js Brotli KEV remediation gate (30 October 2026)

This draft is a **repository-level prevention measure**, NOT a host upgrade or proof that a deployed WhatsApp bot is patched. CISA added CVE-2026-111497 to the Known Exploited Vulnerabilities catalog on 27 October 2026. Node.js fixed this issue in 22.23.4, 24.22.1 and 26.12.1; unsupported Node 20 is excluded.

- `package.json` and root `package-lock.json` set identical patched supported ranges.
- `.nvmrc` selects 22.23.4 for local and operator-controlled use; `.npmrc` enforces the engine during npm installs.
- CI already checks Node 22.23.4 and 24.22.1. Static regression tests prevent a future rollback of these declared floors.

## Operational verification before any release

1. On each **actual bot host/container**, record `node -p 'process.version'`, `node -p 'process.execPath'`, process-manager service config, container image ID/digest if used, and any alternate runtime paths. Never paste secrets or session credentials.
2. If the active host runtime is older than the fixed floors or unsupported, replace it using a vendor-supported patched Node release; rebuild and restart under a supervised rollback plan.
3. Validate `npm ci`, `npm run check`, `npm test`, production dependency audit and offline alert-recovery fixtures on the patched runtime. Confirm the process manager uses the same Node binary you tested.
4. Recheck real WhatsApp consent, session security, delivery uncertainty and Firebase ingest boundaries separately. No live send/pairing is authorized by this patch.

`engine-strict` prevents ordinary npm installation on unsupported runtimes; it **does not** magically upgrade a deployed host, stop a process launched directly via `node bot.js`, or prevent all external Brotli decoder exposures. Production exposure remains unverified until the actual host is inspected.

Reference: https://nodejs.org/en/blog/vulnerability/october-2026-security-releases
