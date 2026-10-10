# Overseas reliability follow-up — October 10, 2026

## Scope and observed facts

Production remains the real `727b286` overseas release until a separately
verified replacement is promoted. Domestic services, shared PostgreSQL,
schedulers, account roles, DNS, provider secrets and deployment protection are
outside this change. Existing dirty release-support files are preserved.

The previous cutover is recorded in `docs/cutover-2026-10-10.md`.
Evidence for this follow-up is outside the repository in
`../qa-artifacts/repair-20261010/`.

* A local direct Azure article GET returned 200 in 187 ms. Formal-domain GETs
  from this host and Azure timed out after 15 seconds with no response bytes.
* A unique successful formal-domain GET appears in Azure's access log; a
  separately tagged HTTP/1.1 GET that timed out does not. This localizes that
  attempt before the API but does not establish the exact failure point.
* QQ SMTP on port 587 advertises STARTTLS and LOGIN/PLAIN; verified TLS succeeds.
  The capabilities check performed no authentication and sent no email. The
  preceding authentication disconnect remains unresolved, not a proven bad
  password and not proof of working delivery.
* GitHub's disabled consent button became enabled naturally when the browser
  tab received focus. Normal authorization returned to the correct HTTPS
  callback. A fresh NextAuth callback then returned 401; the overseas API
  recorded `/v1/login` 500. Live config has the expected client ID and callback.
* Azure's unauthenticated connection to GitHub's token endpoint timed out at
  10 seconds; the profile endpoint returned its expected anonymous 401 in
  432 ms. The live API log contains provider timeout/EOF errors. Do not infer
  invalid OAuth credentials from this connectivity evidence.

## Implemented safeguards

* `/v1` uses an internal Node proxy rather than opaque external rewrites. The
  destination is fixed HTTPS operator configuration. No redirects, retries,
  shared idle upstream connections, browser cookies, spoofed forwarded headers
  or provider-protection credentials are forwarded.
* The normal proxy request has a 15-second total deadline, a 10 MiB request
  limit and a 16 MiB non-streaming response limit. SSE remains streamed, with
  a 55-second total lifetime and a 60-second function budget. Clients must
  reconnect normally. Timeout before headers is JSON 504; failure after
  headers closes the stream rather than changing an already-sent status.
* Responses are never cached. Request IDs and stage/status/duration metadata
  are logged; query strings, bodies, tokens, user IDs and emails are not.
* Browser API and credentials calls have finite deadlines. A 403 permission
  denial no longer signs out a valid session; 401 still does.
* SMTP applies a single connect/TLS/AUTH/delivery deadline, requires verified
  encryption for credentials or `tls:true`, attempts one supported mechanism,
  and reports sanitized stage errors. Local unauthenticated capture remains
  supported. Verification email HTML is escaped and uses the service instance
  callback rather than mutable global configuration.
* OAuth provider requests have a 15-second deadline and 2 MiB response bound.
  Non-success responses are rejected without printing provider data. The
  profile GET no longer carries the previous client-secret/code body. Empty
  tokens and invalid identities are rejected before any database operation.
  A null private GitHub email does not erase an existing account email.
* Successful NextAuth logging no longer includes a user email.

## Verification and remaining acceptance

Local contracts, Go tests, TypeScript, fresh production build and disposable
PostgreSQL + real NextAuth integration pass. The isolated provider now verifies
that profile GET has an empty body. New SMTP and OAuth-negative tests do not
contact production providers. The compiled local proxy returned 200 against
the overseas read-only article API.

These safeguards are not proof of a permanent Vercel/Azure network remedy.
Candidate and live-domain results must be recorded separately. SMTP source
changes require a separate overseas sidecar binary release; deploying Next
does not update Go. No new credentials or account permissions were provisioned.

Real acceptance still requires a reliable Azure-to-GitHub token-exchange
egress path, valid SMTP authentication, an approved email recipient and a real
account with existing media/content permissions. Do not use an arbitrary
third-party OAuth proxy, disable TLS/state checks, grant roles, or write directly
to the shared database to make tests pass. Do not repeat a provider code or
automatically retry registration/delivery/content mutations.

## Memory retrieval provenance

Nowledge MCP query: `KaiSource overseas domains promoted 727b286 API timeouts
SMTP disconnect OAuth`; mode: default (server retrieval `strict`), Space
`default`, filters: none. Ranked matches: `8e73c0ec-ad41-4d29-9736-56a80ac5bab4`
(0.99, domains promoted/full acceptance blocked),
`c471a55e-bced-41b0-84f2-b36e59734cd4` (0.79147, earlier READY candidate),
`35bb4454-5216-4cb8-ad74-88a5f24aa66a` (0.78067, historical OAuth-state fix).
Only the first was fully read; its later live state supersedes earlier traffic
status. Graph display was skipped because matching browser identity/Space
enforcement could not be established.
