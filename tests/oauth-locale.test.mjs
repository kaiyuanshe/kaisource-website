import test from 'node:test';
import assert from 'node:assert/strict';
import { consumeOAuthLocale, oauthLocaleKey, rememberOAuthLocale } from '../src/lib/oauth-locale.mjs';
import { oauthLoginUrl } from '../src/lib/oauth-url.mjs';

function storage() {
  const values = new Map();
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key),
  };
}

test('OAuth remembers each supported language in its own browser tab and consumes it once', () => {
  for (const locale of ['zh-CN', 'zh-TW', 'en']) {
    const tab = storage();
    rememberOAuthLocale(locale, tab, 1000);
    assert.equal(consumeOAuthLocale('en', storage(), 2000), 'en');
    assert.equal(consumeOAuthLocale('en', tab, 2000), locale);
    assert.equal(tab.getItem(oauthLocaleKey), null);
    assert.equal(consumeOAuthLocale('en', tab, 2000), 'en');
  }
});

test('stale, future, malformed or non-locale return values cannot control navigation', () => {
  for (const value of [
    { locale: 'zh-CN', startedAt: 1000 },
    { locale: 'zh-CN', startedAt: 601001 },
    { locale: '//attacker.example', startedAt: 5000 },
    { locale: 'https://attacker.example', startedAt: 5000 },
    { locale: 'en', startedAt: '5000' },
    null,
  ]) {
    const tab = storage();
    tab.setItem(oauthLocaleKey, JSON.stringify(value));
    assert.equal(consumeOAuthLocale('zh-TW', tab, 601000), 'zh-TW');
    assert.equal(tab.getItem(oauthLocaleKey), null);
  }
  const tab = storage();
  tab.setItem(oauthLocaleKey, '{malformed');
  assert.equal(consumeOAuthLocale('en', tab), 'en');
});

test('disabled storage never blocks sign-in and unsupported locales use a safe fallback', () => {
  const disabled = { getItem() { throw Error('disabled'); }, setItem() { throw Error('disabled'); }, removeItem() { throw Error('disabled'); } };
  assert.doesNotThrow(() => rememberOAuthLocale('zh-CN', disabled));
  assert.equal(consumeOAuthLocale('zh-CN', disabled), 'zh-CN');
  const tab = storage();
  rememberOAuthLocale('zh-CN', tab);
  rememberOAuthLocale('//attacker.example', tab);
  assert.equal(consumeOAuthLocale('bad', tab), 'en');
});

test('display language never changes the exact provider-registered callback', () => {
  const result = new URL(oauthLoginUrl('https://github.com/login/oauth/authorize', 'https://www.kaisource.org', '/zh-CN/login', 'a'.repeat(43)));
  assert.equal(result.searchParams.get('redirect_uri'), 'https://www.kaisource.org/login');
});
