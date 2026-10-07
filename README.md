# KaiSource Website

The unified KaiSource website: one multilingual codebase, shared content and
users, and deployment configuration that is not tied to a hosting platform.

## Project principles

- Use the same application code for the Chinese and international sites.
- Keep Chinese and English available on both sites. The domain selects the
  deployment's default language; switching language stays on the current domain.
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

The Go backend accepts environment configuration or optional YAML and needs an
isolated development PostgreSQL database. Use `kaiyuanshe/config.example.yaml`
as a starting point. Startup no longer migrates or seeds data; these are explicit
commands. Never run a development migration against production. See
`docs/backend-runtime.md` for runtime configuration and release gates.

## AI-readable site guide

`public/llms.txt` is served at `/llms.txt`. It provides community context and
curated public links, starting with the plain Markdown `/site-guide.md`.
Responses advertise the index using `Link: </llms.txt>; rel="describedby"`.
It is an information index, not an access-control or content-license policy.
When public routes, names, or canonical domains change, update both files and
run `npm run test:llms`. No production data or private APIs are needed to
generate these static resources.

## Locale deployment settings

`SITE_DEFAULT_LOCALE` selects the default at build time (`en`, `zh-CN`, or
`zh-TW`). Vercel and preview builds default to English; standalone/Azure builds
default to Chinese. Next.js domain-locale routing is deliberately not used:
switching on `www.kaisource.org` must stay there at `/zh-CN/...`, and switching
back to English must retain the same origin and login session. Links preserve
the current locale and route, including article/event IDs and query parameters.

## Build validation

```sh
npm run test:locales
npm run test:media-security # Live-account media policy with isolated fixtures.
npm run build
npm run test:backend-runtime # Requires local PostgreSQL tools; creates a disposable cluster.
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
