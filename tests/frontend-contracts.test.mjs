import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { formatDateTime } from '../src/lib/date-time.mjs';

const { parse } = createRequire(import.meta.url)('next/dist/compiled/babel/parser');
const file = (name) => new URL(`../${name}`, import.meta.url);
const source = (name) => readFileSync(file(name), 'utf8');
const parseFile = (name) => parse(source(name), { sourceType: 'module', plugins: ['typescript', 'jsx'] });

function filesBelow(directory) {
  return readdirSync(file(directory), { withFileTypes: true }).flatMap(entry => {
    const name = `${directory}/${entry.name}`;
    return entry.isDirectory() ? filesBelow(name) : [name];
  });
}

test('each pages/api module exports a real handler instead of only request utilities', () => {
  const routes = filesBelow('src/pages/api').filter(name => /\.(?:ts|tsx)$/.test(name));
  assert.ok(routes.length >= 8, 'The actual auth, captcha, media and proxy routes must remain');
  for (const name of routes) {
    const ast = parseFile(name);
    assert.ok(ast.program.body.some(node => node.type === 'ExportDefaultDeclaration'), `Missing handler: ${name}`);
  }
  for (const name of ['api', 'article', 'comment', 'comunity', 'dapp', 'event', 'feedback', 'login', 'member', 'post', 'recap', 'tutorial', 'user', 'verification']) {
    assert.equal(existsSync(file(`src/pages/api/${name}.ts`)), false, `Request utility became a route: ${name}`);
    assert.equal(existsSync(file(`src/services/${name}.ts`)), true, `Missing service: ${name}`);
  }
});

test('application imports no longer point at the removed API utility routes', () => {
  const utilities = '(?:api|article|comment|comunity|dapp|event|feedback|login|member|post|recap|tutorial|user|verification)';
  const oldReference = new RegExp(`(?:@/|[.]+/)(?:pages/)?api/${utilities}(?:['"]|\\.ts)`);
  for (const name of filesBelow('src').filter(name => /\.(?:ts|tsx|mjs)$/.test(name))) {
    assert.doesNotMatch(source(name), oldReference, name);
  }
  assert.match(source('src/pages/api/auth/[...nextauth].ts'), /from ['"]@\/services\/login['"]/);
});

test('production builds do not suppress TypeScript validation', () => {
  assert.match(source('next.config.ts'), /ignoreBuildErrors:\s*false/);
  assert.doesNotMatch(source('next.config.ts'), /ignoreBuildErrors:\s*true/);
  const { scripts } = JSON.parse(source('package.json'));
  assert.equal(scripts.typecheck, 'next typegen && tsc --noEmit');
  assert.equal(scripts.build, 'next build');
});

test('both date API services use the same guarded formatter', () => {
  for (const name of ['event', 'dapp']) {
    assert.match(source(`src/services/${name}.ts`), /export \{ formatDateTime \} from ['"]@\/lib\/date-time\.mjs['"]/);
  }
});

test('picker dates, native Dates and serialized dates retain their format', () => {
  const date = { format: pattern => { assert.equal(pattern, 'YYYY-MM-DD'); return '2026-10-08'; } };
  const time = { format: pattern => { assert.equal(pattern, 'HH:mm:ss'); return '09:30:00'; } };
  assert.equal(formatDateTime(date, time), '2026-10-08 09:30:00');
  const nativeDate = new Date('2026-10-08T00:00:00.000Z');
  const nativeTime = new Date(2026, 9, 8, 9, 30, 0);
  assert.equal(formatDateTime(nativeDate, nativeTime), '2026-10-08 09:30:00');
  assert.equal(formatDateTime('2026-10-08', '09:30:00'), '2026-10-08 09:30:00');
});

test('unknown, missing, mixed or invalid date inputs are rejected without exceptions', () => {
  for (const [date, time] of [[null, null], [undefined, '09:30'], [{}, {}], [{ format: 'not a function' }, {}], ['2026-10-08', new Date()], [new Date('not a date'), new Date()], [{ format: () => { throw new Error('fixture'); } }, { format: () => '09:30' }]]) {
    assert.equal(formatDateTime(date, time), '');
  }
});

test('header code login uses the existing shared backend provider', () => {
  assert.match(source('src/components/Auth.tsx'), /signIn\(['"]code-login['"]/);
  assert.doesNotMatch(source('src/components/Auth.tsx'), /signIn\(['"]credentials['"]/);
});
