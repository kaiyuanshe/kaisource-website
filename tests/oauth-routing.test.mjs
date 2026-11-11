import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const state = 'A'.repeat(43);
import { configuredOAuthUrl, oauthLoginUrl } from '../src/lib/oauth-url.mjs';
test('missing, malformed or insecure OAuth configuration never navigates to undefined', () => {
  for (const provider of [undefined, '', 'undefined', '/relative', 'http://provider.example.test/', 'https://user:secret@provider.example.test/', 'https://provider.example.test/#fragment']) {
    assert.equal(configuredOAuthUrl(provider), null);
    assert.equal(oauthLoginUrl(provider, 'https://www.kaisource.org', '/login', state), null);
  }
});
test('provider parameters are retained and callback uses the registered overseas login URI', () => {
  const url = new URL(oauthLoginUrl('https://provider.example.test/authorize?client_id=fixture&redirect_uri=stale', 'https://www.kaisource.org', '/zh-CN/login?code=do-not-forward&token=do-not-forward', state));
  assert.equal(url.searchParams.get('client_id'), 'fixture');
  assert.equal(url.searchParams.get('redirect_uri'), 'https://www.kaisource.org/login');
  assert.equal(url.searchParams.getAll('redirect_uri').length, 1);
  assert.equal(url.searchParams.get('scope'), 'read:user user:email');
  assert.equal(url.searchParams.get('state'), state);
  assert.ok(!url.href.includes('do-not-forward'));
});
test('callbacks cannot escape the current deployment', () => {
  assert.equal(oauthLoginUrl('https://provider.example.test/', 'https://www.kaisource.org', '//attacker.example.test/login', state), null);
});
test('header email login uses the local login page and GitHub login is gated by config', () => {
  const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
  const header = read('src/components/Auth.tsx');
  assert.match(header, /router\.push\("\/login"\)/);
  assert.doesNotMatch(header, /NEXT_PUBLIC_OAUTH/);
  const github = read('src/components/GitHubLoginButton.tsx');
  assert.match(github, /disabled=\{!providerReady\}/);
  assert.match(github, /fetch\('\/api\/oauth\/start'/);
  assert.match(github, /window\.location\.assign/);
  assert.doesNotMatch(github, /\$\{process\.env\.NEXT_PUBLIC_OAUTH\}/);
});

test('every page and locale uses the same exact registered callback', () => {
  for (const path of ['/blogs', '/zh-CN/login', '/zh-TW/login', '/login?token=do-not-forward']) {
    const url = new URL(oauthLoginUrl('https://provider.example.test/authorize', 'https://www.kaisource.org', path, state));
    assert.equal(url.searchParams.get('redirect_uri'), 'https://www.kaisource.org/login');
  }
});
