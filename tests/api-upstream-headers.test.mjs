import test from 'node:test';
import assert from 'node:assert/strict';
import { upstreamProtectionHeaders } from '../src/lib/api-upstream-headers.mjs';

const settings = { API_PROXY_BYPASS_ORIGIN: 'https://backend.example.test', API_PROXY_BYPASS_SECRET: 'fixture-protection-secret' };

test('configured backend receives its server credential on API paths', () => {
  assert.deepEqual(upstreamProtectionHeaders('https://backend.example.test/v1/login', settings), { 'x-vercel-protection-bypass': 'fixture-protection-secret' });
});
test('rollback origins and lookalike hosts do not receive the credential', () => {
  for (const destination of ['https://kaiyuanshe.cn/kaisource-api/v1/login', 'https://backend.example.test.evil.test/v1/login', 'https://evil.test/?next=https://backend.example.test', 'https://backend.example.test:8443/v1/login']) {
    assert.deepEqual(upstreamProtectionHeaders(destination, settings), {});
  }
});
test('unencrypted and credential-bearing URLs fail closed', () => {
  for (const destination of ['http://backend.example.test/v1/login', 'https://user:password@backend.example.test/v1/login', 'invalid-url']) {
    assert.deepEqual(upstreamProtectionHeaders(destination, settings), {});
  }
});
test('missing, malformed, or path-bearing origin configuration does not send a secret', () => {
  for (const origin of [undefined, 'invalid-url', 'http://backend.example.test', 'https://backend.example.test/path', 'https://backend.example.test/?secret=fixture', 'https://user:password@backend.example.test']) {
    assert.deepEqual(upstreamProtectionHeaders('https://backend.example.test/v1/login', { ...settings, API_PROXY_BYPASS_ORIGIN: origin }), {});
  }
});
test('missing secrets and header injection fail closed', () => {
  for (const secret of ['', undefined, 'fixture\r\ninjected-header: value']) {
    assert.deepEqual(upstreamProtectionHeaders('https://backend.example.test/v1/login', { ...settings, API_PROXY_BYPASS_SECRET: secret }), {});
  }
});
