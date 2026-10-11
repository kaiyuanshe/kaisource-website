# Production repair and acceptance, October 12, 2026

All times below use Asia/Shanghai. The deployment, dependency, domestic startup,
GitHub publication and current-release checks are complete. Full acceptance is
still pending valid SMTP authentication/delivery and a genuine authenticated
post-Neon browser session for OAuth, media and draft checks.

## Current production

| Component | Verified runtime |
| --- | --- |
| Frontend | `dpl_2PTyd4Z2P9KYi2wPmugzWNnCGkg7`, source `64950a1cd1d31e13c57918c15b13b39e846997f3`, READY, `sin1` |
| Formal aliases | `www.kaisource.org`, `kaisource.org`, `kaisource-website-omega.vercel.app` all point to this frontend |
| Overseas Go API | Existing `dpl_6XvQCJ4y5k6TAt7nRV88eLgfaonK`, source `01cf2cfffb135ca3e08afbcb3a69494984cf53af`, READY, `sin1`, stable alias `kaiyuanshe-xi.vercel.app` |
| Database | Neon project `restless-voice-41836010`, production branch `br-odd-bird-azxndv0j`; one authoritative writable dataset |
| Domestic API | Azure legacy interface with the startup-only repair described in `deploy/domestic/README.md`; it also uses Neon production |

The overseas frontend proxies same-origin `/v1` requests to its own Vercel Go
API. The domestic legacy API remains on Azure for compatibility. The Vercel API
uses the pooled Neon connection, and the Azure services use the direct Neon
connection. The frozen Azure database is not an active writable source.

Frontend protection remains `all_except_custom_domains`. Backend protection
remains `all`; anonymous direct health access returns 401, while the trusted
server request returns 200. No temporary migration or repair test access remains.
The apex redirects with 308 and preserves both path and query parameters.

## Repairs and verification

- Removed unused `gray-matter` and replaced the last Quill editor with the existing
  Vditor editor. Event recap submission still produces sanitized HTML.
- Fixed Markdown sanitization: the obsolete Marked `sanitize` option did not
  filter rendered HTML. A real HTML sanitizer now applies when requested, and
  parser options no longer mutate global Marked configuration. Recap descriptions
  render as React text.
- Kept the Next lint rules and replaced their vulnerable legacy glob dependency
  chain with a bounded compatibility adapter using tinyglobby. The adapter
  implements Next's directory-only synchronous calls and rejects unsupported
  calls. Clean installation and actual module resolution were verified.
- Used ESLint's flat configuration and a supported TypeScript 6 package for the
  TypeScript ESLint parser, retaining the TypeScript 7 native tooling separately.
- Dependency audit reports **0 vulnerabilities**. Both a clean local install and
  the actual Vercel production build reported zero.
- **103 tests**, lint for changed files, the frontend production build and Go
  all-package tests passed. Tests include the real Markdown sanitizer, glob
  compatibility and rejection of stale deployment metadata.
- The release preflight now reads the current production deployment and requires
  all formal aliases to match it. READY status of an old deployment is insufficient.
  It verifies source SHA and required production configuration keys without
  including secret values in reports. Structural checks do not imply authenticated
  business acceptance.

Candidate smoke passed 14 groups / 37 requests at **01:31:33**. Its temporary
access credential was revoked. Normal promotion completed at **01:34:20**.
Formal-domain smoke passed 14 groups / 37 requests at **01:35:12**. Checks cover
bilingual pages and published article/event reads, captcha method/proof rules,
unauthenticated session behavior, anonymous writes/media denial and forged-token
draft denial. They do not authenticate a real user or send mail.

Final provider/runtime verification at **01:37:33** confirmed all aliases, both
deployment revisions/regions, unchanged protection modes, zero temporary access,
path-and-query-preserving apex redirection, trusted backend health and a passing
current-production preflight.

## Domestic startup repair

The repair is based on the actual Azure legacy checkout
`983c03de22073681a9390f38583153841fd81c66` and changes only `models/init.go` and
`main.go`. Serving no longer performs AutoMigrate or initial permission/category
seeding. Migration is now an explicit operator action via `-mode=migrate` with
an appropriate administrative role; the production application role was not
given schema ownership.

An isolated production-derived Neon branch verified startup in approximately
1.8 seconds, public reads, anonymous-write denial and unchanged table data.
The production scheduler was disabled only in the rehearsal. The test branch
`br-hidden-pine-azhif16c` expires on October 13 at 16:00 Asia/Shanghai.

Production activation passed at **01:19:31**: public responses were identical,
startup schema errors were absent, and the domestic scheduler remained active.
The sidecar process and database configuration were unchanged. The exact patch,
binary hash, activation paths and application rollback are recorded in
`deploy/domestic/README.md` and `deploy/domestic/legacy-startup-983c03.patch`.

## GitHub publication

Application repair commit `64950a1` was pushed normally to
`kaiyuanshe/kaisource-website`, branch `codex/shared-auth-state`, including the
previous migration documentation commit `5f9f4c3`. HTTPS authentication still
fails, but the existing SSH identity works. Only the origin push URL was changed
to SSH; the fetch URL and commit author were preserved. No force push or merge
to the default branch was performed. This acceptance document is a separate
documentation commit and does not require rebuilding the deployed application.

## Outstanding acceptance and required input

1. **SMTP:** A single TLS-verified authentication-only probe of the live sidecar
   configuration at **00:57:47** returned SMTP **535**. No mail was sent. A valid
   SMTP credential/configuration and a confirmed test recipient are required
   before delivery can be tested. Do not retry invalid credentials repeatedly
   or guess a recipient.
2. **Genuine post-migration browser acceptance:** The normal GitHub OAuth redirect
   reaches GitHub sign-in, where the browser is signed out. The browser has been
   left on the formal `/zh-CN/login` page for the approved test actor to sign in.
   After a genuine session is available, rerun provider callback/session checks,
   scoped media upload/delete and private draft ownership/cleanup. October 10's
   passing real acceptance predates the Neon migration and does not cover it.
   No login tokens, accounts or roles were fabricated or changed.

## Evidence and rollback boundaries

Safe receipts are in the workspace's `qa-artifacts/repair-20261012/`:
`checks.json`, `frontend-build.log`, `frontend-deployment.json`,
`candidate-smoke-1791739893369.json`, `promotion.json`,
`live-smoke-1791740112354.json`, `final-verification.json`,
`legacy-rehearsal.json`, `legacy-activation.json` and `smtp-auth.json`.
Sensitive runtime files remain ignored and are not committed.

The shared-database check at **01:30:11** confirmed both Azure services use Neon,
the old source is read-only with no other clients, and the limited application
role owns no tables. The article table differs from the original migration
snapshot after production resumed; do not overwrite live data with that snapshot.

The previous frontend `dpl_FzLHhHVxR7yJ64sYkpjrtsKBLGRY` is available for an
application-only rollback while retaining the current Neon-backed API wiring.
Domestic rollback removes only the startup-repair systemd drop-in and restarts
that service. A database rollback requires stopping writers and reverse
synchronization; never simply reconnect to the frozen Azure snapshot.
