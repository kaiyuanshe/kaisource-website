# Neon production migration — October 11, 2026

The authoritative database was moved from Azure PostgreSQL `kys` to Neon project
`restless-voice-41836010`, production branch `br-odd-bird-azxndv0j`, in Singapore
(`aws-ap-southeast-1`). This document records the migration and its verification
limits. Historical October 8–10 deployment notes describe earlier states.

## Data and service cutover

The maintenance window began at 17:03:32 Asia/Shanghai on October 11. Both Azure
writer services and the auth cleanup timer were stopped before the final
consistent backup. The source database was made read-only. Its 31 public tables
and 560 rows were imported atomically, and every table's count and deterministic
row digest matched the final snapshot before any new writers started.

The final backup stays on Azure. Its SHA256 is
`f0e4f58a8dc374caea258e72e1483ee6c76e1f12ef1050ba6da66dde651b02d7`.
The encrypted import stream did not store a raw database dump on the workstation.
An isolated Neon branch was used for rehearsal before the production import.

Azure services resumed at 17:16:14 Asia/Shanghai against the same Neon production
database. The domestic and sidecar binaries retained their original SHA256
hashes. Their local API checks returned 200. The domestic service uses the direct
connection; the Vercel Go service uses the pooled connection. Both enforce
`sslmode=verify-full`. The application role is `kaisource_app`, has no superuser
privileges, and owns no tables. Credentials remain outside Git.

The legacy domestic binary still attempts startup schema operations; the limited
role rejects ownership-required DDL. Startup completes and serves the existing
schema. Replacing that binary or expanding its schema privileges is not part of
this migration.

The existing Azure scheduler and auth cleanup timer remain their sole production
owners. The Vercel backend has scheduler and cron disabled. After restart, the
source database remained read-only with zero other connected clients. Its data
is a recovery snapshot, not a second writable production database.

## Vercel connection

The existing OpenBuild projects are reused:

| Component | Project | Production connection |
| --- | --- | --- |
| Next frontend | `kaisource-website` | Same-origin `/v1` proxy to Vercel Go backend |
| Go backend | `kaiyuanshe` | Neon production using the pooled application role |
| Domestic Azure API | Existing `kaiyuanshe.service` | Same Neon production using direct TLS |

The backend's stable address is `https://kaiyuanshe-xi.vercel.app`. It was already
configured on the project, but its initial failed deployment had never assigned
an alias. Normal Vercel promotion assigned it to the verified new deployment.

The frontend configuration is:

```dotenv
API_PROXY_ORIGIN=https://kaiyuanshe-xi.vercel.app
INTERNAL_API_URL=https://kaiyuanshe-xi.vercel.app/v1
API_PROXY_BYPASS_ORIGIN=https://kaiyuanshe-xi.vercel.app
NEXT_PUBLIC_API_URL=/v1
SITE_PREVIEW_MODE=false
```

The backend's protection was strengthened from `all_except_custom_domains` to
`all` after live checks found that the former mode excluded its stable production
alias. Anonymous access to the stable health route now returns 401; the existing
server credential still returns 200. The frontend retains its public custom
domains and original protection mode. Its automation access credential is server-only
and is attached solely to the exact configured HTTPS origin. Caller-supplied
protection headers are never forwarded. Both manifests select `sin1` for runtime
functions; the build location and ingress edge headers are not runtime-region
evidence.

Both deployed application revisions are
`01cf2cfffb135ca3e08afbcb3a69494984cf53af`, verified against GitHub and Vercel's
native Git metadata, including the actual source author. The source branch is
`codex/shared-auth-state`.

## Verification and recovery

Safe receipts are in `../../qa-artifacts/neon-20261011/`. Runtime env files are
ignored and owner-only. Failed transport attempts are preserved alongside later
checks rather than relabeled as passes. The local Node HTTPS path encountered
connection resets; the harness uses system curl with normal certificate
verification and sends credentials through stdin. Azure can reach the custom
production domain but cannot reliably reach the candidate `*.vercel.app` host.

Normal frontend promotion completed at 18:35:39 Asia/Shanghai on October 11.
The original domains `www.kaisource.org`, `kaisource.org`, and
`kaisource-website-omega.vercel.app` all resolve to
`dpl_FzLHhHVxR7yJ64sYkpjrtsKBLGRY`. The backend stable alias resolves to
`dpl_6XvQCJ4y5k6TAt7nRV88eLgfaonK`. Both deployments are READY and their actual
Vercel region metadata is `sin1`. The apex still redirects to `www` with 308 and
preserves the request path. Temporary migration access credentials are revoked.

| Verification | Result | Safe receipt |
| --- | --- | --- |
| Import: all 31 table counts/digests match final snapshot | PASS | `final-restore.json` |
| Azure APIs share Neon; old source read-only and no other clients | PASS | `shared-database-final-verification.json` |
| Candidate: 14 groups, 37 requests | PASS | `candidate-final-1791714909094.json` |
| Formal domain: 14 groups, 37 requests, from Azure | PASS | `live-final-remote-1791715015131.json` |
| Formal domain: 14 groups, 37 requests, after backend protection tightened | PASS | `live-final-1791715168162.json` |
| Aliases, source revisions, regions, apex redirect and protected stable health | PASS | `final-domain-verification.json` |

These smoke checks cover bilingual pages and public content, published-only
article visibility, CAPTCHA/registration proof rejection, anonymous NextAuth
sessions, invalid credentials, and unauthorized write/media-signature denial.
The same application source previously passed 95 frontend contract/security
tests, TypeScript and production builds, all-package Go tests, and inspection of
205 client JS/map files for server credential leakage.

The browser observed during migration was logged out. No fresh real OAuth login,
authenticated upload/deletion, or private draft lifecycle was completed in this
migration. Existing account IDs, password hashes, roles and permissions were
imported without alteration. Those authenticated flows remain separate acceptance
work and are not implied by the public smoke results.

Real SMTP delivery remains unverified; the prior provider authentication failure
is not fixed by moving PostgreSQL. No migration smoke test sends real mail. The
Vercel build reports 11 dependency vulnerabilities, including 5 high severity.
Successful public/negative checks do not prove authenticated uploads or drafts.

Once Neon writers resumed, pointing services back to the old Azure snapshot
would discard newer data. A database rollback now requires stopping writers and
reverse synchronization with verification. Rolling application source back must
preserve the Neon database connection and match the frontend/API configuration.
