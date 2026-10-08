# Overseas API rollout without replacing the domestic service

The international Next frontend runs in `open-build/kaisource-website` on Vercel.
A **separate** Go process on Azure is a transitional hosting adapter, not a claim
that PostgreSQL or the Go runtime has moved to Vercel. Both versions use the one
existing local authoritative database. No public PostgreSQL listener is needed.

## Boundaries

- Existing domestic `kaiyuanshe.service` (8080), Next/PM2 (3000), `/v1`, `/api`,
  accounts, role assignments and DNS stay unchanged.
- Dedicated `kaisource-api.service` listens on **127.0.0.1:8081** only.
- New HTTPS namespace `/kaisource-api/v1/*` maps to its `/v1/*`.
- Vercel build/runtime: `API_PROXY_ORIGIN=https://kaiyuanshe.cn/kaisource-api`
  and `INTERNAL_API_URL=https://kaiyuanshe.cn/kaisource-api/v1`.
- The sidecar reuses the existing server-local YAML file. Do not download, print
  or commit its secrets. Email activation links return to the overseas `/login`.
- Both scheduler and Vercel cron are disabled in the sidecar. Existing scheduler
  ownership is unchanged. Use its explicit `-mode cleanup` in an operator-owned
  maintenance schedule only after separately verifying ownership.
- Never restore production directly to test backups: use a separate local
  Unix-socket-only PostgreSQL cluster.

## Release procedure

1. Run unit, isolated PostgreSQL, real NextAuth and bilingual frontend tests.
2. Make a fresh server-local logical backup and restore-check it in a disposable
   cluster. Record its hash without exposing private database records.
3. Build Linux amd64 Go binary from the same commit; record its hash, upload to
   `/home/azureuser/kaisource-api/releases/<revision>/server`, set `current`
   symlink, and install the dedicated unit from the reviewed example.
4. Existing authentication tables must already exist. Do not run a full schema
   migration or permission seeding. Startup fails closed when tables are missing.
5. Start the sidecar, confirm `/healthz`, loopback binding and scheduler-off state.
6. Back up the existing Nginx file. Add ONLY the reviewed include in its HTTPS
   server block, run `nginx -t`, then graceful reload (never restart old API).
7. Check public HTTPS sidecar health and PNG captcha, reject wrong/expired proof,
   and recheck domestic old SVG captcha, content and service binary hash.
8. Stage Vercel against this new namespace. Do not publish a frontend that still
   points to the old API. Verify on the actual deployment before promotion.
9. Actual provider login, SMTP delivery and authenticated uploads require valid
   provider configuration and an approved test account. Do not fabricate these
   results or change existing accounts/roles to obtain a test actor.

## Rollback

Restore the prior Vercel deployment as a matched frontend/API pair. Restore the
saved Nginx file (validate then graceful reload), stop only
`kaisource-api.service`, and retain the release and backup for audit. Leave
`kaiyuanshe.service`, PM2, PostgreSQL, DNS and existing data untouched.

The later domestic cutover is a separate acceptance step after the overseas
version is proven; use the same source, domestic default locale and existing
account/data semantics. Do not run the legacy `deploy.sh`.
