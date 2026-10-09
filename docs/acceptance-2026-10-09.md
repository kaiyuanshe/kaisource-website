# Acceptance checkpoint — October 9, 2026 (Asia/Shanghai)

**Continuation:** see `continuation-2026-10-09.md` for the corrected non-Git deployment premise, fresh author-gate/alias inspection, and local OAuth browser-state protection. This does not claim a new production deployment.

**Latest follow-up:** see `azure-provider-recovery-2026-10-09.md`: Azure provider credentials were located and staged; the exact overseas OAuth callback was added; source author authorization and SMTP 535 remain unresolved. The domestic historical PID/hash below is no longer current.

**Overall at this checkpoint: not complete.** The overseas API switch is now complete, but real
provider acceptance and the newer source deployment remain gated. This supersedes
the pending-switch status in `acceptance-2026-10-08.md`, not its historical facts.

## Active deployment

- Team/project: `open-build/kaisource-website`.
- Project ID: `prj_KPv0pSUICFUsxaA2MJKNi2gT1UEa`.
- Active deployment: `dpl_2p6eUJy8zP6KnA9y7mThnCLxxhdJ`, verified **Ready**.
- Immutable URL: `https://kaisource-website-jb5p4g52d-open-build.vercel.app`.
- Primary site: `https://www.kaisource.org`; the apex remains attached.
- This was a configuration-only rebuild of the existing accepted artifact.
  It is **not** proof that local revision `f0733b4` is deployed.
- The production frontend now reaches the isolated namespace
  `https://kaiyuanshe.cn/kaisource-api/v1` through its same-origin `/v1` proxy.
  Backend revision remains `53e59ec` on loopback `127.0.0.1:8081`.

## Verified this session

| Check | Result | Boundary |
|---|---|---|
| Route types and TypeScript | PASS | Local current source |
| 60 frontend contract tests | PASS | Isolated/static contracts |
| Next production build | PASS | Local, with type checking |
| Real NextAuth + Go + disposable PostgreSQL | PASS | Captured-mail registration, activation, login and writes; no real provider |
| Go unit tests and config/utils race tests | PASS | Local source, some cached results |
| Seven production API smoke groups | PASS | Actual `www.kaisource.org/v1`, no account/mail/content creation |
| Seven deployed frontend smoke groups | PASS | Actual primary domain, no authenticated writes |
| English/Chinese home, login, blogs and events | PASS | Eight page requests return 200; correct HTML language and same origin |
| Compatibility CAPTCHA generation/verification | PASS | Same-origin POST-preserving 307; non-cacheable PNG; wrong answer rejected |
| CAPTCHA compatibility GET | PASS | 405 and Allow: POST |
| Anonymous NextAuth session | PASS | 200, empty session, no-store; not successful-login evidence |
| NextAuth bad credentials | PASS | Secure/HttpOnly/SameSite CSRF cookie; 401; no session issued |
| Anonymous upload/delete signing | PASS | Both routes return 401; no signature returned |
| English registration at 390px | PASS layout | PNG loaded; width 390 and document width 390; no submission |
| Chinese registration at 1440px | PASS layout | PNG loaded; document width 1425; no submission |
| Browser EN → Chinese switch | PASS | Stays on `www.kaisource.org/zh-CN/login` |
| Domestic service regression | PASS | Homepage/login/session 200; old CAPTCHA POST returns SVG |
| Domestic binary/process unchanged | PASS | PID 485462; SHA-256 below unchanged |
| Sidecar/database network scope | PASS | 8081 and PostgreSQL 5432 still loopback-only |
| Real SMTP authentication | FAIL | Actual service config, SMTP 535; no email sent |
| Latest source deployment | BLOCKED | Vercel commit-author project permission |
| Actual OAuth callback | PENDING | Provider setup and approved actor required |
| Actual authenticated Cloudinary upload | PENDING | Provider secrets and approved actor required |
| Production registration/activation/editing | PENDING | Real mail, approved recipient/account and suitable existing permissions required |
| Domestic new-code cutover | NOT STARTED | Deliberately keep domestic old version until overseas acceptance |

The live frontend checks are reusable:

```sh
npm run test:overseas-deployment
# Actual non-destructive HTTPS runtime checks:
KAISOURCE_SMOKE_API=https://www.kaisource.org/v1 node scripts/test-overseas-api.mjs
KAISOURCE_SMOKE_SITE=https://www.kaisource.org npm run test:overseas-site
```

