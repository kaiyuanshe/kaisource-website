import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {selectVercelFiles} from '../scripts/vercel-source-files.mjs';

test('frontend source excludes backend, env secrets, operator keys and build state', () => {
  const files = ['package.json', 'vercel.json', 'src/pages/index.tsx', 'public/logo.svg', '.env.example',
    '.env.production', 'src/.env.local', 'operator.pem', 'tls/server.key', '.vercel/project.json',
    'kaiyuanshe/main.go', 'node_modules/pkg/index.js', '.next/server.js', 'deploy/domestic/ci-release.py',
    'tests/app.test.mjs', '.ci-bin/api', '.release-sha', 'docs/articles/draft.md'];
  assert.deepEqual(selectVercelFiles(files, '.', readFileSync(new URL('../.vercelignore', import.meta.url), 'utf8')),
    ['package.json', 'vercel.json', 'src/pages/index.tsx', 'public/logo.svg', '.env.example']);
});
test('backend source is rooted in its own project and cannot include sibling frontend files', () => {
  assert.deepEqual(selectVercelFiles(['package.json', 'kaiyuanshe/go.mod', 'kaiyuanshe/main.go',
    'kaiyuanshe/vercel.json', 'kaiyuanshe/.env', 'kaiyuanshe/certs/operator.pem'], 'kaiyuanshe'),
    ['go.mod', 'main.go', 'vercel.json']);
});
