# Release audit: 2026-10-08

This is an observed checkpoint, not a release approval or claim that the
full Vercel/shared-data migration is complete.

## Azure recovery state

- Production database: `kys`, still on Azure and localhost-only.
- Backup: `/var/backups/kaiyuanshe/kys-before-shared-auth-20261008T0455Z.dump`.
- Backup SHA-256:
  `2a61a6996fd04c95f9a6c93ec6b7258f440d010c0c47e10970f1da5e5964cff2`.
- Backup permissions: `600`, owner/group `postgres:postgres`.
- Backup **restored successfully** into a disposable same-host PostgreSQL
  cluster on a private Unix socket, with no TCP listener. Restoration used
  `--exit-on-error --single-transaction --no-owner --no-privileges`. It restored
  28 public tables, 52 users, 19 articles and 29 events. These are backup-time
  counts, not promises about current production totals. The test cluster was
  stopped and removed; no production database was overwritten or downloaded.
- `migrate-auth` created only `captcha_challenges`, `registration_proofs`, and
  `auth_rate_buckets`; these additive tables remain in production after rollback.

The candidate API briefly ran on 8081, then replaced the systemd-managed 8080
service. Although health, article/event reads and PNG captcha generation passed,
the deployed Chinese frontend still used the old registration contract. It
checked `verifyResult.success` and did not submit `verificationToken`.

To recover compatibility, the API was restored to the preserved old binary.
Observed service: `kaiyuanshe.service`, active, PID 485462 at the checkpoint.
PID is diagnostic history, not a permanent identifier.

- Active binary: `/home/azureuser/website/kaiyuanshe/app`.
- SHA-256: `4c86cbc91bb44b6cd2426774ad0966396929598c6224922e132c236e502ec287`.
- Rollback copy: `app-old-a76cada-20261008T0520Z` in the same directory.
- New binary retained: `app-codex-5912685-preserved` in the same directory.
- New binary SHA-256:
  `7870d68ce748e1cd09357a0154e60bb575dd5055734b270d5d1ea2c723fa7429`.

After rollback, article/event list requests on 8080 returned 200; an empty
registration request returned 400. This confirms liveness and validation only,
not successful real registration or mail delivery. Nginx, DNS and the Chinese
frontend deployment were not changed.

## Vercel/OpenBuild deployment

The OpenBuild Vercel project was located and deployed through the project-scoped
Keyrail Vercel credential. The successful production deployment is:

- Project: `open-build/kaisource-website`.
- Deployment: `dpl_7JTazcLvP3iha5WEU9jFxAoq8kWR`.
- Immutable URL: `kaisource-website-a7clh0vw9-open-build.vercel.app`.
- Production alias: `www.kaisource.org`.
- `kaisource.org` redirects to `www.kaisource.org`.
- The Vercel build completed TypeScript validation and generated all 189 static
  pages. The deployed HTML identifies this deployment directly.

Historical note: that deployment used a temporary source copy without local
Git metadata after a commit-author permission block. Do not repeat this as a
workaround: an accepted artifact does not establish commit-author permission.
Future source deployments must satisfy OpenBuild team/author authorization;
configuration-only redeploys must be explicitly permitted by Keyrail.

Post-deployment checks on October 8, 2026:

- `www.kaisource.org/` returned 200 with English HTML.
- `/v1/articles` and `/v1/events` returned 200 through the shared API proxy.
- `/api/auth/session` returned 200 and an empty unauthenticated session, so the
  configured NextAuth secret is being loaded.
- The domestic site `kaiyuanshe.cn` was not changed.

At that checkpoint the confirmed production blocker was: the Vercel captcha compatibility route redirects
to `/v1/captcha/generate`, but the unchanged domestic backend still returns
404 for that endpoint. Therefore registration, captcha verification and
authenticated writes are not yet accepted as fully ready. Keep the domestic
frontend/backend unchanged until the new backend contract has been deployed and
verified against the same authoritative data.

Do not bypass Keyrail denials, Vercel access protection or team enforcement.

## Remaining release gates

1. Restore-check a fresh backup again if production has materially changed.
2. Verify candidate frontend registration on **both** Azure Chinese and Vercel
   international origins before enforcing the new proof contract on traffic.
3. Select and approve secure connectivity for the Vercel Go backend to the one
   authoritative dataset. No public PostgreSQL exposure or independently
   writable overseas copy.
4. Map provider identities to real shared accounts, verify SMTP and both callback
   domains/languages, and accept existing account permissions without alteration.
5. Choose one scheduler owner; never enable a second owner during migration.
6. Preserve the now-restored TypeScript build gate: the project checks without
   errors and builds with `ignoreBuildErrors=false`. Do not mistake this for
   production or mobile acceptance.
7. Complete desktop/mobile bilingual, registration/login, article/event writes,
   translations and authenticated uploads acceptance on the actual deployment.

An earlier `strace` invocation inadvertently included production configuration
values in tool output. Do not repeat payload tracing or copy secrets into this
document. Coordinate credential rotation via the approved secret store before
final cutover; API signing-key rotation can invalidate existing sessions and
must not be done silently.

## Parallel overseas API checkpoint (late October 8, 2026)

