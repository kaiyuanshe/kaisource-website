# Unified website deployment

## Confirmed scope

Confirmed on 2026-10-07:

- Repository: `kaiyuanshe/kaisource-website`; the name is independent of the
  hosting platform and region.
- One frontend/backend codebase for both the Chinese and international sites.
- Shared articles, events, users, permissions, and locale-linked content.
- Adapt both the frontend and backend for the international Vercel deployment.
- Keep the existing Chinese Azure deployment unchanged during preparation.

These are architectural requirements, not a claim that the new environment is
already connected to production data or ready for a domain cutover.

## Shared data contract

Use one authoritative PostgreSQL dataset, not two databases with independently
editable copies. Content IDs, translation links, user IDs, password hashes, and
permissions must keep their meaning across deployments.

A preview may use an isolated test database or a disposable snapshot. Such a
snapshot is for testing only and must never become a second production source.
Previews must not send real login emails, write to production, or run production
scheduled jobs.

The existing production database must not be made publicly accessible as a
shortcut. Select and approve secure connectivity or a shared managed PostgreSQL
service before moving data or changing the Azure backend's connection settings.
Any managed service's provider, region, cost, and credentials still need to be
confirmed; none are provisioned by this repository initialization.

Sharing user records does not automatically share browser login sessions across
different domains. Preserve the authentication contract and permission checks,
but verify login independently on each domain. JWT compatibility and OAuth
callback URLs need explicit review before cutover.

## Application and configuration boundaries

- Keep locale handling and application behavior in the common source tree.
- Select domain defaults through configuration while keeping language switching
  available in every deployment.
- Keep frontend/API URLs, database credentials, authentication keys, mail
  settings, and storage credentials in environment configuration, not Git.
- Preserve the existing API contract while adapting the Go service's startup
  and runtime configuration.
- Make schema migration an explicit, reviewed release step, not something every
  application instance performs at startup.
- Give scheduled jobs one production owner. Do not run the same job from both
  deployment platforms.
- Use durable shared rate-limit/state storage where necessary; process memory
  is not shared between deployment instances.

The current source still has legacy startup behavior. The points above are the
requirements for the next implementation phase, not completed runtime changes.

## Vercel compatibility path

The international frontend can run in normal mode on Vercel while continuing
to use the existing Go API and PostgreSQL dataset as the single authoritative
source. Set `SITE_PREVIEW_MODE=false`, `NEXT_PUBLIC_API_URL=/v1`, and
`API_PROXY_ORIGIN=https://kaiyuanshe.cn`. Next.js then rewrites same-origin
`/v1/*` requests to the shared API. Set `INTERNAL_API_URL` to the absolute
`/v1` endpoint as well, because NextAuth credential providers execute on the
server and cannot fetch a relative URL.

This is a production-compatible shared-backend deployment, not a claim that
the Go service or PostgreSQL have already moved into Vercel. It preserves the
Chinese Azure deployment and avoids duplicating production data while the Go
service is adapted for a managed/serverless runtime in a later release.

## Rollout gates

1. Adapt backend configuration, database connection management, startup, logs,
   authentication integration, and scheduled jobs without touching production.
2. Create an isolated preview and test both locales, articles, events, login,
   permissions, and administrative editing.
3. Agree on the shared database's hosting/connectivity and a migration plan.
   Take a verified backup and document rollback before changing any live data.
4. Move or connect the authoritative data source in a reviewed maintenance
   window. Verify that the existing Azure deployment still works with it.
5. Deploy the international environment against the approved shared data source
   and validate it before changing `kaisource.org` DNS.
6. Change only the approved domain records. Keep `kaiyuanshe.cn`, Azure services,
   access permissions, and a rollback target intact.

The inherited Azure deployment workflow is intentionally absent from this
repository. A build/test CI template is kept in
`deploy/ci/github-actions.yml.example`, outside the active workflows directory,
because the current GitHub credential lacks workflow write permission.
Activating that template is a separate setup step; CI is not enabled yet.
Production deployment adapters must be introduced explicitly as part of the
rollout review.
