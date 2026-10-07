// Server-side policy shared by all media routes. Never trust client-supplied
// permissions, folder names, or user IDs. The live API rechecks account rights.
export function mediaRoot(env = process.env) {
  const root = (env.CLOUDINARY_UPLOAD_FOLDER || env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_FOLDERS || "images").replace(/\/+$/, "");
  return validPath(root) ? root : null;
}

function validPath(value) {
  return typeof value === "string" && value.length <= 200 &&
    /^[\p{L}\p{N}_-]+(?:\/[\p{L}\p{N}_-]+)*$/u.test(value);
}

function editorPermissions(permissions) {
  return ["article", "event", "tutorial", "dapp"].some(kind => permissions.includes(`${kind}:review`));
}

export function canManageSharedMedia(permissions) {
  return ["article", "event", "tutorial", "dapp"].some(kind =>
    permissions.includes(`${kind}:review`) && permissions.includes(`${kind}:delete`));
}

export function mediaScope(actor, root) {
  return editorPermissions(actor.permissions) ? root : `${root}/users/${actor.uid}`;
}

export function scopedFolder(actor, root, requested) {
  const scope = mediaScope(actor, root);
  const folder = requested || scope;
  return validPath(folder) && (folder === scope || folder.startsWith(`${scope}/`)) ? folder : null;
}

export function canMutateMedia(actor, root, publicId) {
  if (typeof publicId !== "string" || publicId.length > 240 || !/^[\p{L}\p{N}_./-]+$/u.test(publicId)) return false;
  if (publicId.split("/").some(part => !part || part === "." || part === "..")) return false;
  const scope = canManageSharedMedia(actor.permissions) ? root : `${root}/users/${actor.uid}`;
  return publicId.startsWith(`${scope}/`) && publicId.length > scope.length + 1;
}

export function mediaSearchExpression(folder, search) {
  // Scope by delivery identifier, which works in fixed and dynamic folder
  // modes. Do not use an exact-match operator for a wildcard prefix.
  let expression = `resource_type:image AND type:upload AND public_id:${folder}/*`;
  if (search) expression += ` AND filename:"${search}"`;
  return expression;
}

export function sameOriginRequest(req) {
  try {
    const origin = new URL(req.headers.origin);
    return ["https:", "http:"].includes(origin.protocol) && origin.host === req.headers.host;
  } catch {
    return false;
  }
}

// Dependency injection keeps tests independent of real sessions and providers.
// This routine never emits bearer tokens, account details, or provider errors.
export async function authorizeMediaRequest(req, readSessionToken, env = process.env, fetchImpl = fetch) {
  if (env.SITE_PREVIEW_MODE === "true" || env.NEXT_PUBLIC_SITE_PREVIEW_MODE === "true") {
    return { status: 503, error: "Media is unavailable in preview mode" };
  }
  const token = await readSessionToken(req);
  if (!token || typeof token.token !== "string" || !/^\d+$/.test(String(token.uid)) || Number(token.uid) < 1) {
    return { status: 401, error: "Please sign in again" };
  }
  if (req.method !== "GET" && !sameOriginRequest(req)) {
    return { status: 403, error: "A same-origin request is required" };
  }
  const raw = env.INTERNAL_API_URL || (env.API_PROXY_ORIGIN ? `${env.API_PROXY_ORIGIN.replace(/\/+$/, "")}/v1` : "");
  let base;
  try {
    base = new URL(raw);
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(base.hostname);
    if (base.protocol !== "https:" && !(base.protocol === "http:" && local && env.NODE_ENV !== "production")) throw new Error();
    if (base.username || base.password || base.search || base.hash) throw new Error();
  } catch {
    return { status: 503, error: "Account verification is unavailable" };
  }
  try {
    const response = await fetchImpl(`${base.href.replace(/\/+$/, "")}/users/${token.uid}`, {
      headers: { Authorization: `Bearer ${token.token}` },
      cache: "no-store", redirect: "error", signal: AbortSignal.timeout(8000),
    });
    if (response.status === 401 || response.status === 403) {
      return { status: response.status, error: "Please sign in again to refresh your permissions" };
    }
    if (!response.ok) return { status: 503, error: "Account verification is unavailable" };
    const result = await response.json();
    if (result.code !== 200 || String(result.data?.ID) !== String(token.uid)) {
      return { status: 401, error: "Please sign in again" };
    }
    // The API validates its JWT against the current database permissions. Use
    // that JWT's claims rather than a separately cached client permission list.
    const parts = token.token.split(".");
    const claims = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    if (String(claims.uid) !== String(token.uid) || !Array.isArray(claims.permissions) ||
        !claims.permissions.every(permission => typeof permission === "string")) {
      return { status: 401, error: "Please sign in again" };
    }
    return { actor: { uid: String(token.uid), permissions: claims.permissions } };
  } catch {
    return { status: 503, error: "Account verification is unavailable" };
  }
}