`test:overseas-deployment` is a static configuration test, not an HTTP test;
its result must not be described as live acceptance. The two runtime scripts
never solve CAPTCHA challenges, send mail, create accounts/content, modify
permissions, or upload images. The frontend script follows 307 explicitly
because local Node 20.11.1/Undici failed automatic POST redirect replay; the
browser independently loaded the actual PNG through the compatibility URL.

## Source-deployment gate

A normal source deployment was attempted with intact Git metadata, using the
project-scoped Keyrail credential and explicit project-scoped policy rule:

```sh
keyrail run --yes -- sh -c 'vercel deploy --prod --yes --scope open-build --token "$VERCEL_TOKEN"'
```

Deployment `dpl_377HTVpdkQhwMA5aUgkmkf7Q32E9`, URL
`https://kaisource-website-nu88snkej-open-build.vercel.app`, is **BLOCKED**, not
Ready. The Vercel REST response explicitly states that the commit author lacks
permission to create deployments for this project. It identifies revision
`f0733b45f5a76bb681b61ad892ef8e648e2d65ed` on `codex/shared-auth-state`.
The CLI presents this state as UNKNOWN and waits as if building: consult the
REST readyState/reason, not CLI creation or an assigned deployment URL.
The blocked attempt did not replace the active `www` production deployment.
The waiting local CLI was stopped after the server-side block was confirmed.

The current live GitHub button remains enabled even without configured OAuth;
the fail-closed disable/URL guard is in local `f0733b4` but is not live. Do not
claim that source fix was promoted by the configuration-only rebuild. Resolve
legitimate OpenBuild author/project permission and deploy the actual source.
Do not strip Git metadata, rewrite/spoof the author, or transfer production
aliases to evade the block.

## Provider and account gates

Vercel environment-name inspection confirms that the active project has API
routing and NextAuth secret settings, but no approved OAuth/Cloudinary settings.
Keyrail account metadata has no project-specific SMTP/OAuth/Cloudinary account
available. No unrelated project's keys were attached or copied.

- Provide/authorize a working SMTP sender through the approved secret workflow.
  The non-sending Go protocol probe with the same `KAISOURCE_CONFIG_FILE` as the
  service returned SMTP error code **535**, with credentials present, port 587
  and TLS enabled. A probe without that config path sees empty defaults and is
  not a valid production diagnostic. No raw credential or provider error text
  was printed; no domestic sender configuration was changed.
- Configure an approved OAuth authorization URL/client and an overseas callback
  compatible with the authoritative Go code-login flow. A native GitHub
  NextAuth session alone is not an authoritative account or API token.
- Configure Cloudinary cloud/API key, server-only `CLOUDINARY_API_SECRET` and
  upload root. Never publish an API secret with a `NEXT_PUBLIC_` name.
- Identify an approved test recipient and an existing suitable test actor, or
  authorize creating a disposable actor after SMTP works. Do not grant a
  production user extra permissions merely to complete a test.
- Retain the previous audit's credential-rotation requirement after historical
  tool-output exposure; coordinate rotations rather than silently invalidating
  existing domestic sessions.
- Complete real activation/login, OAuth callback, article/event writes,
  translations and uploads before considering the separate domestic cutover.

## Domestic preservation and evidence

Domestic `kaiyuanshe.service`, sidecar, Nginx and PostgreSQL remain active.
Domestic PID at this checkpoint is 485462; its original binary SHA-256 is
`4c86cbc91bb44b6cd2426774ad0966396929598c6224922e132c236e502ec287`.
No domestic service restart, binary replacement, Nginx change, account/role
change, database migration or sender-credential change was performed this
session. The authentication-only cleanup timer remains active and no duplicate
statistics scheduler was enabled.

Browser screenshots outside the repository:

- `/Users/IanX/Documents/ChatGPT/KaiSource/qa-artifacts/2026-10-09/registration-en-mobile.png`
- `/Users/IanX/Documents/ChatGPT/KaiSource/qa-artifacts/2026-10-09/registration-zh-desktop.png`

The October 8 audit retains backup/restore and server rollback locations. To
undo only this frontend API configuration cutover, restore the previously
recorded domestic API origins in this same OpenBuild project and perform a
human-authorized configuration-only redeploy. This also reintroduces the known
new-CAPTCHA 404 and is an emergency rollback, not a release-ready state.
