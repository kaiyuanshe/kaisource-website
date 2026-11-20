import {matchesGlob} from 'node:path';

// Git supplies the only upload inventory. Never include local build state or
// credential files, even if a future ignore-file edit accidentally allows them.
export function selectVercelFiles(tracked, cwd, ignoreText = '') {
  const prefix = cwd === '.' ? '' : cwd.replace(/\/$/, '') + '/';
  const rules = ignoreText.split(/\r?\n/).map(s => s.trim()).filter(s => s && !s.startsWith('#'));
  return tracked.filter(name => !prefix || name.startsWith(prefix)).map(name => name.slice(prefix.length)).filter(name => {
    const parts = name.split('/');
    if (parts.some(p => ['.git', '.vercel', '.next', 'node_modules', '__pycache__'].includes(p) ||
      (p.startsWith('.env') && p !== '.env.example') || /\.(pem|key)$/i.test(p))) return false;
    let ignored = false;
    for (const rule of rules) {
      const allow = rule.startsWith('!');
      const pattern = (allow ? rule.slice(1) : rule).replace(/^\.\//, '').replace(/^\//, '').replace(/\/$/, '');
      const candidates = pattern.includes('/') ? [name, ...parts.map((_, i) => parts.slice(0, i + 1).join('/'))] : parts;
      if (candidates.some(candidate => matchesGlob(candidate, pattern))) ignored = !allow;
    }
    return !ignored;
  });
}
