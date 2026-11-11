import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const source = readFileSync(new URL('../scripts/sync-azure-provider-config.mjs', import.meta.url), 'utf8');
test('Azure sync publishes only allowlisted provider fields, never legacy public secrets or domestic auth settings', () => {
  const output = source.match(/output=\{([\s\S]*?)\n\}/)[1];
  const keys = [...output.matchAll(/^ '([^']+)':/gm)].map(match => match[1]);
  assert.deepEqual(keys, ['NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME', 'NEXT_PUBLIC_CLOUDINARY_API_KEY',
    'NEXT_PUBLIC_CLOUDINARY_UPLOAD_FOLDERS', 'CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY',
    'CLOUDINARY_API_SECRET', 'CLOUDINARY_UPLOAD_FOLDER', 'NEXT_PUBLIC_OAUTH']);
  assert.ok(!keys.includes('NEXT_PUBLIC_CLOUDINARY_API_SECRET'));
  assert.ok(!keys.some(key => key.startsWith('NEXTAUTH_')));
  assert.match(source, /key==='CLOUDINARY_API_SECRET'\?'sensitive':'encrypted'/);
});
test('sync is opt-in, project pinned and always production-scoped', () => {
  assert.match(source, /if\(!process\.argv\.includes\('--sync'\)\)/);
  assert.match(source, /if\(info\.id!==project\|\|info\.accountId!==team/);
  assert.match(source, /prj_KPv0pSUICFUsxaA2MJKNi2gT1UEa/);
  assert.match(source, /team_jdKwYH5K67gHpkE5vr43CPAc/);
  assert.match(source, /target:\['production'\]/);
  assert.ok(source.indexOf("process.exit(0)") < source.indexOf("['auth','add'"));
});
test('importer exports through SSH memory and stores through stdin without Azure writes', () => {
  assert.match(source, /spawnSync\('ssh'/);
  assert.match(source, /auth','add',service,reference,'--value-stdin'/);
  assert.match(source, /source\.stdout='';source\.stderr=''/);
  assert.doesNotMatch(source, /writeFile|appendFile|sudo|systemctl|tee |scp /);
  assert.doesNotMatch(source, /console\.log\((?:value|values|source\.stdout|source\.stderr)/);
});
test('OAuth client identity is compared to the shared backend before import', () => {
  assert.match(source, /urlsplit\(u\)\.hostname=='github\.com'/);
  assert.match(source, /get\('client_id',\[None\]\)\[0\]==cfg\.get\('oauth'/);
});
