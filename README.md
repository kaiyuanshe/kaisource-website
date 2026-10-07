# KaiSource Website

The unified KaiSource website: one multilingual codebase, shared content and
users, and deployment configuration that is not tied to a hosting platform.

## Project principles

- Use the same application code for the Chinese and international sites.
- Keep Chinese and English available on both sites. The domain selects the
  default language; it does not select a separate application.
- Share articles, events, users, and permissions through one authoritative data
  source. Do not create an independently editable overseas copy.
- Keep platform differences in environment variables and deployment adapters,
  rather than long-lived regional branches.

## Current status

This repository starts from `kaiyuanshe/website` at commit
`a76cada27ecab5dd7ebead771d4dd02e84dcf8b2`, including the full-site localization
merged in PR #63. The original Git history and license are retained.

The frontend is Next.js and the backend is Go/Gin with PostgreSQL. A temporary
read-only showcase is available with `SITE_PREVIEW_MODE=true`; see
[preview deployment](docs/preview-deployment.md) for its public-content snapshot
and deliberately disabled sign-in/editing. This is not a production migration.

The Vercel
deployment adaptation and shared-database cutover are not complete yet. Creating
this repository does not deploy the application or change the existing Azure
services, database, DNS, or other contributors' access.

The inherited Azure auto-deployment workflow has been removed. The build/test
workflow is retained as an inactive template at
`deploy/ci/github-actions.yml.example`: the current GitHub credential does not
have workflow write permission. No GitHub Actions workflow is enabled yet.

The legacy
`deploy.sh` remains for reference only: it assumes the original server layout,
resets its checkout, and restarts production services. Do not run it for this
repository.

See [the deployment architecture](docs/deployment-architecture.md) for the
migration boundaries and rollout plan.

## Local development

Install frontend dependencies with `npm install`, create `.env.local` from
`.env.example`, and run `npm run dev`.

The Go backend currently requires its own configuration and a development
PostgreSQL database. Use `kaiyuanshe/config.example.yaml` as a starting point.
Do not point a development instance at production: the inherited backend runs
database migrations and data initialization during startup.

## Validation

```sh
npm run build
cd kaiyuanshe
go test ./...
go build ./...
```

The inherited Next.js configuration skips TypeScript type checking during a
build; a successful build is not a substitute for a separate type check.

## Repository relationship

`origin` is `kaiyuanshe/kaisource-website`. `upstream` is the original
`kaiyuanshe/website` repository. Until migration is complete, review and integrate
upstream changes here instead of maintaining separate regional features.
Do not push migration changes or deploy from this repository to the original
production environment without an explicit cutover review.
