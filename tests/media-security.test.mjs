import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { authorizeMediaRequest, mediaRoot, mediaScope, scopedFolder, canMutateMedia, sameOriginRequest, mediaSearchExpression } from '../src/server/media-policy.mjs';

const member = { uid: '42', permissions: [] };
const author = { uid: '43', permissions: ['article:write', 'article:delete'] };
const manager = { uid: '44', permissions: ['article:review', 'article:delete'] };
const req = { method: 'POST', headers: { origin: 'https://www.kaisource.org', host: 'www.kaisource.org' } };
const env = { INTERNAL_API_URL: 'https://api.example.test/v1', NODE_ENV: 'production' };
function session(uid = '42', permissions = []) {
  const claims = Buffer.from(JSON.stringify({ uid: Number(uid), permissions })).toString('base64url');
  return { uid, token: `test.${claims}.fixture`, permissions: ['article:review', 'article:delete'] };
}
const success = () => new Response(JSON.stringify({ code: 200, data: { ID: 42 } }), { status: 200 });

test('media folder configuration rejects unsafe roots', () => {
  assert.equal(mediaRoot({}), 'images');
  assert.equal(mediaRoot({ CLOUDINARY_UPLOAD_FOLDER: 'site/images/' }), 'site/images');
  for (const root of ['../other', 'images OR resource_type:raw', 'images/*', '/images', '']) {
    if (root) assert.equal(mediaRoot({ CLOUDINARY_UPLOAD_FOLDER: root }), null);
  }
});

test('members and authors can only list their own folders, reviewers can browse the site root', () => {
  assert.equal(mediaScope(member, 'images'), 'images/users/42');
  assert.equal(scopedFolder(author, 'images', 'images/users/42'), null);
  assert.equal(scopedFolder(author, 'images', 'images'), null);
  assert.equal(scopedFolder(member, 'images', 'images/users/42/photos'), 'images/users/42/photos');
  assert.equal(scopedFolder(manager, 'images', 'images/legacy'), 'images/legacy');
  assert.equal(scopedFolder(manager, 'images', 'another-site'), null);
});

test('mutation is limited to an owner or a reviewer with delete permission, never an adjacent folder', () => {
  assert.equal(canMutateMedia(member, 'images', 'images/users/42/example'), true);
  assert.equal(canMutateMedia(author, 'images', 'images/users/42/example'), false);
  assert.equal(canMutateMedia(manager, 'images', 'images/legacy/example'), true);
  assert.equal(canMutateMedia({ uid: '44', permissions: ['article:review'] }, 'images', 'images/legacy/example'), false);
  for (const id of ['images2/example', 'images/users/420/example', 'images/users/42/../43/example', 'images/users/42//example', 'images/users/42/%2e%2e/example', 'images/users/42/a&timestamp=1']) {
    assert.equal(canMutateMedia(member, 'images', id), false, id);
  }
});

test('state-changing media requests require a same-origin browser request', () => {
  assert.equal(sameOriginRequest(req), true);
  assert.equal(sameOriginRequest({ headers: { ...req.headers, origin: 'https://attacker.example' } }), false);
  assert.equal(sameOriginRequest({ headers: { host: req.headers.host } }), false);
});

test('anonymous sessions and OAuth identities without a shared API token cannot access storage', async () => {
  for (const token of [null, { uid: '123' }, { token: 'fixture', uid: '../42' }]) {
    const result = await authorizeMediaRequest(req, async () => token, env, () => assert.fail('must not fetch upstream'));
    assert.equal(result.status, 401);
  }
});

