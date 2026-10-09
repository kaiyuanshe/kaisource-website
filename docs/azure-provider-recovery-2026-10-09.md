# Azure provider recovery and source-deployment gate — October 9, 2026

This follow-up supersedes the provider-not-found state of the earlier acceptance
checkpoint. It does **not** claim successful latest-source deployment or real
provider login, email delivery or upload acceptance.

## Authorized credential discovery and transfer

The current running Next process was checked read-only and uses
`/home/azureuser/website`. Its provider source is
`/home/azureuser/website/.env.production`; Go SMTP and OAuth settings are in
`/home/azureuser/website/kaiyuanshe/config.yaml`. No raw credential was printed,
saved in a workspace dotenv file, committed, or copied into a document.

- Found the Cloudinary cloud, API key, secret and folder root.
- Authenticated those credentials with a **read-only Cloudinary ping**: PASS.
  No asset was listed, created, uploaded or deleted.
- Found the GitHub authorize URL; its client ID matches the authoritative Go
  backend's configured OAuth client ID.
- Stored eight scoped provider fields via Keyrail stdin/account references and
  project env aliases, then synced them to **production only** in the pinned
  OpenBuild project `prj_KPv0pSUICFUsxaA2MJKNi2gT1UEa` /
  team `team_jdKwYH5K67gHpkE5vr43CPAc`.
- Synced fields: `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME`,
  `NEXT_PUBLIC_CLOUDINARY_API_KEY`, `NEXT_PUBLIC_CLOUDINARY_UPLOAD_FOLDERS`,
  `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`,
  `CLOUDINARY_UPLOAD_FOLDER`, `NEXT_PUBLIC_OAUTH`.
- The secret is a **server-only sensitive** Vercel variable. Azure's legacy
  `NEXT_PUBLIC_CLOUDINARY_API_SECRET` name was not copied to Vercel. This legacy
  public name is a separate domestic credential-exposure/rotation concern; no
  domestic secret or built client asset was silently replaced.
- Domestic `NEXTAUTH_URL`/`NEXTAUTH_SECRET` were deliberately not copied over
  the overseas project's existing NextAuth setup.
- Metadata was re-read to verify all eight production keys and no legacy public
  secret key. Environment-store writes do not change an existing immutable
  deployment: the active Ready artifact has not adopted this new configuration.

Reproducible importer (no values printed):

```sh
# Default: SSH export in memory + read-only provider authentication, no writes.
node scripts/sync-azure-provider-config.mjs
# Explicit authorized write, using the verified project's Keyrail Vercel token.
keyrail run -- node scripts/sync-azure-provider-config.mjs --sync
```

The importer pins project/team IDs, confirms project identity, checks the media
root, compares OAuth client identity, suppresses provider/credential error
payloads and stores values through stdin. A new command must satisfy the
project's precise Keyrail policy; do not replace it with a broad preset.

## OAuth callback alignment

The existing GitHub OAuth app was verified in the authenticated organization
settings to be the same client used by Azure. App ID is `3246463`, owned by
`kaiyuanshe`. Its original domestic callback was `https://kaiyuanshe.cn/` with
wildcard matching. That existing URI/matching mode, client/secret, homepage,
users/tokens and ownership were preserved.

One new **exact**, non-wildcard callback was added and persisted:
`https://www.kaisource.org/login`. Re-reading the UI confirmed two callbacks:
the original domestic wildcard and the new exact overseas URI.

Only the overseas sidecar got a systemd drop-in:
`/etc/systemd/system/kaisource-api.service.d/40-overseas-oauth.conf`:

```ini
[Service]
Environment=KAISOURCE_OAUTH_REDIRECEURL=https://www.kaisource.org/login
```

The misspelling REDIRECEURL matches the existing Go `oauth.redireceUrl` key;
it is deliberate compatibility, not a new config key. Only `kaisource-api`
was restarted, then `/healthz` and both live smoke suites passed. Its binary
remains revision `53e59ec` /
SHA-256 `d3a820011f590db1e17600998de1c351793736bf220a2321fd3ec928adc8792d`.

