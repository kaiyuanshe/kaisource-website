import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { readFileSync } from 'node:fs';
import { proxyAPI, upstreamURL } from '../src/lib/api-proxy.mjs';

async function server(t, handler) {
  const s = http.createServer(handler);
  s.listen(0, '127.0.0.1');
  await once(s, 'listening');
  t.after(() => { s.closeAllConnections(); s.close(); });
  return `http://127.0.0.1:${s.address().port}`;
}
async function fixture(t, handler, options = {}) {
  const origin = await server(t, handler);
  const events = [];
  const base = await server(t, (req, res) => proxyAPI(req, res, { origin, allowLocalHTTP: true, log: e => events.push(e), ...options }));
  return { base, events };
}

test('fixed upstream preserves namespace/query and rejects traversal or external destinations', () => {
  assert.equal(upstreamURL('https://example.test/kaisource-api', '/v1/articles?locale=en&page=1').href, 'https://example.test/kaisource-api/v1/articles?locale=en&page=1');
  assert.equal(upstreamURL('https://example.test', '/api/upstream/captcha/generate').pathname, '/v1/captcha/generate');
  for (const path of ['/v1/../admin', '/v1/%2e%2e/admin', '/v1/a%2fb', '/v1/a%5cb', '/v1/a%00b', '//else.test/v1/articles', '/admin', '/v1/articles//1']) assert.throws(() => upstreamURL('https://example.test', path));
  for (const origin of ['http://example.test', 'https://user:pass@example.test', 'https://example.test?target=else', 'https://example.test#fragment']) assert.throws(() => upstreamURL(origin, '/v1/articles'));
});

test('proxy preserves methods/body/bearer, strips cookies and spoofed forwarding, disables caching', async t => {
  let observed;
  const { base, events } = await fixture(t, async (req, res) => {
    let body = ''; for await (const chunk of req) body += chunk;
    observed = { body, headers: req.headers, method: req.method, url: req.url };
    res.writeHead(401, { 'Content-Type': 'application/json', 'Cache-Control': 'public,max-age=999' });
    res.end('{"code":401}');
  });
  const response = await fetch(`${base}/v1/login-email?private=never-log`, { method: 'POST', headers: { authorization: 'Bearer fixture-secret', cookie: 'session=private', 'x-forwarded-for': '1.2.3.4', 'x-vercel-protection-bypass': 'private', 'content-type': 'application/json' }, body: '{"email":"private@example.test"}' });
  assert.equal(response.status, 401); assert.deepEqual(await response.json(), { code: 401 });
  assert.equal(observed.method, 'POST'); assert.equal(observed.body, '{"email":"private@example.test"}');
  assert.equal(observed.headers.authorization, 'Bearer fixture-secret');
  for (const name of ['cookie', 'x-forwarded-for', 'x-vercel-protection-bypass']) assert.equal(observed.headers[name], undefined);
  assert.equal(observed.headers.connection, 'close');
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('vercel-cdn-cache-control'), 'no-store');
  assert.ok(response.headers.get('x-request-id'));
  assert.ok(events.length === 1);
  assert.doesNotMatch(JSON.stringify(events), /fixture-secret|never-log|private@example/);
});

test('upstream deadline is an explicit 504 and POST is never retried', async t => {
  let attempts = 0;
  const { base, events } = await fixture(t, () => { attempts++; }, { timeoutMs: 80 });
  const r = await fetch(`${base}/v1/register`, { method: 'POST', body: '{}' });
  assert.equal(r.status, 504); assert.equal((await r.json()).code, 504);
  assert.equal(attempts, 1); assert.equal(events[0].outcome, 'deadline');
});

test('disconnects return 502 without an automatic retry', async t => {
  let attempts = 0;
  const { base } = await fixture(t, req => { attempts++; req.socket.destroy(); });
  const r = await fetch(`${base}/v1/articles`);
  assert.equal(r.status, 502); await r.text(); assert.equal(attempts, 1);
});

test('redirect cannot leak authorization or private upstream URL', async t => {
  const { base } = await fixture(t, (_req, res) => { res.writeHead(302, { location: 'https://other.test/?private=secret' }); res.end(); });
  const r = await fetch(`${base}/v1/articles`, { redirect: 'manual' });
  assert.equal(r.status, 502); assert.equal(r.headers.get('location'), null);
  assert.doesNotMatch(await r.text(), /other.test|secret/);
});

test('large requests are rejected before contacting upstream', async t => {
  let calls = 0;
  const { base } = await fixture(t, () => { calls++; });
  const result = await new Promise(resolve => {
    const r = http.request(`${base}/v1/articles`, { method: 'POST', headers: { 'content-length': 11 * 1024 * 1024 } }, res => { res.resume(); res.on('end', () => resolve(res.statusCode)); });
    r.end();
  });
  assert.equal(result, 413); assert.equal(calls, 0);
});

test('SSE is streamed without buffering and remains bounded', async t => {
  const { base, events } = await fixture(t, (_req, res) => { res.writeHead(200, { 'content-type': 'text/event-stream' }); res.write('data: fixture\n\n'); }, { timeoutMs: 30, streamTimeoutMs: 100 });
  const response = await fetch(`${base}/v1/statistics/stream`);
  const reader = response.body.getReader();
  assert.match(Buffer.from((await reader.read()).value).toString(), /data: fixture/);
  await assert.rejects(async () => { while (!(await reader.read()).done) {} });
  assert.equal(events[0].outcome, 'stream_deadline');
});

test('production rewrite is internal; preview keeps its read-only namespace', () => {
  const source = readFileSync(new URL('../next.config.ts', import.meta.url), 'utf8');
  assert.match(source, /destination: "\/api\/upstream\/:path\*"/);
  assert.match(source, /destination: "\/api\/preview\/:path\*"/);
});

test('browser requests are bounded and permission denial keeps the authenticated session', () => {
  const source = readFileSync(new URL('../src/services/api.ts', import.meta.url), 'utf8');
  assert.match(source, /signal: AbortSignal.timeout\(20000\)/);
  assert.match(source, /if \(!preview && response.status === 401\) await signOut/);
  const login = readFileSync(new URL('../src/services/login.ts', import.meta.url), 'utf8');
  assert.equal((login.match(/signal: AbortSignal.timeout/g) || []).length, 4);
});