test('native NextAuth GitHub sessions are not treated as shared accounts', () => {
  const auth = readFileSync(new URL('../src/pages/api/auth/[...nextauth].ts', import.meta.url), 'utf8');
  assert.match(auth, /account\?\.provider === ['"]github['"][\s\S]*?return false/);
  assert.doesNotMatch(auth, /token\.permissions\s*=\s*\[['"]user['"]\]/);
});

test('authoritative API verification is required and API claims override cached session permissions', async () => {
  let called = false;
  const result = await authorizeMediaRequest(req, async () => session(), env, async (url, options) => {
    called = true;
    assert.equal(url, 'https://api.example.test/v1/users/42');
    assert.equal(options.cache, 'no-store');
    assert.equal(options.redirect, 'error');
    assert.equal(options.headers.Authorization, `Bearer ${session().token}`);
    return success();
  });
  assert.equal(called, true);
  assert.deepEqual(result.actor, member);
});

test('protected backend verification uses only the operator credential at its exact configured origin', async () => {
  const protectedEnv = {
    ...env,
    API_PROXY_BYPASS_ORIGIN: 'https://api.example.test',
    API_PROXY_BYPASS_SECRET: 'fixture-server-protection-key',
  };
  const request = { ...req, headers: { ...req.headers, 'x-vercel-protection-bypass': 'untrusted-browser-value' } };
  const result = await authorizeMediaRequest(request, async () => session(), protectedEnv, async (url, options) => {
    assert.equal(url, 'https://api.example.test/v1/users/42');
    assert.equal(options.redirect, 'error');
    assert.deepEqual(options.headers, {
      Authorization: `Bearer ${session().token}`,
      'x-vercel-protection-bypass': 'fixture-server-protection-key',
    });
    return success();
  });
  assert.deepEqual(result.actor, member);
  assert.ok(!JSON.stringify(result).includes('fixture-server-protection-key'));
});

test('media verification never sends the protection credential to a rollback or different origin', async () => {
  const rollbackEnv = {
    ...env,
    INTERNAL_API_URL: 'https://rollback.example.test/v1',
    API_PROXY_BYPASS_ORIGIN: 'https://api.example.test',
    API_PROXY_BYPASS_SECRET: 'fixture-server-protection-key',
  };
  await authorizeMediaRequest(req, async () => session(), rollbackEnv, async (url, options) => {
    assert.equal(url, 'https://rollback.example.test/v1/users/42');
    assert.deepEqual(options.headers, { Authorization: `Bearer ${session().token}` });
    return success();
  });
});

test('expired tokens and revoked permissions fail closed before storage operations', async () => {
  for (const status of [401, 403, 500]) {
    const result = await authorizeMediaRequest(req, async () => session(), env, async () => new Response('{}', { status }));
    assert.equal(result.status, status === 500 ? 503 : status);
    assert.equal(result.actor, undefined);
  }
  const wrongID = await authorizeMediaRequest(req, async () => session('43'), env, async () => success());
  assert.equal(wrongID.status, 401);
  const mismatch = await authorizeMediaRequest(req, async () => ({ ...session('43'), uid: '42' }), env, async () => success());
  assert.equal(mismatch.status, 401);
});

test('preview, cross-origin, insecure upstream and upstream outages never issue an actor', async () => {
  const preview = await authorizeMediaRequest(req, async () => assert.fail('preview must not load a session'), { ...env, SITE_PREVIEW_MODE: 'true' });
  assert.equal(preview.status, 503);
  const crossOrigin = await authorizeMediaRequest({ ...req, headers: { ...req.headers, origin: 'https://attacker.example' } }, async () => session(), env);
  assert.equal(crossOrigin.status, 403);
  const insecure = await authorizeMediaRequest(req, async () => session(), { ...env, INTERNAL_API_URL: 'http://api.example.test/v1' });
  assert.equal(insecure.status, 503);
  const down = await authorizeMediaRequest(req, async () => session(), env, async () => { throw new Error('provider secret diagnostics'); });
  assert.equal(down.status, 503);
  assert.equal(JSON.stringify(down).includes('secret'), false);
});

test('search is restricted to upload images and an identifier prefix', () => {
  assert.equal(mediaSearchExpression('images/users/42', 'photo'), 'resource_type:image AND type:upload AND public_id:images/users/42/* AND filename:"photo"');
});

test('all Cloudinary routes use live account verification before any provider operation', () => {
  for (const route of ['cloudinary-sign', 'cloudinary-sign-destroy', 'images', 'update-image']) {
    const source = readFileSync(new URL(`../src/pages/api/cloudinary/${route}.ts`, import.meta.url), 'utf8');
    assert.match(source, /await requireMediaActor\(req, res\)/);
    assert.ok(source.indexOf('await requireMediaActor') < source.indexOf('cloudinary.', source.indexOf('export default')));
  }
  const sign = readFileSync(new URL('../src/pages/api/cloudinary/cloudinary-sign.ts', import.meta.url), 'utf8');
  assert.match(sign, /req\.method !== 'POST'/);
  assert.match(sign, /public_id:.*randomUUID\(\)/);
  assert.match(sign, /overwrite: false/);
});
