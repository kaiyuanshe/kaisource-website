# Continuation checkpoint — October 9, 2026 (Asia/Shanghai)

Resumes Codex chat `01a11c53-7ec1-76d1-937a-e069cf98b548`.
**Not a completed production release.** Earlier credential recovery and domestic
baseline observations remain historical; this session did not access or change
Azure domestic services, binaries, configuration, senders, accounts or roles.

## Corrected release premise

Connecting the Vercel project to a GitHub repository is **not required for all
Vercel deployments**. The official live schema at `https://openapi.vercel.sh`,
`POST /v13/deployments`, expressly supports file-based non-Git deployments;
`gitSource` is optional (the required root field is `name`). Requiring a GitHub
Login Connection for a Git-source publishing path does not establish a universal
publishing requirement. The prior chat's explanation conflated these two paths.

The current specific rejection is separate and still real:

- Project: `prj_KPv0pSUICFUsxaA2MJKNi2gT1UEa`, `open-build/kaisource-website`.
- Team: `team_jdKwYH5K67gHpkE5vr43CPAc`.
- Last attempted source deployment: `dpl_9F7nHUnTMLpAjH6R3hyzx6EB46kE`.
- Attempted revision: `cad3ec5707ea522bf256ac9dbd9c087292a3f9ac`.
- Fresh REST state: **BLOCKED**; the reason identifies commit-author permission.
- The token's account is an existing confirmed team Owner; current author
  membership is absent. The project's Git repository link remains null.
- Fresh production alias read: `www.kaisource.org` still points to Ready
  `dpl_2p6eUJy8zP6KnA9y7mThnCLxxhdJ`.

No author spoofing, Git/metadata stripping, member invitation, permission/billing
change, blocked-deployment promotion, alias reassignment, new source upload or
configuration-only production redeploy was performed here. A non-Git API path
is not permission to disguise a source artifact already rejected by author policy.
Use an approved team/author authorization process before the next source release;
preserving the real authorship remains mandatory.

## Local OAuth browser-binding fix

A remaining provider-acceptance gap was reproducible in the source: the client
navigated to OAuth and consumed a returned `code` without browser-bound `state`.
The local frontend now implements:

1. Same-origin JSON **POST** `/api/oauth/start`; GET is 405, missing/foreign Origin
   or wrong content type is 403. The callback trust boundary comes from configured
   `NEXTAUTH_URL`, not Host/forwarded headers; production requires HTTPS.
2. Random 256-bit state, server-signed using the deployment's server-only
   `NEXTAUTH_SECRET` (or `AUTH_SECRET` fallback, at least 32 characters), with a
   ten-minute lifetime. Invalid/missing configuration fails closed with 503.
3. Production `__Host-kaisource.oauth-state` cookie: Secure, HttpOnly, SameSite=Lax,
   Path=/, no Domain. The browser gets the random state, never the signing secret.
4. NextAuth `code-login` validates signature, expiry and matching browser state
   **before** any Go/provider exchange. Its existing native CSRF check remains
   mandatory. The challenge cookie is cleared on the authorization attempt without
   dropping NextAuth's own CSRF/session cookies.
5. Only the canonical login page consumes OAuth callbacks. The global header no
   longer races it or interprets unrelated content-page `code` query parameters.
   Every configured provider redirect still uses the exact same-origin `/login`.
6. Start failures show the existing localized login-error message; no sensitive
   provider details are logged or exposed.

This is a stateless signed browser challenge, **not a persistent server-side
single-consumption registry**. Normal browser replay after clearing is rejected;
OAuth authorization-code single-use enforcement is still the provider's job.
Starting a second login replaces the browser's prior challenge; restart the older
flow rather than allowing an unbound callback. These changes are local/source-only,
not proof that the production provider setup or this new endpoint is deployed.

## Verification in this continuation

| Check | Result | Evidence boundary |
|---|---|---|
| All frontend/static/unit contracts | 72 PASS | Local source; includes seven new state tests |
| TypeScript and production build | PASS | Local source, no ignored type errors |
| NextAuth + Go + socket-only temporary PostgreSQL | PASS | Real isolated services; captured mail and local provider fixture |
| Invalid state / different browser / missing cookie | PASS | No provider token exchange or new session |
| Correct signed callback / API identity and permissions | PASS | Local mock provider, real Go user mapping and JWT |
| Valid OAuth state with wrong native CSRF token | PASS rejection | No provider token exchange |
| Normal browser replay after cookie clearing | PASS rejection | Does not assert copied-cookie server replay prevention |
| Actual overseas API smoke | 7 PASS | No real account creation, email, content write or upload |
| Actual deployed frontend smoke | 7 PASS | Anonymous/negative tests against current accepted artifact |

Reproduce local contracts and isolated integration:

```sh
node --test tests/*.test.mjs
npm run typecheck
npm run test:auth-runtime
```

The NextAuth integration explicitly replaces provider settings with test-only
values and maps its token/user endpoints to loopback fixture servers. It does not
contact GitHub or authenticate a real user.

## Remaining gates and next actions

1. **Legitimate latest-source deployment permission**. Deploy the current branch
   tip only after this is approved; inspect REST state, source SHA, active alias
   and production environment adoption. The latest attempted SHA above is older
   than this continuation's source changes. Do not re-label it as the new tip.
2. **Mail authentication and delivery**. The last same-config non-sending Azure
   diagnostic in the prior session returned SMTP 535; it was not re-run here.
   Reusing those credentials is not a fix. Do not alter the domestic sender
   without separate authorization.
3. **Approved real actors and provider acceptance**. Real registration, activation,
   GitHub consent/account mapping, Cloudinary upload/delete and authenticated
   content-editing acceptance remain pending. A local mock, ping, environment
   write or callback setting does not satisfy these gates.
4. **Domestic new-source cutover** remains independent and not performed.
