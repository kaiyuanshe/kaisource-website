# Automatic production deployment

`.github/workflows/release.yml` is the release entry point for
`kaiyuanshe/kaisource-website`. PRs run validation without production credentials.
Pushes to `main`, and manual runs on `main`, validate the exact commit and then
publish the domestic and overseas sites. Production runs are serialized and are
not cancelled during a traffic switch. Superseded commits are refused before
publishing. Do not configure a second native Vercel Git production publisher.

## Validation

The workflow uses `.nvmrc`, the Go module's version, lockfile installation,
frontend regression tests, archive security tests, type checking, production
build, Go tests and an isolated temporary PostgreSQL integration test. The Linux
API binary and exact Git source form one versioned domestic artifact. No live
database URL is available in the validation job.

## Production configuration

GitHub Environment `production` permits only branch `main`. It contains:

| Type | Name | Purpose |
| --- | --- | --- |
| Variable | `VERCEL_ORG_ID` | Existing OpenBuild team |
| Variable | `VERCEL_FRONTEND_PROJECT_ID` | Existing `kaisource-website` project |
| Variable | `VERCEL_BACKEND_PROJECT_ID` | Existing `kaiyuanshe` project |
| Variable | `ALIYUN_DEPLOY_HOST` | Domestic host |
| Secret | `VERCEL_FRONTEND_TOKEN` | Token restricted to the frontend project |
| Secret | `VERCEL_BACKEND_TOKEN` | Token restricted to the backend project |
| Secret | `ALIYUN_DEPLOY_KEY` | Dedicated forced-command SSH identity |
| Secret | `ALIYUN_HOST_KEY` | Pinned SSH host public key |

The Vercel tokens created November 20, 2026 expire November 20, 2027. Replace the
corresponding environment secret before expiry. Do not reuse the operator's
personal SSH PEM or commit any credential. Application credentials stay in
Vercel project environment variables or the existing root-only Alibaba env files.

## Overseas release

`scripts/deploy-vercel.mjs` uses Vercel's deployment API with project-scoped tokens
(the CLI requires user-profile access that these limited tokens do not grant).
It uploads only tracked regular source files, excluding credential/build files,
and uploads the checked-out commit to the two existing
projects, using the root for Next.js and `kaiyuanshe/` for Go. Both candidates are
production builds with alias assignment postponed. `/api/health` and `/healthz`
must report the exact commit. The backend is promoted first, then the frontend.
The public frontend health route must also report the expected commit.

Existing deployment protection and backend-to-frontend authentication remain in
place. A temporary frontend candidate-testing bypass is generated only when no
automation bypass exists, and is revoked in `finally`. No existing bypass is
rotated or deleted. If promotion or post-promotion checks fail, previously
promoted projects are rolled back. A receipt is attached to the Actions run.
Credential expiry, provider seat/permission blocks and build failures fail the
job rather than being treated as successful deployment.

## Domestic release

Provision `deploy/domestic/` once as root with `provision-ci.sh`. Existing Nginx
routes first switch to named upstreams pointing at the original ports, without
changing the serving application. Install a dedicated public key for
`kaisource-deploy` with:

```text
restrict,command="sudo -n /usr/local/sbin/kaisource-ci-release" ssh-ed25519 <dedicated public key>
```

The root-owned entry point accepts only `deploy <40-character commit SHA>` or
`status`. It cannot run arbitrary SSH commands or port forwarding. Source
archives are checked for traversal, links, environment files and build state.
Uploads never replace a current release. The frontend is installed and built as
the unprivileged application user using `/etc/kaisource/build.env`.

Releases run in version-specific systemd instances with blue/green loopback
ports. New frontend and API processes are checked before Nginx is reloaded.
After switching, the exact public HTTPS revision and service health are checked
again. Existing env files, TLS bridge, domains and database remain provisioned on
the host. No implicit migration, seeding, scheduler or cron job is enabled.

`/etc/kaisource/deployment.json` records the active and previous releases. On
failure before acceptance, the script restores the old upstreams and current
pointer, and stops the rejected candidate. An accepted old release remains
available on disk; its services are stopped only after the old Nginx workers
finish their in-flight requests. If draining exceeds 90 seconds, old processes
are retained for operator inspection rather than interrupting those requests.
Detailed failure tracebacks are in root-only
`/var/log/kaisource-ci-release.log`. Release directories are not automatically
deleted after successful deployment; monitor disk usage and retain at least the
current and previous accepted versions during operator cleanup.

For manual recovery, use the operator's existing SSH access, start the previous
instances from `deployment.json`, restore their upstream ports, run `nginx -t`
and reload Nginx. Restore the `current` symlink and enable the restored instances
for reboot. Always preserve the current Neon connection and server env files.

## Boundaries

Application rollbacks do not roll back shared data. Database schema changes need
a separately reviewed, compatible migration. A failure on one hosting platform
does not automatically undo an already successful deployment on the other.
Runtime health checks do not substitute for real-account OAuth, email delivery
or authenticated image-upload acceptance.
