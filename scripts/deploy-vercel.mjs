// CI-only release: build immutable candidates, verify, then promote existing projects.
// Token values, environment values and protected response bodies are never logged.
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, appendFileSync } from 'node:fs';
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
  return r.json();
}
function cli(target, args) {
  return new Promise((resolve, reject) => {
    const child = spawn('vercel', [...args, '--scope', 'open-build', '--token', target.token], {
      cwd: path.resolve(target.cwd),
      env: {...process.env, VERCEL_ORG_ID: team, VERCEL_PROJECT_ID: target.id, VERCEL_TELEMETRY_DISABLED: '1'},
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '', stderr = '';
    child.stdout.on('data', b => { stdout += b; });
    child.stderr.on('data', b => { stderr += b; });
    const timer = setTimeout(() => child.kill('SIGTERM'), 15 * 60 * 1000);
    child.on('error', error => { clearTimeout(timer); reject(error); });
    child.on('close', code => {
      clearTimeout(timer);
      if (code !== 0) {
        console.error(clean(stderr).slice(-6000));
        reject(new Error(`${target.name} deployment command failed`));
      } else resolve(stdout.trim());
    });
  });
}
async function probe(target, deployment, route) {
  // This credential stays on the server side and is only sent to its own project's
  // immutable deployment URL. Do not disable deployment protection for testing.
  let bypass = target.bypass;
  if (!bypass) {
    const project = await api(target, `/v9/projects/${target.id}`);
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
  const r = await fetch(`https://${deployment.url}${route}`, {
    headers: {'x-vercel-protection-bypass': bypass}, redirect: 'manual', signal: AbortSignal.timeout(30000), cache: 'no-store',
  });
  assert.equal(r.status, 200, `${target.name} health status`);
  const data = await r.json();
  assert.equal(data.status, 'ok');
  assert.equal(data.revision, sha, `${target.name} running revision`);
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
    const directory = path.resolve(target.cwd, '.vercel');
    mkdirSync(directory, {recursive: true});
    writeFileSync(path.join(directory, 'project.json'), JSON.stringify({projectId: target.id, orgId: team}));
    const output = await cli(target, ['deploy', '--prod', '--skip-domain', '--yes',
      '--env', `KAISOURCE_RELEASE_SHA=${sha}`,
      '--meta', `githubCommitSha=${sha}`, '--meta', 'githubCommitRef=main',
      '--meta', 'githubCommitOrg=kaiyuanshe', '--meta', 'githubCommitRepo=kaisource-website']);
    const url = output.match(/https:\/\/([a-z0-9.-]+\.vercel\.app)/)?.[1];
    assert.ok(url, 'Candidate URL missing');
    target.deployment = await api(target, `/v13/deployments/${url}`);
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
    await cli(target, ['promote', target.deployment.url, '--yes']);
    const project = await api(target, `/v9/projects/${target.id}`);
    assert.equal(project.targets?.production?.id, target.deployment.id);
    await probe(target, target.deployment, target.name === 'backend' ? '/healthz' : '/api/health');
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
      await cli(target, ['rollback', target.previous, '--yes']);
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
