import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { setImmediate } from "node:timers/promises";

const require = createRequire(import.meta.url);
const { transformSync } = require("next/dist/build/swc");
const dayjs = require("dayjs");
const same = (a, b) =>
  a &&
  b &&
  a.length === b.length &&
  a.every((value, i) => Object.is(value, b[i]));

// Execute each actual page's hooks and JSX with isolated API responses. UI
// components are inert nodes; handlers, effects, pagination and races are real.
function pageHarness(file, api = {}) {
  const slots = [];
  let cursor = 0,
    dirty = true,
    tree;
  const effects = new Map();
  const react = {
    useState(initial) {
      const i = cursor++;
      slots[i] ??= {
        value: typeof initial === "function" ? initial() : initial,
      };
      return [
        slots[i].value,
        (value) => {
          const next =
            typeof value === "function" ? value(slots[i].value) : value;
          if (!Object.is(next, slots[i].value)) {
            slots[i].value = next;
            dirty = true;
          }
        },
      ];
    },
    useRef(initial) {
      const i = cursor++;
      return (slots[i] ??= { current: initial });
    },
    useMemo(factory, deps) {
      const i = cursor++;
      if (!same(slots[i]?.deps, deps)) slots[i] = { value: factory(), deps };
      return slots[i].value;
    },
    useCallback(fn, deps) {
      return react.useMemo(() => fn, deps);
    },
    useEffect(fn, deps) {
      const i = cursor++;
      if (!same(slots[i]?.deps, deps)) {
        const previous = slots[i];
        slots[i] = { deps, cleanup: previous?.cleanup };
        effects.set(i, () => {
          previous?.cleanup?.();
          slots[i].cleanup = fn();
        });
      }
    },
  };
  const auth = { status: "unauthenticated", session: null };
  const translation = { locale: "zh-CN", translateText: (text) => text };
  const router = {
    isReady: true,
    pathname: "/blogs",
    query: {},
    push: async (value) => {
      if (typeof value === "object") {
        router.query = value.query;
        dirty = true;
      }
    },
  };
  const message = { success() {}, error() {}, warning() {}, info() {} };
  const ui = new Proxy(
    {
      App: { useApp: () => ({ message }) },
      Input: { Search: "Search" },
      Typography: { Title: "Title", Text: "Text", Paragraph: "Paragraph" },
      message,
    },
    { get: (obj, key) => obj[key] ?? String(key) },
  );
  const jsx = (type, props) => ({ type, props: props || {} });
  const modules = {
    react: { __esModule: true, ...react, default: react },
    "react/jsx-runtime": { jsx, jsxs: jsx, Fragment: "Fragment" },
    antd: ui,
    dayjs: { __esModule: true, default: dayjs },
    "next/router": {
      __esModule: true,
      default: router,
      useRouter: () => router,
    },
    "next/link": { __esModule: true, default: "Link" },
    "next/image": { __esModule: true, default: "Image" },
    "@/contexts/AuthContext": { useAuth: () => auth },
    "@/hooks/useTranslation": { useTranslation: () => translation },
    "@/components/LocalizedText": {
      __esModule: true,
      default: "LocalizedText",
    },
  };
  const module = { exports: {} };
  const code = transformSync(
    readFileSync(new URL(`../${file}`, import.meta.url), "utf8"),
    {
      filename: file,
      jsc: {
        target: "es2022",
        parser: { syntax: "typescript", tsx: true },
        transform: { react: { runtime: "automatic" } },
      },
      module: { type: "commonjs" },
    },
  ).code;
  new Function("require", "module", "exports", code)(
    (name) => {
      if (modules[name]) return modules[name];
      if (name.startsWith("@/services/")) return api;
      if (name.endsWith(".module.css"))
        return {
          __esModule: true,
          default: new Proxy({}, { get: (_, key) => String(key) }),
        };
      return new Proxy({}, { get: (_, key) => String(key) });
    },
    module,
    module.exports,
  );
  function nodes(type, node) {
    if (Array.isArray(node)) return node.flatMap((child) => nodes(type, child));
    if (!node || typeof node !== "object") return [];
    return [
      ...(node.type === type ? [node] : []),
      ...nodes(type, node.props?.children),
    ];
  }
  return {
    nodes: (type) => nodes(type, tree),
    auth,
    router,
    translation,
    async flush() {
      for (let attempt = 0; attempt < 30; attempt++) {
        if (dirty) {
          dirty = false;
          cursor = 0;
          tree = module.exports.default();
        }
        const pending = [...effects.values()];
        effects.clear();
        pending.forEach((effect) => effect());
        await setImmediate();
        if (!dirty && effects.size === 0) return;
      }
      assert.fail("Page did not settle");
    },
    rerender() {
      dirty = true;
    },
  };
}

const articles = Array.from({ length: 14 }, (_, i) => ({
  ID: i + 1,
  title: i === 0 ? "Open Source Law" : `Article ${i + 1}`,
  description: "Test article",
  tags: [],
  CreatedAt: "2025-01-01T00:00:00Z",
  UpdatedAt: "2025-01-01T00:00:00Z",
  publish_time: "2025-01-01T00:00:00Z",
  publisher: { username: "Test author" },
}));
const articleResponse = (params) => {
  const matches = articles.filter(
    (article) => !params.keyword || article.title.includes(params.keyword),
  );
  return {
    success: true,
    data: {
      total: matches.length,
      page: params.page,
      page_size: params.page_size,
      articles: matches.slice(
        (params.page - 1) * params.page_size,
        params.page * params.page_size,
      ),
    },
  };
};
const pagination = (page) => page.nodes("Pagination")[0].props;
const search = (page) => page.nodes("Search")[0].props;
const calendar = (page) =>
  page.nodes("Calendar").find((node) => node.props.onPanelChange).props;
