import test from 'node:test';
import assert from 'node:assert/strict';
import { siteLocaleConfig } from '../src/lib/site-locales.mjs';
import { readFileSync } from 'node:fs';

test('Azure/standalone defaults to Chinese without any cross-domain locale redirects', () => {
  assert.deepEqual(siteLocaleConfig({}), { locales: ['zh-CN', 'zh-TW', 'en'], defaultLocale: 'zh-CN', localeDetection: false });
});

test('Vercel and previews default to English while keeping all locales on the same domain', () => {
  for (const env of [{ VERCEL: '1' }, { SITE_PREVIEW_MODE: 'true' }]) {
    const config = siteLocaleConfig(env);
    assert.equal(config.defaultLocale, 'en');
    assert.equal(config.domains, undefined);
    assert.equal(config.localeDetection, false);
    assert.ok(config.locales.includes('zh-CN'));
  }
});

test('explicit defaults keep the code portable and invalid locale settings fail fast', () => {
  assert.equal(siteLocaleConfig({ SITE_DEFAULT_LOCALE: 'en' }).defaultLocale, 'en');
  assert.equal(siteLocaleConfig({ VERCEL: '1', SITE_DEFAULT_LOCALE: 'zh-CN' }).defaultLocale, 'zh-CN');
  assert.throws(() => siteLocaleConfig({ SITE_DEFAULT_LOCALE: 'invalid' }), /SITE_DEFAULT_LOCALE/);
});

test('Next config uses the shared locale rules and the switcher preserves the current route', () => {
  const config = readFileSync(new URL('../next.config.ts', import.meta.url), 'utf8');
  const hook = readFileSync(new URL('../src/hooks/useTranslation.ts', import.meta.url), 'utf8');
  assert.match(config, /i18n: siteLocaleConfig\(\)/);
  assert.doesNotMatch(config, /domain: ["'](?:www\.)?(?:kaisource\.org|kaiyuanshe\.cn)/);
  assert.match(hook, /router\.push\(router\.asPath, router\.asPath, \{ locale: newLocale \}\)/);
});

test('locale changes reload page-local data without remounting authentication', () => {
  const app = readFileSync(new URL('../src/pages/_app.tsx', import.meta.url), 'utf8');
  assert.match(app, /<Component key=\{locale\} \{\.\.\.pageProps\} \/>/);
  assert.doesNotMatch(app, /<SessionProvider\s+key=/);
  const source = readFileSync(new URL('../src/lib/currentLocale.ts', import.meta.url), 'utf8');
  assert.match(source, /Router\.locale \|\| document\.documentElement\.lang/);
  for (const file of ['src/services/article.ts', 'src/services/event.ts', 'src/lib/homeData.ts']) {
    assert.match(readFileSync(new URL(`../${file}`, import.meta.url), 'utf8'), /import \{ getCurrentLocale \}/);
  }
});
