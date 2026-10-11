import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateRelease, releaseTarget as target, requiredProductionKeys } from '../scripts/check-overseas-release.mjs';
function fixture() {
  return {
    project: { id: target.project, accountId: target.team, productionDeployment: 'dpl_current' },
    deployment: { id: 'dpl_current', projectId: target.project, ownerId: target.team, sha: '01cf2cfffb135ca3e08afbcb3a69494984cf53af', readyState: 'READY' },
    aliases: target.domains.map(name => ({ name, projectId: target.project, deploymentId: 'dpl_current' })),
    envKeys: [...requiredProductionKeys, 'NEXTAUTH_SECRET'].map(key => ({ key, target: ['production'] })),
  };
}
test('structural success never authorizes migration or claims full acceptance', () => {
  const result = evaluateRelease(fixture());
  assert.equal(result.structuralPass, true);
  assert.equal(result.migrationAuthorized, false);
  assert.ok(result.remainingAcceptance.length);
});
test('actual blocked-source pattern fails despite correct source and team', () => {
  const f = fixture(); f.deployment.readyState = 'BLOCKED'; f.deployment.seatCode = 'TEAM_ACCESS_REQUIRED';
  const result = evaluateRelease(f);
  assert.equal(result.structuralPass, false);
  assert.ok(result.failures.includes('PLATFORM_AUTHORIZATION_BLOCK:TEAM_ACCESS_REQUIRED'));
});
test('READY static probe cannot substitute for actual source', () => {
  const f = fixture(); delete f.deployment.sha;
  assert.ok(evaluateRelease(f).failures.includes('SOURCE_REVISION_MISSING'));
});
test('wrong project, team, owner or deployment fails closed', () => {
  for (const [object, key] of [['project', 'id'], ['project', 'accountId'], ['deployment', 'id'], ['deployment', 'projectId'], ['deployment', 'ownerId']]) {
    const f = fixture(); f[object][key] = 'wrong';
    assert.equal(evaluateRelease(f).structuralPass, false, `${object}.${key}`);
  }
});
test('empty project and preview-only keys cannot satisfy production config', () => {
  const f = fixture(); f.envKeys = [];
  assert.ok(evaluateRelease(f).missingKeys.includes('NEXTAUTH_URL'));
  f.envKeys = fixture().envKeys.map(item => ({ ...item, target: ['preview'] }));
  assert.equal(evaluateRelease(f).structuralPass, false);
});
test('canonical origin key is mandatory even with an existing signing secret', () => {
  const f = fixture(); f.envKeys = f.envKeys.filter(item => item.key !== 'NEXTAUTH_URL');
  assert.deepEqual(evaluateRelease(f).missingKeys, ['NEXTAUTH_URL']);
});
test('AUTH_SECRET fallback satisfies the signing-key metadata requirement only', () => {
  const f = fixture(); f.envKeys = f.envKeys.filter(item => item.key !== 'NEXTAUTH_SECRET');
  assert.equal(evaluateRelease(f).structuralPass, false);
  f.envKeys.push({ key: 'AUTH_SECRET', target: ['production'] });
  assert.equal(evaluateRelease(f).structuralPass, true);
});
test('public Cloudinary secret key is refused and values cannot leak into receipt', () => {
  const f = fixture(); f.envKeys.push({ key: 'NEXT_PUBLIC_CLOUDINARY_API_SECRET', target: ['production'], value: 'sensitive-fixture-not-to-emit' });
  const result = evaluateRelease(f);
  assert.ok(result.failures.includes('PUBLIC_SECRET_KEY_PROHIBITED'));
  assert.ok(!JSON.stringify(result).includes('sensitive-fixture-not-to-emit'));
});
test('old READY deployment fails when project or domain has moved', () => {
  const f = fixture(); f.project.productionDeployment = 'dpl_new';
  assert.equal(evaluateRelease(f).structuralPass, false);
  const moved = fixture(); moved.aliases[0].deploymentId = 'dpl_old';
  assert.ok(evaluateRelease(moved).failures.includes('PRODUCTION_DOMAIN_MISMATCH'));
});
test('new production revision is evaluated without stale hardcoded identities', () => {
  const f = fixture(); f.deployment.sha = 'a'.repeat(40);
  f.project.productionDeployment = f.deployment.id = 'dpl_new';
  f.aliases.forEach(a => { a.deploymentId = 'dpl_new'; });
  assert.equal(evaluateRelease(f).structuralPass, true);
});
