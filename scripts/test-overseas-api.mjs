// Non-destructive HTTPS smoke tests. Never solve a CAPTCHA, send mail, create
// accounts/content, read private user records or change permissions.
import assert from 'node:assert/strict';
const base = process.env.KAISOURCE_SMOKE_API;
if (!base) throw new Error('Set KAISOURCE_SMOKE_API to the approved HTTPS /v1 endpoint');
const origin = new URL(base);
assert.equal(origin.protocol, 'https:');
assert.equal(origin.username, ''); assert.equal(origin.password, '');
assert.equal(origin.search, ''); assert.equal(origin.hash, '');
const api = base.replace(/\/+$/, '');
const checks = [];
async function request(path, { method = 'GET', body, headers = {} } = {}) {
  const response = await fetch(`${api}${path}`, {
    method, headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...headers },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(15000), cache: 'no-store',
  });
  let data;
  try { data = await response.json(); } catch { throw new Error(`Non-JSON response for ${method} ${path}: ${response.status}`); }
  return { response, data };
}
async function check(name, fn) { await fn(); checks.push(name); console.log(`PASS ${name}`); }
await check('anonymous bilingual articles are published, including forced draft filters', async () => {
  for (const locale of ['en', 'zh-CN', 'zh-TW']) {
    for (const publish_status of [0, 1, 2]) {
      const { response, data } = await request(`/articles?locale=${locale}&publish_status=${publish_status}&page=1&page_size=10`);
      assert.equal(response.status, 200); assert.equal(data.code, 200);
      assert.ok(Array.isArray(data.data.articles));
      for (const article of data.data.articles) assert.equal(article.publish_status, 2);
    }
  }
});
await check('event reads work in both languages', async () => {
  for (const locale of ['en', 'zh-CN']) {
    const { response, data } = await request(`/events?locale=${locale}&page=1&page_size=1`);
    assert.equal(response.status, 200); assert.equal(data.code, 200);
    assert.ok(Array.isArray(data.data.events));
  }
});
let challenge;
await check('captcha is a non-cacheable PNG with no answer field', async () => {
  const { response, data } = await request('/captcha/generate', { method: 'POST', body: {} });
  assert.equal(response.status, 200); assert.equal(data.code, 200);
  assert.ok(response.headers.get('cache-control')?.includes('no-store'));
  assert.match(data.data.captchaId, /^[a-f0-9]{32}$/);
  assert.match(data.data.imageData, /^data:image\/png;base64,/);
  assert.ok(!Object.keys(data.data).some(key => /answer|text|secret/i.test(key)));
  const png = Buffer.from(data.data.imageData.split(',')[1], 'base64');
  assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  challenge = data.data.captchaId;
});
await check('incorrect answer and replay never produce a registration proof', async () => {
  // 0 is outside the generated CAPTCHA alphabet, so this is guaranteed wrong.
  for (let i = 0; i < 2; i++) {
    const { response, data } = await request('/captcha/verify', {
      method: 'POST', body: { captchaId: challenge, captcha: '000000', email: 'smoke@example.test' },
    });
    assert.equal(response.status, 400); assert.equal(data.code, 400);
    assert.ok(!data.data?.verificationToken);
  }
});
await check('registration without proof is rejected before account creation or mail', async () => {
  const { response, data } = await request('/register', {
    method: 'POST', body: { email: 'smoke@example.test', username: 'smoke', password: 'invalid-smoke-test-password' },
  });
  assert.equal(response.status, 400); assert.equal(data.code, 400);
});
await check('anonymous writes are rejected', async () => {
  for (const path of ['/articles', '/events']) {
    const { response, data } = await request(path, { method: 'POST', body: {} });
    assert.equal(response.status, 401); assert.equal(data.code, 401);
  }
});
await check('forged bearer tokens cannot access draft reads', async () => {
  const { response, data } = await request('/articles?publish_status=1', { headers: { Authorization: 'Bearer invalid' } });
  assert.equal(response.status, 401); assert.equal(data.code, 401);
});
console.log(`Completed ${checks.length} non-destructive production API checks.`);
