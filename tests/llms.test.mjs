import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const index = readFileSync(path.join(root, "public/llms.txt"), "utf8");
const guide = readFileSync(path.join(root, "public/site-guide.md"), "utf8");
const links = [...index.matchAll(/^\- \[([^\]]+)\]\((https:\/\/[^)]+)\): (.+)$/gm)];

test("llms.txt has one H1, a summary, and described HTTPS links", () => {
  assert.match(index, /^# KaiSource /);
  assert.equal((index.match(/^# /gm) || []).length, 1);
  assert.match(index, /^> .+/m);
  assert.match(index, /^## Optional$/m);
  assert.ok(links.length >= 10);
  assert.ok(index.length < 8000, "Keep the index short");
});

test("first link is a readable Markdown guide and brand/languages are clear", () => {
  assert.equal(new URL(links[0][2]).pathname, "/site-guide.md");
  assert.match(guide, /^# KaiSource site guide/);
  for (const content of [index, guide]) {
    assert.match(content, /KaiYuanShe/);
    assert.match(content, /https:\/\/www\.kaiyuanshe\.cn\//);
    assert.match(content, /https:\/\/www\.kaisource\.org\/zh-CN/);
    assert.match(content, /license/i);
  }
});

test("listed local pages exist and private APIs/accounts are not linked", () => {
  for (const [, , href] of links) {
    const url = new URL(href);
    assert.equal(url.search, "");
    assert.ok(!/\/(api|v1|login|dashboard)(\/|$)/.test(url.pathname));
    if (url.hostname !== "www.kaisource.org") continue;
    const route = url.pathname.replace(/^\/zh-CN(?=\/|$)/, "") || "/";
    const local = route === "/site-guide.md"
      ? path.join(root, "public/site-guide.md")
      : path.join(root, "src/pages", route, "index.tsx");
    assert.ok(existsSync(local), `Missing linked page: ${href}`);
  }
});