const articleIds = (page) =>
  page
    .nodes("Link")
    .map((node) => node.props.href)
    .filter((href) => /\/(blogs|announcement)\/\d+$/.test(href));

test("announcement input on page 2 searches page 1 immediately, including clear and no matches", async () => {
  const requests = [];
  const page = pageHarness("src/pages/announcement/index.tsx", {
    getArticles: async (params) => {
      requests.push(params);
      return articleResponse(params);
    },
  });
  await page.flush();
  pagination(page).onChange(2, 6);
  await page.flush();
  search(page).onChange({ target: { value: "Open Source Law" } });
  await page.flush();
  assert.equal(requests.at(-1).page, 1);
  assert.equal(pagination(page).total, 1);
  assert.deepEqual(articleIds(page), ["/announcement/1"]);
  search(page).onChange({ target: { value: "Missing" } });
  await page.flush();
  assert.equal(pagination(page).showTotal(0), "显示 0-0 项，共 0 项");
  search(page).onClear();
  await page.flush();
  assert.equal(pagination(page).total, 14);
  assert.equal(pagination(page).current, 1);
  assert.equal(requests.length, 5, "One request per query change");
});

for (const route of ["blogs", "announcement"]) {
  test(`${route} view changes preserve page 2 and its rows; old responses cannot replace a new query`, async () => {
    let hold = false;
    const pending = [];
    const page = pageHarness(`src/pages/${route}/index.tsx`, {
      getArticles: (params) => {
        if (hold)
          return new Promise((resolve) => pending.push({ params, resolve }));
        return Promise.resolve(articleResponse(params));
      },
    });
    await page.flush();
    pagination(page).onChange(2, 6);
    await page.flush();
    const ids = articleIds(page);
    assert.equal(ids.length, 6);
    page
      .nodes("button")
      .find(
        (node) =>
          node.props.onClick &&
          node.props.children?.some?.((child) => child?.type === "List"),
      )
      .props.onClick();
    await page.flush();
    assert.equal(pagination(page).current, 2);
    assert.deepEqual(articleIds(page), ids);
    hold = true;
    pagination(page).onChange(3, 6);
    await page.flush();
    search(page).onSearch("Open Source Law");
    await page.flush();
    assert.equal(pending.length, 2);
    pending[1].resolve(articleResponse(pending[1].params));
    await page.flush();
    pending[0].resolve(articleResponse(pending[0].params));
    await page.flush();
    assert.equal(pagination(page).current, 1);
    assert.deepEqual(articleIds(page), [`/${route}/1`]);
  });
}

test("blog URL searches support initial links and browser back without losing the filter on paging", async () => {
  const page = pageHarness("src/pages/blogs/index.tsx", {
    getArticles: async (params) => articleResponse(params),
  });
  page.router.query = { keyword: "Open Source Law" };
  await page.flush();
  assert.deepEqual(articleIds(page), ["/blogs/1"]);
  page.router.query = {};
  page.rerender();
  await page.flush();
  assert.equal(pagination(page).total, 14);
  assert.equal(search(page).value, "");
});

test("calendar year mode fetches all 12 months, changes years, and returns to a month range", async () => {
  const requests = [];
  const events = [
    { ID: 1, title: "October event", start_time: "2025-10-28T09:00:00Z" },
    { ID: 2, title: "December event", start_time: "2025-12-06T09:00:00Z" },
  ];
  const page = pageHarness("src/pages/events/calendar/index.tsx", {
    getEvents: async (params) => {
      requests.push(params);
      return {
        success: true,
        data: {
          events: events.filter(
            (event) =>
              event.start_time.slice(0, 10) >= params.start_date &&
              event.start_time.slice(0, 10) <= params.end_date,
          ),
        },
      };
    },
  });
  await page.flush();
  calendar(page).onPanelChange(dayjs("2025-11-01"), "year");
  await page.flush();
  assert.equal(requests.at(-1).start_date, "2025-01-01");
  assert.equal(requests.at(-1).end_date, "2025-12-31");
  for (const month of ["2025-10-01", "2025-12-01"]) {
    const cell = calendar(page).cellRender(dayjs(month), { type: "month" });
    assert.equal(cell.props.children.props.count, 1);
  }
  calendar(page).onPanelChange(dayjs("2024-11-01"), "year");
  await page.flush();
  assert.equal(requests.at(-1).start_date, "2024-01-01");
  calendar(page).onPanelChange(dayjs("2025-12-01"), "month");
  await page.flush();
  assert.equal(requests.at(-1).start_date, "2025-12-01");
  assert.equal(requests.at(-1).end_date, "2025-12-31");
});

test("community pagination reaches entries beyond 50 and uses total count on every page", async () => {
  const requests = [];
  const cities = Array.from({ length: 53 }, (_, i) => ({
    ID: i + 1,
    city: `City ${i + 1}`,
  }));
  const page = pageHarness("src/pages/community/index.tsx", {
    getCommunities: async (params) => {
      requests.push(params);
      return {
        success: true,
        data: {
          total: cities.length,
          communities: cities.slice(
            (params.page - 1) * params.page_size,
            params.page * params.page_size,
          ),
        },
      };
    },
  });
  await page.flush();
  pagination(page).onChange(5, 12);
  await page.flush();
  assert.equal(requests.at(-1).page, 5);
  assert.equal(pagination(page).total, 53);
  assert.equal(
    page.nodes("span").filter((node) => node.props.children === "City 53")
      .length,
    1,
  );
  pagination(page).onChange(5, 24);
  await page.flush();
  assert.equal(pagination(page).current, 1);
  assert.equal(requests.at(-1).page_size, 24);
});
