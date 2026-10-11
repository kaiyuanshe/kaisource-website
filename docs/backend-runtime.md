# Go backend runtime and release gates

## What is implemented

- Configuration is loaded explicitly. Importing a package no longer opens a
  database, changes schema, seeds permissions/categories, or starts scheduled jobs.
- Environment settings override optional `config.yaml`. An explicit missing or
  malformed `KAISOURCE_CONFIG_FILE` fails closed without printing its contents.
- `DATABASE_URL` supports managed PostgreSQL. TLS is the default when the URL
  does not specify `sslmode`. Legacy database fields are still supported.
- Connection pools default to five open connections and one idle connection per
  instance, with a five-minute connection lifetime. Size the shared database pool
  for the total number of concurrent instances, not just one instance.
- `PORT` controls the HTTP listener. `/healthz` checks database connectivity.
- Migration, seeding, and daily statistics are separate operator commands.
- Authentication state is durable in the shared database, with explicit schema
  validation before serving and a separate operator cleanup command. See
  `shared-auth-state.md` for contract changes, release order and verification.
- JWT signing reads the configured key after initialization, rejects missing
  keys, and only accepts the existing HS256 algorithm.
- Article routes use `article:write`, `article:delete`, and `article:review`, not
  event permissions. Review role assignments before updating the Azure API.

## Runtime environment

Set secrets through the deployment secret store, never Git or command arguments:

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Approved shared PostgreSQL connection, with TLS/pooler settings |
| `JWT_SECRET` | Existing shared API signing key; preserve token compatibility |
| `PORT` | HTTP listener, provided by Vercel |
| `KAISOURCE_LOG_LEVEL` | Log level, defaults to `info` |
| `KAISOURCE_DATABASE_MAX_OPEN_CONNS` | Bounded instance pool, defaults to `5` |
| `KAISOURCE_DATABASE_MAX_IDLE_CONNS` | Idle connections, defaults to `1` |
| `KAISOURCE_CONFIG_FILE` | Optional explicit YAML path for standalone deployments |
| `KAISOURCE_EMAIL_*` | Existing mail settings if registration email is enabled |
| `EMAIL_REDIRECT_URL` | Verified registration callback; must match the chosen login flow |
| `CRON_SECRET` | Secret for the Vercel cleanup/statistics HTTP jobs; never put it in a URL |
| `KAISOURCE_CRON_ENABLED` | Defaults to `false`; enable only on the selected scheduler deployment |

Most YAML keys can use the `KAISOURCE_` prefix, upper case, with dots replaced
by underscores. Existing OAuth camel-case keys have explicit
`GITHUB_CLIENT_ID`/`GITHUB_CLIENT_SECRET` aliases. Preserve the existing provider
configuration and register callbacks explicitly before enabling overseas OAuth.

## Explicit commands

Run from `kaiyuanshe/` against an approved isolated database first:

```sh
go run . -mode migrate
go run . -mode migrate-auth
go run . -mode seed
go run . -mode serve
go run . -mode stats
go run . -mode cleanup
```

`serve` never calls migration or seeding. `seed` is for a new database and is
not part of a Vercel deployment. `stats` runs once; the designated scheduler
owner may invoke it. No second scheduler should be enabled during migration.
The legacy in-process scheduler is opt-in with `KAISOURCE_SCHEDULER_ENABLED`
and is disabled when `VERCEL` is set. The backend exposes protected
`/internal/cron/cleanup` and `/internal/cron/stats` endpoints, but the Vercel
manifest registers no cron jobs while Azure remains the scheduler owner. They require
`Authorization: Bearer $CRON_SECRET` and `KAISOURCE_CRON_ENABLED=true`; missing
configuration or incorrect credentials fail closed. Do not enable both Cron
and the legacy scheduler; startup rejects that combination. Responses are
non-cacheable. Statistics queries have a 30-second deadline, reject failed
counts without storing partial values, and use the existing unique date index
to make concurrent deliveries/retries safe. Introducing a Vercel schedule is a
separate change after confirming the desired operational owner; an API deployment
must not silently create a second cleanup or statistics scheduler.
The HTTP server uses bounded request timeouts and drains requests on SIGTERM
before closing its database pool. Connections use a 10-second connect timeout;
ports, pool bounds, and connection lifetime are validated before serving.
Explicit category seeding is transactional and retryable; startup never seeds.

## Vercel deployment boundary

The backend directory contains `go.mod`, `main.go`, and a `vercel.json` selecting
the Go framework. A separate Vercel backend project can use `kaiyuanshe/` as its
root. Its manifest explicitly runs `go build -o server .` because the project
settings may otherwise retain a JavaScript build command from a previous link.
Vercel's Go runtime supports an HTTP server that listens on its injected `PORT`;
this repository's `main.go` does that. This manifest does not replace the
frontend's Next.js project configuration or cause a database cutover.

The live international frontend still proxies to the existing Azure API. Do not
point it at the new Go runtime until all of these gates are met:

1. Select approved secure connectivity to the same authoritative database. Do
   not expose the Azure PostgreSQL port or create an independently editable copy.
2. Take and verify a production backup. Review schema changes and rollback before
   running any explicit migration. Starting a new instance must not change data.
3. Provide the existing API JWT key, mail/OAuth settings, and durable rate-limit
   policy through the secret store. Keep one scheduled-job owner.
4. Verify login, shared user IDs/permissions, writes, locale-linked articles and
   events in an isolated environment, then against production with approved test
   identities. Anonymous 401 checks do not prove real account login succeeds.
5. Change only the international frontend's upstream after successful staging
   verification. Preserve Azure services and the old upstream for rollback.

The authentication migration was applied on Azure on 2026-10-08 after making a
logical backup. A candidate backend was briefly switched onto port 8080, but
was rolled back to the preserved old binary when checks confirmed the deployed
Chinese registration form did not send the new required verification proof.
The three additive authentication tables remain installed. The database is
still private. See `release-audit-2026-10-08.md` before further cutover work.

## Isolated verification

```sh
npm run test:backend-runtime
cd kaiyuanshe
go test ./...
go build ./...
```

The runtime test script requires `initdb`, `pg_ctl`, and `createdb` on PATH. It
creates a disposable PostgreSQL cluster that listens only on its own temporary
Unix socket. The Go test refuses non-disposable database URLs. It verifies
explicit migration, no implicit seed data, a bounded pool, real password login,
wrong-password rejection, locale-specific lists, linked article translation,
authenticated profile and article writes, anonymous rejection, and rejection of
article writes by an event-only role. The cluster is stopped and removed afterward.
It now also verifies durable captcha/registration proofs, shared limits and a
real registration/mail-activation/login flow with loopback SMTP. Run
`npm run test:auth-runtime` to additionally exercise actual NextAuth, Secure
cookies, CSRF, the shared user ID, and an authenticated article write. These are
isolated tests, not verification of production accounts or external providers.

For a staged overseas release, `KAISOURCE_SERVER_HOST=127.0.0.1` and `KAISOURCE_SERVER_PORT=8081` keep the dedicated process private. See `overseas-api-rollout.md`; existing domestic 8080 service must not be replaced. Anonymous article reads now enforce published status at the API, including translation fallback. Supplied bearer tokens are checked against current database permissions before draft access.
