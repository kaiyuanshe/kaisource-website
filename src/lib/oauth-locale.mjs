// The provider always returns to the one registered /login callback. Keep only
// the display language in this tab; authentication remains bound by server state.
export const oauthLocaleKey = 'kaisource.oauth.return-locale';
const locales = new Set(['zh-CN', 'zh-TW', 'en']);
const lifetime = 10 * 60 * 1000;

export function rememberOAuthLocale(locale, storage, now = Date.now()) {
  try {
    const target = storage ?? globalThis.sessionStorage;
    if (locales.has(locale)) target?.setItem(oauthLocaleKey, JSON.stringify({ locale, startedAt: now }));
    else target?.removeItem(oauthLocaleKey);
  } catch {
    // A browser that disables storage must still be able to sign in.
  }
}

export function consumeOAuthLocale(fallback = 'en', storage, now = Date.now()) {
  const defaultLocale = locales.has(fallback) ? fallback : 'en';
  try {
    const target = storage ?? globalThis.sessionStorage;
    const saved = target?.getItem(oauthLocaleKey);
    target?.removeItem(oauthLocaleKey);
    const value = JSON.parse(saved || 'null');
    if (locales.has(value?.locale) && Number.isFinite(value?.startedAt) && value.startedAt <= now && now - value.startedAt < lifetime) return value.locale;
  } catch {
    // Malformed or inaccessible storage is a locale fallback, never auth input.
  }
  return defaultLocale;
}
