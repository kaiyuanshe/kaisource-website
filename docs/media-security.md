# Media storage authorization

Cloudinary is configured only through deployment secrets. Existing delivery
URLs remain public; signing, search, metadata changes, and deletion are private.

Every media API decrypts the NextAuth session and verifies its API JWT against
the shared backend's authenticated user endpoint. Expired tokens, deleted users,
changed permissions, OAuth identities without a shared API token, and upstream
outages fail closed. No new user database or independent permission system is
created. Preview mode never signs uploads or accesses the provider library.

- Upload uses a server-generated ID under `<root>/users/<shared-user-id>/`.
  The exact ID, allowed formats, and `overwrite=false` are signed. Reusing that
  signature cannot overwrite an asset or choose another user's delivery ID.
- Members and content authors browse and manage their own upload namespace.
- Existing content reviewers may browse the site's configured root. Shared
  deletion/metadata changes additionally require the matching delete permission.
  A creator's `article:delete` alone does not grant shared-library access.
- No actor can access another site's root. Search filters are validated and
  state-changing routes require a same-origin request. Responses are not cached.

Set `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`, and
optionally `CLOUDINARY_UPLOAD_FOLDER` (default `images`). Legacy public env
aliases remain supported, but client uploads receive provider identifiers from
the authenticated signing response, so secrets can be configured at runtime.

The 10 MB client check is a usability check, not an authoritative provider quota.
Provider limits and durable shared rate limiting remain release requirements.
No unsigned upload preset is introduced. Do not enable one as a workaround.

Run `npm run test:media-security`. These tests validate the policy with mocked
sessions/provider responses; they are not evidence of an actual Cloudinary upload
or production-account login. Those still require authorized live verification.
