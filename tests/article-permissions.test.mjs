import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

// Use the parser bundled with the installed Next.js runtime; no extra compiler
// version or unstable TypeScript compiler API is needed for these UI tests.
const { parse: parseSyntax } = createRequire(import.meta.url)('next/dist/compiled/babel/parser');

const categories = ['blogs', 'announcement', 'kysreports', 'osreports'];
const source = (file) => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
function parse(file) {
  const text = source(file);
  const ast = parseSyntax(text, { sourceType: 'module', plugins: ['typescript', 'jsx'] });
  visit(ast, (node) => { node.getText = () => text.slice(node.start, node.end); });
  return ast;
}

function visit(node, callback, parent) {
  node.parent = parent;
  callback(node);
  for (const [key, value] of Object.entries(node)) {
    if (key === 'parent') continue;
    const children = Array.isArray(value) ? value : [value];
    for (const child of children) if (child && typeof child.type === 'string') visit(child, callback, node);
  }
}

// Inspect the actual JSX gate enclosing an action, then evaluate it against
// isolated permission sets. This checks grid/list controls, not just whether
// the page happens to mention the correct permission somewhere.
function enclosingGate(node) {
  let child = node;
  for (let parent = node.parent; parent; child = parent, parent = parent.parent) {
    let condition;
    if (parent.type === 'ConditionalExpression' && parent.consequent === child) condition = parent.test;
    if (parent.type === 'LogicalExpression' && parent.right === child && parent.operator === '&&') condition = parent.left;
    if (condition?.getText().includes('permissions.includes')) return condition.getText();
  }
  assert.fail(`Action has no enclosing permission gate: ${node.getText()}`);
}

function assertGate(condition, permission, file) {
  // Empty search/tag fixtures expose the empty-state create links as well.
  const allows = new Function('status', 'permissions', 'searchKeyword', 'selectedTag', `return Boolean(${condition});`);
  assert.equal(allows('authenticated', [permission]), true, `${file}: ${permission} should allow the action`);
  for (const other of ['event:write', 'event:delete', 'event:review', 'article:write', 'article:delete', 'article:review']) {
    if (other !== permission) assert.equal(allows('authenticated', [other]), false, `${file}: ${other} must not grant ${permission}`);
  }
  assert.equal(allows('authenticated', []), false);
  for (const status of ['loading', 'unauthenticated']) assert.equal(allows(status, [permission]), false);
}

for (const category of categories) {
  test(`${category}: creation/edit guards use article:write, never event permissions`, () => {
    for (const route of ['new.tsx', '[id]/edit.tsx']) {
      const file = `src/pages/${category}/${route}`;
      const calls = [];
      visit(parse(file), (node) => {
        if (node.type === 'CallExpression' && node.callee.getText() === 'usePermissionGuard') calls.push(node);
      });
      assert.equal(calls.length, 1);
      assert.equal(calls[0].arguments[0].value, 'article:write');
      assert.doesNotMatch(source(file), /event:(write|review|delete)/);
    }
  });

  test(`${category}: every visible create, edit, and delete action matches the API permission`, () => {
    const counts = { create: 0, edit: 0, delete: 0 };
    for (const route of ['index.tsx', '[id]/index.tsx']) {
      const file = `src/pages/${category}/${route}`;
      assert.doesNotMatch(source(file), /event:(write|review|delete)/);
      visit(parse(file), (node) => {
        if (node.type === 'JSXAttribute' && node.name.name === 'href' && node.value?.type === 'StringLiteral' && node.value.value === `/${category}/new`) {
          assertGate(enclosingGate(node), 'article:write', file);
          counts.create++;
        }
        if (node.type !== 'CallExpression') return;
        if (node.callee.getText() === 'handleDeleteArticle') {
          assertGate(enclosingGate(node), 'article:delete', file);
          counts.delete++;
        }
        if (node.callee.getText() === 'router.push' && node.arguments[0]?.getText().includes('/edit')) {
          assertGate(enclosingGate(node), 'article:write', file);
          counts.edit++;
        }
      });
    }
    assert.ok(counts.create >= 1);
    assert.ok(counts.edit >= 1);
    assert.ok(counts.delete >= 1);
    if (['blogs', 'announcement'].includes(category)) assert.equal(counts.delete, 2, 'Both grid and list deletion must be guarded');
  });

  test(`${category}: only article writers/reviewers request unpublished lists`, () => {
    const file = `src/pages/${category}/index.tsx`;
    assert.match(source(file), /\[publishStatus, setPublishStatus\] = useState\(2\)/, 'First request must use published-only status');
    let expression;
    visit(parse(file), (node) => {
      if (node.type === 'VariableDeclarator' && node.id.name === 'newPublishStatus') expression = node.init?.getText();
    });
    assert.ok(expression);
    const requestedStatus = new Function('status', 'permissions', `return (${expression});`);
    for (const permission of ['article:write', 'article:review']) assert.equal(requestedStatus('authenticated', [permission]), 0);
    for (const permissions of [[], ['event:write'], ['event:review'], ['article:delete']]) assert.equal(requestedStatus('authenticated', permissions), 2);
    for (const status of ['loading', 'unauthenticated']) assert.equal(requestedStatus(status, ['article:write', 'article:review']), 2);
  });
}

test('permission guard does not log session records or API tokens', () => {
  assert.doesNotMatch(source('src/hooks/usePermissionGuard.ts'), /console\.(log|debug|info)/);
});
