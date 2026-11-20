// CI-only release: build immutable candidates, verify, then promote existing projects.
// Token values, environment values and protected response bodies are never logged.
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, appendFileSync, readFileSync, existsSync, lstatSync } from 'node:fs';
import {createHash} from 'node:crypto';
import {setTimeout as pause} from 'node:timers/promises';
import {selectVercelFiles} from './vercel-source-files.mjs';
import path from 'node:path';
import assert from 'node:assert/strict';

const sha = process.env.GITHUB_SHA;
const team = process.env.VERCEL_ORG_ID;
assert.match(sha || '', /^[a-f0-9]{40}$/);
assert.ok(team);
const targets = [
  {name: 'backend', id: process.env.VERCEL_BACKEND_PROJECT_ID, token: process.env.VERCEL_BACKEND_TOKEN, cwd: 'kaiyuanshe'},
  {name: 'frontend', id: process.env.VERCEL_FRONTEND_PROJECT_ID, token: process.env.VERCEL_FRONTEND_TOKEN, cwd: '.'},
];
for (const item of targets) assert.ok(item.id && item.token, 'Missing production deployment configuration');
const secrets = targets.map(t => t.token);
function clean(text) { for (const value of secrets) text = text.split(value).join('[REDACTED]'); return text; }
async function api(target, endpoint, method = 'GET', body) {
  const r = await fetch('https://api.vercel.com' + endpoint + (endpoint.includes('?') ? '&' : '?') + 'teamId=' + team, {
    method, headers: {authorization: 'Bearer ' + target.token, 'content-type': 'application/json'},
    ...(body === undefined ? {} : {body: JSON.stringify(body)}), signal: AbortSignal.timeout(30000),
  });
  assert.ok(r.ok, `Provider ${method} ${endpoint.split('?')[0]} returned ${r.status}`);
  const text = await r.text();
  return text ? JSON.parse(text) : {};
}
async function createCandidate(target, project) {
  const tracked = execFileSync('git', ['ls-files', '-z'], {encoding: 'utf8'}).split('\0').filter(Boolean);
  const ignoreFile = path.resolve(target.cwd, '.vercelignore');
  const names = selectVercelFiles(tracked, target.cwd, existsSync(ignoreFile) ? readFileSync(ignoreFile, 'utf8') : '');
  const files = [], pending = [...names];
  await Promise.all(Array.from({length: 8}, async () => {
    while (pending.length) {
      const file = pending.shift();
      const filename = path.resolve(target.cwd, file);
      const stat = lstatSync(filename);
      if (stat.isDirectory()) continue; // Git submodules are not uploaded as empty application files.
      assert.ok(stat.isFile() && !stat.isSymbolicLink(), 'Only regular tracked files may be uploaded');
      const content = readFileSync(filename);
      const digest = createHash('sha1').update(content).digest('hex');
      const r = await fetch(`https://api.vercel.com/v2/files?teamId=${team}`, {
        method: 'POST', headers: {authorization: 'Bearer ' + target.token,
          'content-type': 'application/octet-stream', 'x-vercel-digest': digest,
          'content-length': String(content.length)}, body: content, signal: AbortSignal.timeout(60000),
      });
      assert.ok(r.ok, `Source file upload returned ${r.status}`);
      await r.arrayBuffer();
      files.push({file, sha: digest, size: content.length, mode: stat.mode & 0o777});
    }
  }));
  const {$schema, ...config} = JSON.parse(readFileSync(path.resolve(target.cwd, 'vercel.json'), 'utf8'));
  const created = await api(target, '/v13/deployments?skipAutoDetectionConfirmation=1', 'POST', {
    ...config, name: project.name, project: target.id, target: 'production',
    autoAssignCustomDomains: false, files,
    env: {KAISOURCE_RELEASE_SHA: sha},
    meta: {githubCommitSha: sha, githubCommitRef: 'main', githubCommitOrg: 'kaiyuanshe', githubCommitRepo: 'kaisource-website'},
  });
  assert.ok(created.id, 'Candidate deployment ID missing');
  console.log(`Created ${target.name} candidate ${created.id}; waiting for build`);
  for (let i = 0; i < 180; i++) {
    const deployment = await api(target, `/v13/deployments/${created.id}`);
    if (deployment.readyState === 'READY') return deployment;
    assert.ok(!['ERROR', 'CANCELED'].includes(deployment.readyState), `${target.name} candidate build ${deployment.readyState}: ${deployment.id}`);
    await pause(5000);
  }
  throw new Error(`${target.name} candidate build timed out`);
}
async function changeProduction(target, deploymentId, rollback = false) {
  await api(target, `/v${rollback ? '9' : '10'}/projects/${target.id}/${rollback ? 'rollback' : 'promote'}/${deploymentId}`, 'POST', {});
  for (let i = 0; i < 60; i++) {
    const project = await api(target, `/v9/projects/${target.id}`);
    const request = project.lastAliasRequest;
    // Synchronous promotions clear lastAliasRequest rather than keeping a
    // succeeded job. The production target plus live alias probe is decisive.
    if (project.targets?.production?.id === deploymentId && (!request ||
      (request.toDeploymentId === deploymentId && request.jobStatus === 'succeeded'))) return;
    assert.ok(!(request?.toDeploymentId === deploymentId && ['failed', 'skipped'].includes(request.jobStatus)), 'Production alias update failed');
    await pause(3000);
  }
  throw new Error(`${target.name} production alias update timed out`);
}
async function prepareBypass(target, project) {
  // This credential stays on the server side and is only sent to its own project's
  // immutable deployment URL. Do not disable deployment protection for testing.
  let bypass = target.bypass;
  if (!bypass) {
    bypass = Object.keys(project.protectionBypass || {}).find(k => project.protectionBypass[k]?.scope === 'automation-bypass');
    if (!bypass) {
      const created = await api(target, `/v1/projects/${target.id}/protection-bypass`, 'PATCH', {
        generate: {note: `GitHub Actions candidate health ${sha}; revoke after release`},
      });
      bypass = Object.keys(created.protectionBypass || {}).find(k => !(k in (project.protectionBypass || {})) && created.protectionBypass[k]?.scope === 'automation-bypass');
      target.temporaryBypass = bypass;
    }
    target.bypass = bypass;
  }
  assert.ok(bypass, `Missing ${target.name} automation protection bypass`);
  secrets.push(bypass);
}
async function probe(target, deployment, route) {
  for (let i = 0; i < 20; i++) {
    const r = await fetch(`https://${deployment.url}${route}`, {
      headers: {'x-vercel-protection-bypass': target.bypass}, redirect: 'manual', signal: AbortSignal.timeout(30000), cache: 'no-store',
    });
    // A new project bypass can take time to reach the deployment's edge config.
    // Retry only the read-only health request; never follow a login redirect.
    if ([302, 401, 403, 503].includes(r.status) && i < 19) {
      await r.arrayBuffer();
      await pause(3000);
      continue;
    }
    assert.equal(r.status, 200, `${target.name} health status`);
    const data = await r.json();
    assert.equal(data.status, 'ok');
    assert.equal(data.revision, sha, `${target.name} running revision`);
    return;
  }
}

