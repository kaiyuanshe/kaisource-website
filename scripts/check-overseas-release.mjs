// Read-only structural preflight. Never deploys, changes identities or moves domains.
// A passing result is NOT authenticated provider/business acceptance.
import { pathToFileURL } from 'node:url';
import https from 'node:https';

export const releaseTarget = Object.freeze({
  team: 'team_jdKwYH5K67gHpkE5vr43CPAc',
  project: 'prj_KPv0pSUICFUsxaA2MJKNi2gT1UEa',
  domains: ['www.kaisource.org', 'kaisource.org', 'kaisource-website-omega.vercel.app'],
});
export const requiredProductionKeys = Object.freeze([
  'NEXT_PUBLIC_API_URL', 'API_PROXY_ORIGIN', 'INTERNAL_API_URL',
  'API_PROXY_BYPASS_ORIGIN', 'API_PROXY_BYPASS_SECRET',
  'NEXTAUTH_URL', 'NEXT_PUBLIC_OAUTH',
  'CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET',
  'CLOUDINARY_UPLOAD_FOLDER', 'NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME',
  'NEXT_PUBLIC_CLOUDINARY_API_KEY', 'NEXT_PUBLIC_CLOUDINARY_UPLOAD_FOLDERS',
]);

// Accepts projections only; environment VALUES never belong in receipts.
export function evaluateRelease({ project, deployment, envKeys, aliases }, target = releaseTarget) {
  const failures = [];
  if (project?.id !== target.project || project?.accountId !== target.team) failures.push('TARGET_IDENTITY_MISMATCH');
  if (!deployment?.id || deployment?.id !== project?.productionDeployment || deployment?.projectId !== target.project || deployment?.ownerId !== target.team) failures.push('DEPLOYMENT_IDENTITY_MISMATCH');
  if (!/^[a-f0-9]{40}$/.test(deployment?.sha || '')) failures.push('SOURCE_REVISION_MISSING');
  if (!Array.isArray(aliases) || target.domains.some(name => !aliases.some(a => a.name === name && a.projectId === target.project && a.deploymentId === deployment?.id))) failures.push('PRODUCTION_DOMAIN_MISMATCH');
  if (deployment?.readyState !== 'READY') failures.push(`DEPLOYMENT_NOT_READY:${deployment?.readyState || 'UNKNOWN'}`);
  if (deployment?.seatCode) failures.push(`PLATFORM_AUTHORIZATION_BLOCK:${deployment.seatCode}`);
  const productionKeys = new Set((envKeys || []).filter(item => Array.isArray(item.target) && item.target.includes('production')).map(item => item.key));
  const missingKeys = requiredProductionKeys.filter(key => !productionKeys.has(key));
  if (!productionKeys.has('NEXTAUTH_SECRET') && !productionKeys.has('AUTH_SECRET')) missingKeys.push('NEXTAUTH_SECRET|AUTH_SECRET');
  if (missingKeys.length) failures.push('PRODUCTION_ENV_KEYS_MISSING');
  if ((envKeys || []).some(item => item.key === 'NEXT_PUBLIC_CLOUDINARY_API_SECRET' && Array.isArray(item.target) && item.target.includes('production'))) failures.push('PUBLIC_SECRET_KEY_PROHIBITED');
  return {
    structuralPass: failures.length === 0,
    migrationAuthorized: false,
    failures, missingKeys,
    deploymentId: deployment?.id,
    sourceRevision: deployment?.sha,
    remainingAcceptance: ['Verify backend connection and runtime flows', 'Complete genuine OAuth, email delivery and authenticated media/draft acceptance'],
  };
}

async function inspect() {
  if (process.argv.length !== 2) throw Error('No arguments supported: inspect the current production deployment');
  const token = process.env.VERCEL_TOKEN;
  if (!token) throw Error('Missing project-scoped VERCEL_TOKEN');
  async function get(path) {
    return new Promise((resolve, reject) => {
      const request = https.get(`https://api.vercel.com${path}`, { agent: false, headers: { Authorization: `Bearer ${token}` } }, response => {
        let text = '';
        response.on('data', chunk => { text += chunk; if (text.length > 8 * 1024 * 1024) request.destroy(Error('Metadata limit')); });
        response.on('end', () => {
          clearTimeout(timer);
          if (response.statusCode !== 200) return reject(Error('Read-only metadata unavailable'));
          try { resolve(JSON.parse(text)); } catch { reject(Error('Invalid metadata')); }
        });
      });
      const timer = setTimeout(() => request.destroy(Error('Metadata deadline')), 20000);
      request.on('error', error => { clearTimeout(timer); reject(error); });
    });
  }
  const t = releaseTarget;
  const [project, env, aliases] = await Promise.all([
    get(`/v9/projects/${t.project}?teamId=${t.team}`),
    get(`/v9/projects/${t.project}/env?teamId=${t.team}`),
    Promise.all(t.domains.map(async name => {
      const a = await get(`/v4/aliases/${name}?teamId=${t.team}`);
      return { name, projectId: a.projectId, deploymentId: a.deploymentId || a.deployment?.id };
    })),
  ]);
  if (!project.targets?.production?.id) throw Error('No production deployment');
  const deployment = await get(`/v13/deployments/${project.targets.production.id}?teamId=${t.team}`);
  if (!Array.isArray(env.envs)) throw Error('Environment metadata unavailable; cannot evaluate preflight');
  const result = evaluateRelease({
    project: { id: project.id, accountId: project.accountId, productionDeployment: project.targets.production.id },
    deployment: {
      id: deployment.id, projectId: deployment.projectId, ownerId: deployment.ownerId,
      sha: deployment.meta?.githubCommitSha || deployment.meta?.gitCommitSha,
      readyState: deployment.readyState,
      seatCode: deployment.seatBlock?.blockCode || deployment.attribution?.seatBlock?.blockCode,
    },
    envKeys: env.envs.map(item => ({ key: item.key, target: item.target })),
    aliases,
  });
  console.log(JSON.stringify({ checkedAt: new Date().toISOString(), readOnly: true, target: t, ...result }, null, 2));
  process.exitCode = result.structuralPass ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  inspect().catch(() => { console.error('Overseas release preflight failed; credential/provider output suppressed.'); process.exitCode = 2; });
}