- Backend revision `53e59ec`, Linux amd64 SHA-256
  `d3a820011f590db1e17600998de1c351793736bf220a2321fd3ec928adc8792d`.
- New `kaisource-api.service` is active and listens only on `127.0.0.1:8081`.
- `/home/azureuser/kaisource-api/current` points to `releases/53e59ec`.
- New HTTPS namespace `https://kaiyuanshe.cn/kaisource-api/v1` is available.
  Only an additive Nginx include was inserted into the existing HTTPS server;
  domestic `/v1`, `/api` and `/` routes were not changed. Saved Nginx rollback:
  `/etc/nginx/sites-available/kaiyuanshe.cn.pre-overseas-api-20261008T1515Z`.
- `kaiyuanshe.service` remains PID 485462 with the original binary hash above;
  domestic Next/PM2 was not replaced. PostgreSQL remains localhost-only.
- A new server-local backup
  `/var/backups/kaiyuanshe/kys-before-overseas-sidecar-20261008T1507Z.dump`
  SHA-256 `612468c6a7618aa0371e1ace8ce32336555b680f5ae6b8696654e3c128ffc1e7`
  was restored in an isolated Unix-socket-only cluster: 52 users, 19 articles,
  29 events. These counts were unchanged after smoke tests. The cluster stopped.
- The operator-owned `kaisource-auth-cleanup.timer` runs only expired auth-state
  pruning; a manual run succeeded. It does not run stats. Sidecar scheduler and
  Vercel cron remain disabled, preserving the existing statistics owner.
- Seven non-destructive public HTTPS API checks passed: published-only article
  reads in all three locales (even with forced draft filters), event reads,
  no-store PNG captcha with no answer disclosure, wrong-answer/replay rejection,
  registration without proof rejection, anonymous write rejection, invalid
  bearer rejection. No test account, mail or article/event was created.
- Domestic homepage/login/session/old SVG captcha were rechecked and returned
  200. The old API binary and process were unchanged.
- Full isolated PostgreSQL registration, captured-mail activation, login,
  NextAuth secured session and article writes passed. Go unit/race checks and
  frontend type/build checks passed. These are not real-provider acceptance.
- Vercel **stored** production variables now point to the sidecar namespace:
  `API_PROXY_ORIGIN=https://kaiyuanshe.cn/kaisource-api` and
  `INTERNAL_API_URL=https://kaiyuanshe.cn/kaisource-api/v1`. The active deployment
  has not yet adopted them; its captcha still follows the old route and returns
  404. The exact configuration-only redeploy command was denied by Keyrail.
  Do not self-allow, strip Git metadata, or alter access controls to bypass it.
- Browser checks confirmed real public content and same-origin EN→zh-CN switch.
  A 390px registration form had no horizontal overflow; it still shows captcha
  unavailable before redeploy. Actual successful mobile registration is pending.

### Remaining external acceptance gates

1. Explicitly approve the narrow Keyrail configuration-only redeploy command,
   or provide legitimate OpenBuild commit-author deployment permission for the
   newer frontend fixes. Existing key access alone does not prove author access.
2. SMTP TLS connection works, but authentication failed using the actual Go
   mail protocol (no email sent). Supply/approve a working sender credential or
   provider policy, without silently changing domestic credentials.
3. This Vercel project lacks OAuth/Cloudinary environment configuration. Set
   approved provider URL, Cloudinary cloud/key/server-only secret and upload root
   through the secret store; never use `NEXT_PUBLIC_CLOUDINARY_API_SECRET`.
4. Test real mail delivery/activation, provider callbacks and authenticated
   upload/editing with an approved test account. No production user may be
   given extra permissions merely to obtain a test actor.
5. Only after overseas acceptance and a stable observation period consider the
   separate domestic cutover. The domestic old deployment must remain running.


## October 9, 2026 follow-up (Asia/Shanghai)

The human authorization at the end of the prior session was applied to precise
OpenBuild project commands. The recorded `vercel redeploy --prod` invocation
was invalid for CLI 50.15.1; it was corrected to `--target production`, with
the project-scoped credential passed through Keyrail. Configuration-only
rebuild `dpl_2p6eUJy8zP6KnA9y7mThnCLxxhdJ` is Ready and attached to
`www.kaisource.org`. The new overseas API route and PNG CAPTCHA now work.

A normal source upload preserving Git metadata created
`dpl_377HTVpdkQhwMA5aUgkmkf7Q32E9`, but REST metadata reports BLOCKED because
the commit author lacks project-deployment permission. CLI UNKNOWN is not Ready.
No metadata/author bypass was used; local `f0733b4` is not claimed deployed.

Seven API and seven frontend non-destructive runtime check groups passed on the
actual overseas domain; the current local 60 contracts, type/build checks,
NextAuth/Go/PostgreSQL integration and Go/race checks passed. A same-service-config
non-sending Go SMTP probe returned 535. OAuth/Cloudinary configuration and a
permitted real test actor remain missing. Domestic original binary and PID,
loopback database and sidecar listeners, and authentication-only cleanup remain
unchanged. See `acceptance-2026-10-09.md` for commands, screenshots and boundaries.
