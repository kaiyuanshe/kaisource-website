# Production acceptance follow-up — October 24, 2026

All times use Asia/Shanghai. The full bilingual-site goal remains incomplete
until the outstanding business/provider acceptance gates are verified.

## Baseline and real browser checks

Current-production metadata at 20:47:27 confirmed the three formal aliases point
to `dpl_2PTyd4Z2P9KYi2wPmugzWNnCGkg7`, source
`64950a1cd1d31e13c57918c15b13b39e846997f3`. The release preflight passed with all
required production configuration keys present. This is a metadata check, not
proof of successful authenticated business operations.

The existing browser had an apparently signed-in frontend session whose API
token was expired: protected API requests returned 401. After signing out only
that test browser's website session, the normal GitHub authorization flow with
the existing `jueduizone` account returned to the website successfully. The
authoritative user remains ID `135`, username `IanXu`. No account, role or
permission was fabricated or elevated.

The refreshed session successfully reached the authenticated API. A temporary
private article draft (ID `21`) was created, read and edited; anonymous detail
and list requests could not expose it. Its publisher ID matched the real actor,
and its status remained private. Review and event-creation endpoints correctly
returned 403 for this account's existing permissions. The test draft was then
deleted and its authenticated detail became unavailable.

The first draft attempt used an invalid fixture with an empty required cover
URL, returned 500, and created no accepted draft. The fixture was corrected to
use a valid official-site image URL before the successful checks above. That
failed attempt is not presented as a successful acceptance check.

## Defects reproduced and fixed in this release

- Starting GitHub login from `/zh-CN/login` returned to the English homepage.
  The provider's exact registered callback must stay `/login`. A small,
  tab-scoped, ten-minute locale marker now restores the chosen supported
  language after authentication. It cannot specify arbitrary URLs, is consumed
  once, and does not affect server-signed authentication state. Disabled browser
  storage falls back without preventing login. Callback navigation uses one
  replacement rather than competing push/replace calls; OAuth failures also
  return to the local login page in the original language.
- Authenticated media signing returned 503. Account verification in the media
  policy called the protected backend without the existing operator protection
  header. It now reuses `upstreamProtectionHeaders`, restricted to the exact
  configured HTTPS origin, with redirects forbidden. Incoming browser protection
  headers remain untrusted; account/JWT and namespace checks remain mandatory.
  Actual post-deployment upload and cleanup still need to pass.

## Security patches and local verification

Official npm registry audit identified four affected dependency entries:
Next.js, DOMPurify, sanitize-html and transitive Zod. Applied compatible security
updates without a forced major upgrade. Lockfile versions are Next.js `16.4.3`,
DOMPurify `3.4.17`, sanitize-html `2.18.1` and Zod `4.6.7`. Raised direct minimum
ranges so a newly resolved install cannot select the earlier vulnerable versions.
The final official-registry audit reported zero vulnerabilities.

The configured local npm mirror does not implement the audit endpoint; its 404
is not a clean audit. Verification explicitly selected the official npm registry
without changing global registry settings.

The default local Node `20.11.1` cannot load the existing ESM sanitizer dependency
chain. `.nvmrc` records the installed, verified Node `24.22.1`; no global runtime
was changed. Under that runtime:

- 109 frontend contract/security tests passed, including new locale and protected
  media-verification regressions.
- ESLint passed for the changed application and test files.
- The real production build passed TypeScript and generated all 189 pages.
- `git diff --check` passed.

## Release and remaining gates

Production deployment and post-release genuine browser checks are pending at
this source checkpoint. Record the resulting source/deployment and actual
acceptance outcomes below after verification; do not substitute local tests
for the final domain's behavior.

SMTP was previously confirmed to reject its credential with 535. No new mail
credential or approved test recipient was supplied here, and no mail was sent.
Do not repeatedly retry invalid credentials or guess a recipient.

This actor lacks `event:write` and `event:review`. Event publishing acceptance
requires an existing appropriately authorized actor; do not grant a role merely
to turn a test green. Existing read and permission-denial checks do not prove
successful event-authoring acceptance.

## COSCon recovery

The separate COSCon incident was contained and its entry restored: GitHub Pages
ownership of `kaiyuanshe.cn` is verified, and `coscon.kaiyuanshe.cn` now uses the
independent `open-build/coscon-entry` temporary redirect to the official event
page. Only its CNAME and two ownership-verification TXT record sets changed.
The root/www Azure addresses and mail records were checked unchanged. Detailed
evidence is in `../../qa-artifacts/coscon-incident-20261024/recovery.md`.

This release changes only the overseas frontend source. It does not migrate,
overwrite or reconnect databases, restart domestic services, rotate credentials,
change access permissions or move original domains.
