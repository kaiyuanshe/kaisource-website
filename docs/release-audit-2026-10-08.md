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

## Vercel candidate deployment

A production-target deployment of the current frontend commit `ca3065a` was
created in the currently authenticated Vercel team `ians-projects-142b260c`:

- Deployment: `kaisource-website-7pf74kyai-ians-projects-142b260c.vercel.app`.
- Alias: `kaisource-website.vercel.app`.
- Deployment ID: `dpl_4BCXZtAHadjrMk1QMHhVy9Zp8Dd3`.
- Build status: Ready; local TypeScript/build and isolated auth/runtime gates
  also passed.
- Public page rendering and `/v1/articles` and `/v1/events` reads returned 200
  through the Vercel alias on October 8, 2026.

This is a candidate deployment, not yet `kaisource.org`: adding either
`kaisource.org` or `www.kaisource.org` to this project returned Vercel HTTP 403
because the authenticated team is not authorized to use those domains. The
existing public domain still resolves to a different Vercel deployment. Do not
force a domain transfer or bypass team enforcement; the domain must be
transferred/authorized in Vercel first.

The candidate currently proxies `/v1` reads to the unchanged Azure
`kaiyuanshe.cn` backend. That backend still returns 404 for
`/v1/captcha/generate`, while the new frontend's captcha routes deliberately
redirect there; `/api/auth/session` also returns 500 because production
NextAuth/provider secrets have not been configured in this project. Therefore
registration/login and authenticated writes are not accepted as production
ready. Keep `kaiyuanshe.cn` on its old deployment until the new backend contract
and Vercel secrets are staged and verified.

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