The local frontend OAuth URL helper now uses the canonical same-origin `/login`
callback from every page/locale, so it agrees with the exact provider URI and
Go exchange URI. Arbitrary content or localized callback paths would not match
this exact registration; foreign-origin paths still fail closed. The source
fix and regression tests are **not yet deployed**. Successful real OAuth consent,
account mapping/login and state/CSRF acceptance remain pending; adding a callback
or receiving an unauthenticated provider login redirect does not prove these.

Emergency rollback is limited to removing the newly added exact overseas URI
and restoring/removing that sidecar drop-in, then restarting the sidecar. Do not
replace the original domestic callback or delete/reset the OAuth application.

## Mail credential result

The current SMTP username/password are present in the actual Azure Go config.
Neither the domestic nor sidecar process has a separate SMTP credential env
override. Re-running the same-service-config, non-sending Go protocol probe
returned **SMTP 535** (port 587, TLS enabled). Thus the credential source was
found, but provider authentication still fails. No mail or production test
account was created. Do not treat copying the same failing password as a fix;
provider policy/credential correction remains an external acceptance gate.

## Latest source deployment remains blocked

Normal source deployment with intact Git metadata was retried for
`7fcb1df79e2e0e3b99e788c5feb001e7a24a35a2`. It created:

- ID: `dpl_9F3peY68B5NHwjFNvsFVYfirN9HZ`.
- URL: `https://kaisource-website-oi0hqfomm-open-build.vercel.app`.
- REST state: **BLOCKED**.
- Explicit reason: commit author does not have permission to create deployments
  for this project.

The scoped credential is the `cloud-1787` OpenBuild **OWNER** account, so this is
not a missing Vercel token or missing provider credential. Team-member metadata
does not include the current commit author `jueduizone@gmail.com`. The project
currently has no linked Git repository. An Owner token alone does not satisfy
the Git author-membership gate.

No member invitation, permission grant, author rewrite/spoofing, `.git` removal,
metadata stripping or alias reassignment was performed. Team-membership changes
require explicit human authorization and may have access/billing consequences;
an invited user may also have to accept/complete their account linkage.

The active production deployment is still the Ready configuration-only
`dpl_2p6eUJy8zP6KnA9y7mThnCLxxhdJ`; latest source and the new provider variables
have not been accepted as live. Resolve legitimate author/team authorization,
then deploy the branch tip, inspect REST Ready state/reason and revision, and
rerun actual-domain smoke plus approved real-user/provider acceptance.

## Domestic state changed outside this operation

Compared with the earlier session, Azure's domestic binary/PID were already
different **before** the sidecar-only configuration operation. Observed current
baseline and post-operation values were identical:

- PID: `504005`.
- Binary SHA-256:
  `ad9df770376156e3b940f8eb546a5dc9195a77849f5a117a8525c678c7b80a7a`.
- Service start: October 9, 2026, 01:19:28 Asia/Shanghai
  (October 8, 2026, 17:19:28 UTC).
- Azure checkout revision: `aeba773` (merge of release-wyj), not proof of the
  source used to compile the executable.

No attribution is made about who updated Azure between sessions. It was not
rolled back to the old snapshot or overwritten by this operation. No domestic
service restart, binary/config replacement, Nginx change, database migration,
mail credential change or account-role change was performed here. Earlier
PID/hash observations remain historical, not assertions of the current state.

## Verification

- Cloudinary read-only credential authentication: PASS.
- GitHub app client comparison and callback persistence: PASS.
- Eight Vercel production env names and server-only secret type: PASS.
- Sidecar health and current domestic before/after PID/hash comparison: PASS.
- Seven actual-domain API + seven frontend non-destructive smoke groups: PASS.
- Frontend type checking, production build and real isolated NextAuth/Go/
  PostgreSQL captured-mail activation/login/write integration: PASS.
- Current frontend/locale/media/provider/deployment static contracts: **65 PASS**;
  these are not real-provider acceptance.
- Latest source deployment, SMTP mail delivery, real OAuth login and actual
  authenticated uploads: NOT ACCEPTED.
