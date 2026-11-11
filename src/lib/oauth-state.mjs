// Server-only OAuth browser binding. Never import this module into client code.
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export const OAUTH_STATE_TTL_SECONDS = 600;
export const oauthStateCookieName = secure => secure ? '__Host-kaisource.oauth-state' : 'kaisource.oauth-state';
const statePattern = /^[A-Za-z0-9_-]{43}$/;
const sign = (payload, secret) => createHmac('sha256', secret).update(`kaisource-oauth-state:${payload}`).digest('base64url');
const validSecret = secret => typeof secret === 'string' && secret.length >= 32;
const equal = (left, right) => {
  if (typeof left !== 'string' || typeof right !== 'string') return false;
  const a = Buffer.from(left), b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
};

export function issueOAuthState(secret, now = Date.now()) {
  if (!validSecret(secret)) throw new Error('OAuth state signing is not configured');
  const state = randomBytes(32).toString('base64url');
  const payload = `v1.${state}.${Math.floor(now / 1000)}`;
  return { state, cookie: `${payload}.${sign(payload, secret)}` };
}

export function verifyOAuthState(state, cookie, secret, now = Date.now()) {
  if (!validSecret(secret) || typeof state !== 'string' || !statePattern.test(state) || typeof cookie !== 'string' || cookie.length > 200) return false;
  const parts = cookie.split('.');
  if (parts.length !== 4 || parts[0] !== 'v1' || !statePattern.test(parts[1]) || !/^\d{10}$/.test(parts[2]) || !statePattern.test(parts[3])) return false;
  const issued = Number(parts[2]), current = Math.floor(now / 1000);
  if (issued > current || current - issued >= OAUTH_STATE_TTL_SECONDS) return false;
  return equal(parts[3], sign(parts.slice(0, 3).join('.'), secret)) && equal(state, parts[1]);
}

export function oauthStateCookie(value, secure, clear = false) {
  return `${oauthStateCookieName(secure)}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${clear ? 0 : OAUTH_STATE_TTL_SECONDS}${secure ? '; Secure' : ''}`;
}

// Do not derive the callback or trust boundary from attacker-controlled Host or
// forwarded headers. Production always requires the configured HTTPS origin.
export function oauthSiteOrigin(value, secure) {
  try {
    const site = new URL(value);
    if (site.username || site.password || site.pathname !== '/' || site.search || site.hash) return null;
    if (site.protocol !== 'https:' && (secure || site.protocol !== 'http:' || !['localhost', '127.0.0.1', '[::1]'].includes(site.hostname))) return null;
    return site.origin;
  } catch { return null; }
}
