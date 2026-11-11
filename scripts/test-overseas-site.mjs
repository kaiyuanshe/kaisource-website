// Non-destructive tests of the deployed Next frontend, not just its Go API.
// Never solve a CAPTCHA, send email, create accounts, upload or edit content.
import assert from 'node:assert/strict';
const configured = process.env.KAISOURCE_SMOKE_SITE;
assert.ok(configured, 'Set KAISOURCE_SMOKE_SITE to the approved HTTPS site origin');
const site = new URL(configured);
assert.equal(site.protocol, 'https:');
assert.equal(site.username, ''); assert.equal(site.password, '');
assert.equal(site.pathname, '/'); assert.equal(site.search, ''); assert.equal(site.hash, '');
const checks = [];
async function request(path, options = {}) {
  return fetch(new URL(path, site), {
    ...options, signal: AbortSignal.timeout(20000), cache: 'no-store',
  });
}
async function check(name, fn) {
  await fn(); checks.push(name); console.log(`PASS ${name}`);
}
function uncached(response) {
  assert.ok(response.headers.get('cache-control')?.includes('no-store'));
}
await check('English and Chinese pages load on the same origin', async () => {
  for (const [prefix, lang] of [['', 'en'], ['/zh-CN', 'zh-CN']]) {
    for (const path of ['/', '/login', '/blogs', '/events']) {
      const response = await request(`${prefix}${path}`);
      assert.equal(response.status, 200, `${prefix}${path}`);
      assert.equal(new URL(response.url).origin, site.origin);
      const html = await response.text();
      assert.ok(html.includes(`<html lang="${lang}"`), `${prefix}${path}: language`);
      assert.ok(!html.includes('This page could not be found'));
    }
  }
});
let captcha;
await check('frontend captcha compatibility route preserves POST and stays same-origin', async () => {
  const response = await request('/api/captcha/generate', {
    method: 'POST', redirect: 'manual',
    headers: { 'content-type': 'application/json' }, body: '{}',
  });
  assert.equal(response.status, 307); uncached(response);
  const target = new URL(response.headers.get('location'), site);
  assert.equal(target.origin, site.origin); assert.equal(target.pathname, '/v1/captcha/generate');
  // Follow explicitly: older Node/Undici builds mishandle POST body lengths
  // on automatic 307 redirects. Browser redirect behavior is checked separately.
  const followed = await request(target.pathname, {
    method: 'POST', redirect: 'manual',
    headers: { 'content-type': 'application/json' }, body: '{}',
  });
  assert.equal(followed.status, 200); uncached(followed);
  assert.equal(new URL(followed.url).origin, site.origin);
  const data = await followed.json(); assert.equal(data.code, 200);
  assert.match(data.data.imageData, /^data:image\/png;base64,/);
  assert.match(data.data.captchaId, /^[a-f0-9]{32}$/);
  captcha = data.data.captchaId;
});
await check('frontend verifier rejects a wrong answer without issuing a proof', async () => {
  const options = { method: 'POST', redirect: 'manual',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ captchaId: captcha, captcha: '000000', email: 'smoke@example.test' }),
  };
  const redirect = await request('/api/captcha/verify', options);
  assert.equal(redirect.status, 307); uncached(redirect);
  const target = new URL(redirect.headers.get('location'), site);
  assert.equal(target.origin, site.origin); assert.equal(target.pathname, '/v1/captcha/verify');
  const response = await request(target.pathname, options);
  assert.equal(response.status, 400); uncached(response);
  const data = await response.json(); assert.equal(data.code, 400);
  assert.ok(!data.data?.verificationToken);
});
await check('captcha compatibility routes reject GET', async () => {
  for (const path of ['/api/captcha/generate', '/api/captcha/verify']) {
    const response = await request(path);
    assert.equal(response.status, 405); assert.equal(response.headers.get('allow'), 'POST');
    uncached(response);
  }
});
await check('NextAuth unauthenticated session is healthy and not cacheable', async () => {
  const response = await request('/api/auth/session');
  assert.equal(response.status, 200); uncached(response);
  const session = await response.json();
  assert.ok(session && typeof session === 'object' && !Array.isArray(session));
  assert.equal(Object.keys(session).length, 0, 'Anonymous session must be empty');
});
await check('NextAuth rejects bogus credentials and never creates a session', async () => {
  const csrfResponse = await request('/api/auth/csrf');
  assert.equal(csrfResponse.status, 200); uncached(csrfResponse);
  const { csrfToken } = await csrfResponse.json(); assert.ok(csrfToken);
  const cookies = csrfResponse.headers.getSetCookie();
  const csrfCookie = cookies.find(value => value.startsWith('__Host-next-auth.csrf-token='));
  assert.ok(csrfCookie); assert.ok(/; Secure/i.test(csrfCookie), 'CSRF cookie must be Secure');
  assert.ok(/; HttpOnly/i.test(csrfCookie), 'CSRF cookie must be HttpOnly');
  assert.ok(/; SameSite=Lax/i.test(csrfCookie), 'CSRF cookie must be SameSite=Lax');
  const response = await request('/api/auth/callback/email-login', {
    method: 'POST', redirect: 'manual', headers: {
      'content-type': 'application/x-www-form-urlencoded',
      cookie: cookies.map(value => value.split(';')[0]).join('; '), origin: site.origin,
    },
    body: new URLSearchParams({ csrfToken, email: 'smoke@example.test',
      password: 'invalid-smoke-test-password', json: 'true', callbackUrl: `${site.origin}/login` }),
  });
  assert.equal(response.status, 401);
  const data = await response.json();
  assert.equal(new URL(data.url).searchParams.get('error'), 'CredentialsSignin');
  assert.ok(!response.headers.getSetCookie().some(value => /^(?:__Secure-)?next-auth\.session-token=/.test(value)));
});
await check('anonymous callers cannot obtain Cloudinary upload or deletion signatures', async () => {
  for (const path of ['/api/cloudinary/cloudinary-sign', '/api/cloudinary/cloudinary-sign-destroy']) {
    const response = await request(path, { method: 'POST',
      headers: { 'content-type': 'application/json', origin: site.origin }, body: '{}' });
    assert.equal(response.status, 401); uncached(response);
    const data = await response.json(); assert.ok(!data.signature);
  }
});
console.log(`Completed ${checks.length} non-destructive deployed frontend checks.`);
