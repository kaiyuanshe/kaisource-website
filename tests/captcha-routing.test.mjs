import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
for (const action of ['generate', 'verify']) {
  test(`${action} route declares a non-cacheable same-origin POST redirect without local state`, () => {
    const source = readFileSync(new URL(`../src/pages/api/captcha/${action}.ts`, import.meta.url), 'utf8');
    assert.ok(source.includes(`res.redirect(307, '/v1/captcha/${action}')`));
    assert.match(source, /setHeader\('Cache-Control', 'no-store'\)/);
    assert.doesNotMatch(source, /new Map|Math\.random|verifyCaptcha\(/);
  });
  test(`${action} declares rejection of other methods`, () => {
    const source = readFileSync(new URL(`../src/pages/api/captcha/${action}.ts`, import.meta.url), 'utf8');
    assert.match(source, /req\.method !== 'POST'/);
    assert.match(source, /res\.status\(405\)/);
    assert.match(source, /setHeader\('Allow', 'POST'\)/);
  });
}
test('registration binds email during verification and forwards the one-use proof', () => {
  const source = readFileSync(new URL('../src/pages/login/index.tsx', import.meta.url), 'utf8');
  assert.match(source, /email: email\.trim\(\)/);
  assert.match(source, /verificationToken = verifyResult\.data\?\.verificationToken/);
  assert.match(source, /registerUser\(\{[\s\S]*?verificationToken,/);
  assert.doesNotMatch(source, /verificationToken: ''/);
});
test('captcha refresh clears stale IDs and rejects stale responses or non-raster payloads', () => {
  const source = readFileSync(new URL('../src/components/Captcha/index.tsx', import.meta.url), 'utf8');
  assert.match(source, /onChange\?\.\(''\)/);
  assert.match(source, /currentRequest !== requestNumber\.current/);
  assert.match(source, /data:image\/png;base64,/);
  assert.match(source, /return \(\) => \{ requestNumber\.current\+\+ \}/);
});
