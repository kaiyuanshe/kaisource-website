# Shared registration and authentication state

This feature is prepared on `codex/shared-auth-state`, not deployed to Azure or
the international production site. It changes the registration contract and
adds database tables. Publish the compatible backend before publishing this
frontend. A Git commit or isolated test is not a production cutover.

## Shared state and contract

The authoritative Go API owns these endpoints:

- `POST /v1/captcha/generate` returns a six-character PNG challenge and a random
  `captchaId`. It stores only a keyed answer digest, with a five-minute expiry.
- `POST /v1/captcha/verify` receives `captchaId`, `captcha`, and `email`. Any
  actual answer attempt atomically consumes the challenge. Correct answers
  return `data.verificationToken`, valid for two minutes and bound to that email.
- `POST /v1/register` requires `verificationToken` in addition to username,
  email, and password. Registration atomically consumes the proof; a browser
  saying verification succeeded does not grant permission to create an account.

The Next.js `/api/captcha/*` compatibility routes redirect with HTTP 307 to
same-origin `/v1/captcha/*`, preserving the POST and its body. They have no local
Map or verifier. Preview remains restricted. Failed generation clears stale
challenge IDs; refreshing also invalidates older in-flight responses.

`captcha_challenges`, `registration_proofs`, and `auth_rate_buckets` live in the
same approved database as articles, events, and users. Starting `serve` checks
these tables exist but never creates or migrates them. Missing state, database
errors, stale challenges, wrong-email proofs, and reused proofs fail closed.
Answer/email digests use the existing API JWT key with separate HMAC purposes;
raw answers and email addresses are not persisted in these state tables.

Email verification is an atomic conditional update. A verification link can
activate an account only once, including concurrent requests to separate
instances. Successful activation clears the stored token and expiry. Pending
accounts cannot log in. Missing role/expiry data is rejected without a panic.

## Durable limits and trusted ingress

Login, OAuth code exchange, registration, email activation, captcha generation
and captcha verification use fixed-window PostgreSQL counters. Atomic upserts
enforce the same allowance across separate instances without sleeping requests.
Over-limit requests receive HTTP 429 and `Retry-After`; unavailable durable state
returns HTTP 503 instead of removing protection. Counter IDs are keyed hashes,
not stored raw client IPs.

Limits apply to the client address observed through **verified** ingress hops.
The HTTP server trusts loopback proxies by default. `server.trusted_proxies`
must contain only confirmed ingress addresses/CIDRs. Never use all-address trust
to make forwarding work. During staging, prove the observed client identity
through Vercel and any upstream proxy: multiple users must not collapse into one
proxy-IP budget, and user-supplied forwarded headers must not bypass the limits.
The local concurrency test does not prove a production ingress configuration.

The image captcha and fixed-window limits are basic abuse controls, not a claim
of comprehensive bot protection. Tune allowances and provider quotas from
verified traffic; do not introduce an unsigned upload or captcha bypass.

## Release order and rollback

1. Approve secure connectivity to the one authoritative database. Keep Azure
   PostgreSQL private; do not create an independently editable overseas copy.
2. Take and verify a production backup and review the explicit schema migration.
   The three new tables are additive, but do not run development commands on
   production. Preserve existing JWT keys, user IDs, roles, and permissions.
   The reviewed `go run . -mode migrate-auth` command targets only these three
   state tables; it does not migrate the existing account or content models.
3. Verify existing SMTP settings, sender identity and TLS, registration callback
   URLs for both languages/domains, and the existing `content_creator` role.
   A mail configuration guard is not proof of real provider delivery. Mail
   outage/recovery and callback behavior still require staging verification.
4. Explicitly migrate, then publish and test the new Go runtime using approved
   test identities. Verify trusted ingress/client IPs and appropriate limits.
5. Publish the compatible frontend only after the new backend is healthy.
   Preserve old Azure services and upstream configuration for rollback.
6. Assign one operator/scheduler owner to periodically invoke
   `go run . -mode cleanup` (at least hourly). This removes expired authentication
   rows; it does not run statistics or start another scheduler at cold start.

On rollback, old binaries ignore the additive tables. Do not drop user data or
change existing account access. Roll frontend/backend contracts back together.
Do not roll back only the backend underneath a frontend that requires the new
verification endpoints.

## Verification and remaining scope

```sh
npm run test:captcha
npm run test:backend-runtime
npm run test:auth-runtime
```

`test:captcha` checks frontend contract declarations. `test:backend-runtime`
uses a disposable UTF-8 PostgreSQL cluster on its own Unix socket and a temporary
loopback SMTP server. It proves challenge/proof/activation single-use behavior,
email binding, expiry, concurrent allowance enforcement, cross-router state,
forged-header rejection, real account creation/mail activation/password login,
failure of registration without proof, durable-store failures, and cleanup.

`test:auth-runtime` builds and starts actual NextAuth against this isolated Go
API. A test-only TLS proxy exercises production Secure cookies and CSRF. It
verifies successful password login, wrong-password rejection, email activation
login, identical API/session user IDs, and a session-authorized article write
persisted in the same database. It also exercises the compiled captcha redirects
and method rejection over HTTP. Test credentials are temporary; external
provider tokens and production database secrets are not injected into Next.

The runner accepts `KAISOURCE_TEST_GO` to select an installed Go executable
without changing global PATH or the repository toolchain. For example, an ARM
Mac with a native Homebrew Go bootstrap can verify the pinned minimum toolchain
using `GOTOOLCHAIN=go1.24.7 KAISOURCE_TEST_GO=/opt/homebrew/bin/go` before the
test command. The selected toolchain is local test infrastructure, not a
production runtime change.

These results are not live-account, browser-login, OAuth-provider, real SMTP or
Cloudinary acceptance. Native GitHub NextAuth still needs mapping to a shared
API identity/token. Article create/edit and delete UI gates now use
`article:write` and `article:delete`, respectively; article writers/reviewers
can request unpublished lists. `test:article-permissions` evaluates the actual
JSX gates for every article category, including both grid/list controls, but
is not browser editing acceptance. Isolated API integration also verifies
independent create/edit, review, and delete permissions, including rejection of
anonymous and event-only actors. API draft visibility remains a separate
release gate; client-side filters are not authorization. Full TypeScript
checking, actual Vercel backend connectivity, provider credentials and final
desktop/mobile production acceptance remain release gates.
