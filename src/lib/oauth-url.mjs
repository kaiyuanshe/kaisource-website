// Deployment configuration, not a hard-coded regional callback or provider.
// Only an explicitly configured HTTPS provider may receive the callback URL.
export function configuredOAuthUrl(value) {
  try {
    const url = new URL((value || '').trim());
    if (url.protocol !== 'https:' || url.username || url.password || url.hash) return null;
    return url;
  } catch { return null; }
}
export function oauthLoginUrl(provider, origin, pathname) {
  const url = configuredOAuthUrl(provider);
  if (!url) return null;
  try {
    const site = new URL(origin);
    const requested = new URL(pathname, site.origin);
    if (requested.origin !== site.origin) return null;
    // The provider and authoritative Go token exchange share one exact
    // registered callback. Do not use arbitrary content or localized paths.
    const callback = new URL('/login', site.origin);
    url.searchParams.set('redirect_uri', callback.href);
    url.searchParams.set('scope', 'read:user user:email');
    return url.href;
  } catch { return null; }
}
