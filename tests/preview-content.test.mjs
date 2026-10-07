import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  resolvePreviewResponse,
  sanitizePublicRecord,
  LOCALES,
  RESOURCES,
} from "../src/lib/preview-content.mjs";

const snapshot = JSON.parse(
  readFileSync(new URL("../src/data/preview-content.json", import.meta.url)),
);

test("each locale has public content and only published articles/events", () => {
  for (const locale of LOCALES) {
    for (const resource of RESOURCES)
      assert.ok(Array.isArray(snapshot.content[locale][resource]));
    for (const resource of ["articles", "events"]) {
      assert.ok(snapshot.content[locale][resource].length > 0);
      assert.ok(
        snapshot.content[locale][resource].every(
          (record) => record.publish_status === 2,
        ),
      );
    }
  }
});

test("snapshot strips account email, tokens and permission data recursively", () => {
  function check(value) {
    if (!value || typeof value !== "object") return;
    for (const [key, child] of Object.entries(value)) {
      assert.ok(
        !/email|password|token|secret|permissions?|roles?|phone|DeletedAt/i.test(
          key,
        ),
        key,
      );
      check(child);
    }
  }
  check(snapshot.content);
  check(snapshot.venues);
  assert.deepEqual(
    sanitizePublicRecord({
      publisher: {
        ID: 1,
        username: "Public name",
        email: "private@example.test",
        password: "secret",
        permissions: ["admin"],
      },
    }),
    { publisher: { ID: 1, username: "Public name" } },
  );
});

test("list endpoints preserve pagination and ignore attempts to fetch drafts", () => {
  const result = resolvePreviewResponse(snapshot, ["articles"], {
    locale: "en",
    page_size: "2",
    publish_status: "1",
  });
  assert.equal(result.code, 200);
  assert.equal(result.data.articles.length, 2);
  assert.ok(result.data.articles.every((r) => r.publish_status === 2));
  assert.equal(
    resolvePreviewResponse(snapshot, ["events"], {
      page: "-1",
      page_size: "bad",
    }).data.page,
    1,
  );
});

test("language switching resolves a linked detail record without changing IDs in the URL", () => {
  for (const locale of LOCALES) {
    const translated = snapshot.content[locale].articles.find(
      (r) => r.translation_of,
    );
    if (!translated) continue;
    const result = resolvePreviewResponse(
      snapshot,
      ["articles", String(translated.translation_of)],
      { locale },
    );
    assert.equal(result.code, 200);
    assert.equal(result.data.ID, translated.ID);
  }
});

test("details, events and session views are served from the snapshot", () => {
  for (const locale of LOCALES) {
    const article = snapshot.content[locale].articles[0];
    assert.equal(
      resolvePreviewResponse(snapshot, ["articles", String(article.ID)], {
        locale,
      }).data.ID,
      article.ID,
    );
    const event = snapshot.content[locale].events[0];
    assert.ok(
      Array.isArray(
        resolvePreviewResponse(
          snapshot,
          ["events", String(event.ID), "venues"],
          { locale },
        ).data,
      ),
    );
  }
});

test("private endpoints, traversal, invalid IDs and extra path segments are unavailable", () => {
  for (const path of [
    ["users"],
    ["login"],
    ["register"],
    ["articles", ".."],
    ["events", "1", "write"],
    ["events", "1", "venues", "2"],
    [],
  ]) {
    assert.equal(resolvePreviewResponse(snapshot, path).code, 404);
  }
});

test("filters do not mutate the shared snapshot", () => {
  const before = JSON.stringify(snapshot);
  resolvePreviewResponse(snapshot, ["articles"], {
    locale: "en",
    keyword: "open",
    category: "blog",
    order: "asc",
  });
  assert.equal(JSON.stringify(snapshot), before);
});

test("runtime snapshot handler does not fetch production or accept write methods", () => {
  const handler = readFileSync(
    new URL("../src/pages/api/preview/[...path].ts", import.meta.url),
    "utf8",
  );
  assert.ok(!handler.includes("fetch("));
  assert.match(handler, /req\.method !== ["']GET["']/);
  assert.match(handler, /\.status\(405\)/);
  const proxy = readFileSync(new URL("../src/proxy.ts", import.meta.url), "utf8");
  assert.match(proxy, /path === ["']\/api\/auth\/session["']/);
  assert.ok(proxy.includes("status: 403"));
});
