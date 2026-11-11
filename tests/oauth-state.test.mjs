import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { issueOAuthState, verifyOAuthState, oauthStateCookie, oauthStateCookieName, oauthSiteOrigin } from '../src/lib/oauth-state.mjs';
import { oauthLoginUrl } from '../src/lib/oauth-url.mjs';
const secret = 'isolated-unit-state-signing-key-32-characters';
const now = Date.parse('2026-10-09T07:00:00Z');

test('signed state binds a random challenge to one browser cookie', () => {
  const a = issueOAuthState(secret, now), b = issueOAuthState(secret, now);
  assert.match(a.state, /^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(a.state, b.state);
  assert.ok(verifyOAuthState(a.state, a.cookie, secret, now));
  assert.equal(verifyOAuthState(a.state, b.cookie, secret, now), false);
});
test('missing, malformed, duplicated and tampered state or cookie fail closed', () => {
  const { state, cookie } = issueOAuthState(secret, now);
  for (const input of [undefined, '', [], [state, state], 'wrong', state + 'x']) assert.equal(verifyOAuthState(input, cookie, secret, now), false);
  for (const input of [undefined, '', [], state, cookie + '.extra', cookie.slice(0, -1) + (cookie.endsWith('A') ? 'B' : 'A'), cookie.replace('v1', 'v2'), cookie.replace(state, 'A'.repeat(43)), cookie.replace(cookie.split('.')[2], String(Number(cookie.split('.')[2]) + 1))]) {
    assert.equal(verifyOAuthState(state, input, secret, now), false);
  }
  assert.equal(verifyOAuthState(state, cookie, secret + '-rotated', now), false);
  assert.equal(verifyOAuthState(state, cookie, '', now), false);
});
test('state expires at ten minutes and cannot be issued in the future', () => {
  const { state, cookie } = issueOAuthState(secret, now);
  assert.ok(verifyOAuthState(state, cookie, secret, now + 599000));
  assert.equal(verifyOAuthState(state, cookie, secret, now + 600000), false);
  assert.equal(verifyOAuthState(state, cookie, secret, now - 1000), false);
  assert.throws(() => issueOAuthState(''), /not configured/);
});
test('production browser cookie is host-only Secure HttpOnly and consumable', () => {
  const cookie = oauthStateCookie('signed-fixture', true);
  assert.match(cookie, /^__Host-kaisource\.oauth-state=/);
  for (const flag of ['Path=/', 'HttpOnly', 'SameSite=Lax', 'Secure', 'Max-Age=600']) assert.ok(cookie.includes(flag));
  assert.ok(!cookie.includes('Domain='));
  assert.match(oauthStateCookie('', true, true), /Max-Age=0/);
  assert.equal(oauthStateCookieName(false), 'kaisource.oauth-state');
  assert.ok(!oauthStateCookie('fixture', false).includes('Secure'));
});
test('configured HTTPS origin is authoritative, never a forwarded Host', () => {
  assert.equal(oauthSiteOrigin('https://www.kaisource.org', true), 'https://www.kaisource.org');
  for (const origin of [undefined, 'http://www.kaisource.org', 'https://user:pass@www.kaisource.org', 'https://www.kaisource.org/login', 'https://www.kaisource.org/?next=attacker', 'https://www.kaisource.org/#x']) assert.equal(oauthSiteOrigin(origin, true), null);
  assert.equal(oauthSiteOrigin('http://localhost:3000', false), 'http://localhost:3000');
  assert.equal(oauthSiteOrigin('http://external.example.test', false), null);
});
test('provider navigation requires state and replaces stale provider state', () => {
  const provider = 'https://provider.example.test/authorize?state=stale&client_id=fixture';
  assert.equal(oauthLoginUrl(provider, 'https://www.kaisource.org', '/login'), null);
  const { state } = issueOAuthState(secret, now);
  const url = new URL(oauthLoginUrl(provider, 'https://www.kaisource.org', '/login', state));
  assert.deepEqual(url.searchParams.getAll('state'), [state]);
});
test('server authorizer validates browser state before exchanging a provider code', () => {
  const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
  const auth = read('src/pages/api/auth/[...nextauth].ts');
  assert.ok(auth.indexOf('verifyOAuthState(credentials.state') < auth.indexOf('await loginUser(loginParams)'));
  assert.match(auth, /if \(!validState/);
  assert.match(auth, /oauthStateCookie\('', secure, true\)/);
  assert.match(read('src/pages/login/index.tsx'), /state: state as string/);
  assert.doesNotMatch(read('src/components/Auth.tsx'), /signIn\(/);
});
