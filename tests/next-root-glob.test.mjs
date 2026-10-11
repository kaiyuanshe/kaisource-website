import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { globSync } = require('../vendor/next-root-glob/index.cjs');

test('Next root discovery preserves directories, braces and excludes files', () => {
  assert.deepEqual(globSync('src/{pages,components}', { onlyDirectories: true }).sort(), ['src/components', 'src/pages']);
  assert.deepEqual(globSync('package.json', { onlyDirectories: true }), []);
});
test('deep or unsupported glob requests fail before parsing', () => {
  assert.throws(() => globSync('{'.repeat(1000), { onlyDirectories: true }), /nesting limit/);
  assert.throws(() => globSync('a'.repeat(5000), { onlyDirectories: true }), /bounded/);
  assert.throws(() => globSync('src', { onlyFiles: true }), /Only Next/);
});
test('actual Next lint root resolver uses the replacement without removing rules', () => {
  const plugin = require('@next/eslint-plugin-next');
  assert.ok(plugin.rules['no-html-link-for-pages']);
  const entry = require.resolve('@next/eslint-plugin-next');
  const localRequire = createRequire(entry);
  assert.match(localRequire.resolve('fast-glob'), /next-root-glob/);
});
