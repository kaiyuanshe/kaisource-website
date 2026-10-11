import test from 'node:test';
import assert from 'node:assert/strict';
import { marked } from 'marked';
import { sanitizeRenderedHTML } from '../src/lib/safe-html.mjs';
import { parseMarkdown, sanitizeMarkdown } from '../src/lib/markdown.ts';

test('Markdown HTML cannot export script, handlers or active URL schemes', () => {
  const result = sanitizeRenderedHTML(marked.parse('## Heading\n\n<script>alert(1)</script><img src="https://example.test/p.png" onerror="alert(1)"><a href="javascript:alert(1)">bad</a><svg onload="alert(1)"></svg>'));
  assert.match(result, /<h2>Heading<\/h2>/);
  assert.match(result, /https:\/\/example.test\/p.png/);
  assert.doesNotMatch(result, /script|onerror|onload|javascript:|<svg/);
});

test('recap HTML retains lists, links, images and tables after rendering', () => {
  const result = sanitizeRenderedHTML(marked.parse('**Highlights**\n\n- First\n- Second\n\n[Video](https://example.test/video)\n\n![Photo](https://example.test/p.png)\n\n| Topic | Note |\n| --- | --- |\n| A | B |'));
  for (const tag of ['strong', 'ul', 'li', 'a', 'img', 'table']) assert.match(result, new RegExp('<' + tag + '(?:>| )'));
  assert.match(result, /rel="noopener noreferrer"/);
});
test('actual public Markdown sanitization API filters HTML without changing other parser calls', async () => {
  const source = '**Text** <img src="https://example.test/a.png" onerror="alert(1)"><script>alert(1)</script>';
  for (const html of [await sanitizeMarkdown(source), await parseMarkdown(source, { sanitize: true })]) {
    assert.match(html, /<strong>Text<\/strong>/);
    assert.doesNotMatch(html, /onerror|script/);
  }
  // An opt-in request must not mutate Marked options for other callers.
  assert.match(await parseMarkdown(source), /onerror/);
});