const receipt = {revision: sha, targets: [], result: 'preparing'};
const promoted = [];
try {
  for (const target of targets) {
    const project = await api(target, `/v9/projects/${target.id}`);
    assert.equal(project.id, target.id);
    assert.equal(project.accountId, team);
    // CI is the single production publisher. An unexpected Git integration could
    // deploy before checks, so refuse it rather than silently racing with it.
    assert.ok(!project.link, 'Unexpected native Git auto-deployment; review duplicate triggers');
    target.previous = project.targets?.production?.id;
    assert.ok(target.previous, 'Existing production deployment is required for rollback');
    await prepareBypass(target, project);
    target.deployment = await createCandidate(target, project);
    assert.equal(target.deployment.projectId, target.id);
    assert.equal(target.deployment.ownerId, team);
    assert.equal(target.deployment.readyState, 'READY');
    assert.equal(target.deployment.meta?.githubCommitSha, sha);
    await probe(target, target.deployment, target.name === 'backend' ? '/healthz' : '/api/health');
    receipt.targets.push({name: target.name, projectId: target.id, deploymentId: target.deployment.id,
      url: target.deployment.url, previousDeploymentId: target.previous});
    console.log(`Verified ${target.name} candidate ${target.deployment.id} at ${sha}`);
  }
  for (const target of targets) {
    // Mark before the call: restore even if promotion succeeded but the response
    // was lost. Only these two existing projects can be affected.
    promoted.push(target);
    await changeProduction(target, target.deployment.id);
    const project = await api(target, `/v9/projects/${target.id}`);
    assert.equal(project.targets?.production?.id, target.deployment.id);
    await probe(target, target.deployment, target.name === 'backend' ? '/healthz' : '/api/health');
    if (target.name === 'backend') await probe(target, {url: 'kaiyuanshe-xi.vercel.app'}, '/healthz');
  }
  for (const origin of ['https://www.kaisource.org', 'https://kaisource-website-omega.vercel.app']) {
    const r = await fetch(origin + '/api/health', {signal: AbortSignal.timeout(30000), cache: 'no-store'});
    assert.equal(r.status, 200);
    assert.equal((await r.json()).revision, sha);
  }
  receipt.result = 'deployed';
} catch (error) {
  receipt.result = 'failed';
  console.error(clean(error.message));
  for (const target of promoted.reverse()) {
    try {
      await changeProduction(target, target.previous, true);
      console.log(`Restored ${target.name} previous production ${target.previous}`);
    } catch { console.error(`ROLLBACK NEEDS ATTENTION: ${target.name}`); receipt.rollbackNeedsAttention = true; }
  }
  process.exitCode = 1;
} finally {
  for (const target of targets) {
    if (target.temporaryBypass) {
      try {
        await api(target, `/v1/projects/${target.id}/protection-bypass`, 'PATCH', {
          revoke: {secret: target.temporaryBypass, regenerate: false},
        });
      } catch { console.error(`Temporary protection bypass cleanup needs attention: ${target.name}`); process.exitCode = 1; }
    }
  }
  mkdirSync('.ci-receipts', {recursive: true});
  writeFileSync('.ci-receipts/vercel.json', JSON.stringify(receipt, null, 2));
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY,
    `## Vercel release: ${receipt.result}\n\nCommit: \`${sha}\`\n\n` +
    receipt.targets.map(t => `- ${t.name}: \`${t.deploymentId}\`\n`).join(''));
}
