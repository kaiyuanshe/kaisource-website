// A locale is a route within a deployment, not a reason to leave its domain.
// Azure defaults to Chinese; Vercel/preview defaults to English. An explicit
// setting keeps this same code portable to any future hosting platform.
export function siteLocaleConfig(env = process.env) {
  const locales = ['zh-CN', 'zh-TW', 'en'];
  const defaultLocale = env.SITE_DEFAULT_LOCALE ||
    (env.SITE_PREVIEW_MODE === 'true' || env.VERCEL === '1' ? 'en' : 'zh-CN');
  if (!locales.includes(defaultLocale)) throw new Error('SITE_DEFAULT_LOCALE must be zh-CN, zh-TW, or en');
  return { locales, defaultLocale, localeDetection: false };
}
