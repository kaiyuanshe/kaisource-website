# Acceptance checkpoint — October 8, 2026

**Overall: not complete.** This records verified results and external gates,
not blanket production readiness. See `release-audit-2026-10-08.md` for rollout,
backup, service revisions and rollback locations.

| Check | Result | Boundary |
|---|---|---|
| Frontend route types and TypeScript | PASS | Local current source |
| 60 frontend/locale/media/permission/captcha/OAuth/deployment tests | PASS | Automated isolated/static contracts |
| Next production build | PASS | Type checking enabled |
| Real NextAuth + Go + disposable PostgreSQL | PASS | Registration, captured mail, activation, login, secured session, writes |
| Go unit tests and config/utils race tests | PASS | Isolated, not production providers |
| Backup restore | PASS | Server-local separate socket-only cluster, not production overwrite |
| Sidecar health and loopback bind | PASS | 127.0.0.1:8081, active dedicated unit |
| Seven HTTPS sidecar smoke cases | PASS | No account/content creation, no mail, no permission changes |
| Anonymous article/draft-translation boundary | PASS | API enforces published-only; invalid tokens fail closed |
| Domestic old homepage/login/session/captcha | PASS | Old binary/PID/routes unchanged |
| Expired auth-state cleanup | PASS | Separate auth-only timer, not a second stats scheduler |
| Real overseas content in browser | PASS | Existing live deployment |
| Same-domain English→Chinese language switch | PASS | www.kaisource.org/zh-CN |
| Registration layout at 390px and 1440px | PASS layout | No horizontal overflow; CAPTCHA still unavailable |
| Active overseas frontend using new API | PENDING | Env store updated; Keyrail denied redeploy |
| Actual registration email delivery | FAIL/PENDING | Go SMTP connection/auth probe failed; no test email sent |
| Provider OAuth callback and authenticated Cloudinary | PENDING | Required Vercel configuration/approved actor absent |
| Domestic new-code cutover | NOT STARTED | Keep old domestic deployment until overseas acceptance |

## Precise next action

The following configuration-only redeploy was refused by Keyrail policy:

```sh
keyrail run --yes -- vercel redeploy https://kaisource-website-a7clh0vw9-open-build.vercel.app --prod --scope open-build
```

Do not add an allow rule without human approval. New-source deployments must also
satisfy OpenBuild commit-author permission; do not strip `.git` or spoof author
identity to avoid it. The project-scoped Keyrail credential is `kaisource-vercel`.

Required provider configuration is `NEXT_PUBLIC_OAUTH`, approved Cloudinary
cloud/API key, `CLOUDINARY_API_SECRET` (server-only) and upload folder root.
Use an approved secret-store workflow; never publish an API secret under a
`NEXT_PUBLIC_` name. SMTP credential/provider correction is separate from code
and must not silently alter the old domestic sender.

After authorization/configuration, redeploy and run the live smoke suite against
`https://www.kaisource.org/v1`, then use an approved test account and recipient to
verify real registration/activation/login, article/event editing, translation
and uploads. Do not infer these from a successful build or an empty session.
