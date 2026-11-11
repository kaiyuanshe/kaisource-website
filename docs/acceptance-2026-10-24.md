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
  Actual post-deployment upload and cleanup passed, as recorded below.

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

Production deployment completed successfully. The read-only current-production
preflight at **21:43:00** confirmed deployment
`dpl_8FAdYCFagd58EsPMBBt8uEJNv9PA`, source
`5057ccd47bf0416fba0d06eea479f1412c2e8a0f`, and all three formal aliases:
`www.kaisource.org`, `kaisource.org`, and
`kaisource-website-omega.vercel.app`. All required production configuration
keys were present. The real Vercel build passed type checking, generated 189
pages and reported zero dependency vulnerabilities.

Post-release acceptance on the formal domain passed:

- At **21:43:28**, the genuine account `135` / `IanXu` reached the authoritative
  API, created private draft `22`, read and edited it, and verified that its
  publisher and private status remained correct. Anonymous detail and list
  requests could not expose it. Article review and event creation remained
  forbidden to this actor's existing permissions. The test draft was deleted
  through the application and its detail became unavailable; this is application
  soft deletion, not a claim of physical removal from the database.
- The same run obtained a media signature restricted to this actor's namespace,
  uploaded a real synthetic 1×1 PNG to Cloudinary, and deleted that exact image.
  Both media and draft cleanup passed. No unrelated article or asset was removed.
- A fresh normal GitHub OAuth round trip starting at `/zh-CN/login` returned
  to `/zh-CN` with Chinese HTML, the same existing account `135`, and an
  authoritative user API response of 200. Only the test browser's website
  session was signed out to perform this check; no account, grant or role changed.
- At a 390×844 emulated mobile viewport, the normal navigation menu switched
  `/zh-CN/blogs` to `/blogs` and back. The account stayed signed in, article
  headings changed language, and document width remained 390 pixels. Switching
  the COSCon'26 detail page from `/zh-CN/blogs/18` to `/blogs/18` also selected
  the English title and body with no horizontal overflow. At the restored
  1512-pixel desktop viewport, switching back retained the article and account,
  selected Chinese content, and kept document width at 1512 pixels. This is
  browser viewport emulation, not physical-device acceptance.
- All seven deployed-frontend smoke groups and seven public/negative API smoke
  groups passed. They cover bilingual pages and published reads, captcha
  method/proof rules, anonymous sessions, invalid credentials, anonymous
  media/write denial and invalid-token draft denial. They do not send mail or
  establish successful event authoring.
- At **21:54:46–47**, both `kaiyuanshe.cn` and `www.kaiyuanshe.cn` returned 200
  through their existing Nginx service, while `coscon.kaiyuanshe.cn` returned
  the intended Vercel 307 to `https://kaiyuanshe.cn/events/coscon`. At **22:02:20**,
  the overseas apex returned 308 preserving the requested path and query, and
  the formal site's `/llms.txt` returned the expected public Markdown index.

Browser device metrics and focus emulation were cleared afterward. The earlier
Azure and Vercel task tab IDs no longer existed when checked; no replacement
tabs were opened for cleanup. The mobile English screenshot and the repeatable
sanitized browser acceptance script are in
`../../qa-artifacts/acceptance-20261024/`.

Application commit `5057ccd` is pushed to `codex/shared-auth-state`. This
acceptance update is documentation only and does not require another production
deployment. The previous frontend `dpl_2PTyd4Z2P9KYi2wPmugzWNnCGkg7` remains an
application rollback candidate with the current shared-Neon/API configuration;
never roll back by reconnecting the frozen Azure database.

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
