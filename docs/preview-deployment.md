# Read-only showcase

This is a temporary display version, not the completed backend/database
migration. It runs the existing site on Vercel with a public content snapshot.

Set `SITE_PREVIEW_MODE=true` for both build and runtime. In this mode:

- English is the default language; Chinese and Traditional Chinese are still
  available on the same preview host.
- Production domain locale rules are disabled, so language switching cannot
  move a visitor to the live site.
- `/v1/*` uses the local snapshot API. No runtime request goes to the production
  backend, including article detail views, which otherwise increment views.
- The snapshot includes published article/event lists, public city communities,
  public community members, and event sessions. Nested account email, secrets,
  and permission fields are excluded.
- Sign-in, API writes, uploads, and other private APIs are blocked. A visible
  banner explains the limitations.
- The deployment sends `noindex, nofollow`; it does not replace official SEO
  URLs, DNS, or the existing Azure deployment.

The snapshot is captured from public list endpoints with
`scripts/capture-preview-content.mjs`. It is not an independently editable
production dataset and does not implement live shared user accounts. Continue
the shared-database plan before a production cutover.

## Verification

```sh
npm ci --legacy-peer-deps
npm run test:preview
SITE_PREVIEW_MODE=true npm run build
```

For a normal deployment, leave `SITE_PREVIEW_MODE=false` and configure the real
backend and authentication. Do not switch the showcase to normal mode until
those services and shared data have been verified.
