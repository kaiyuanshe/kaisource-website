import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const require = createRequire(import.meta.url);
const { transformSync } = require("next/dist/build/swc");
const read = (path) =>
  readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

function compile(path, imports = {}) {
  const module = { exports: {} };
  const { code } = transformSync(read(path), {
    filename: path,
    jsc: {
      target: "es2022",
      parser: { syntax: "typescript", tsx: true },
      transform: { react: { runtime: "automatic" } },
    },
    module: { type: "commonjs" },
  });
  new Function("require", "module", "exports", code)(
    (name) => imports[name] ?? require(name),
    module,
    module.exports,
  );
  return module.exports;
}

test("all local image paths in the about page and its data exist in the release", () => {
  const paths = new Set(
    [
      ...`${read("src/pages/about/index.tsx")}\n${read("src/data/about.ts")}`.matchAll(
        /["'](\/img\/[^"']+)["']/g,
      ),
    ].map((match) => match[1]),
  );
  assert.ok(paths.size >= 20, "Check the page gallery as well as its hero");
  for (const path of paths)
    assert.ok(
      existsSync(new URL(`../public${path}`, import.meta.url)),
      `Missing public image: ${path}`,
    );
});

for (const locale of ["zh-CN", "en"]) {
  test(`honor wall renders six icons and complete text without broken image requests (${locale})`, () => {
    const data = compile("src/data/about.ts");
    const translations = {
      ...JSON.parse(read("locales/en/initial.json")),
      ...JSON.parse(read("locales/en/overrides.json")),
    };
    const translateText = (text) =>
      locale === "en" ? translations[text] || text : text;
    const About = compile("src/pages/about/index.tsx", {
      "@/data/about": data,
      "./index.module.css": {
        __esModule: true,
        default: new Proxy({}, { get: (_, key) => key }),
      },
      "@/components/LocalizedText": {
        __esModule: true,
        default: ({ children }) => children,
      },
      "@/hooks/useTranslation": {
        useTranslation: () => ({ locale, translateText }),
      },
    }).default;
    const html = renderToStaticMarkup(React.createElement(About));
    const wall = html.match(
      /<div class="honorCarousel">([\s\S]*?)<div class="honorIndicators">/,
    )?.[1];
    assert.ok(wall);
    assert.equal((wall.match(/<svg /g) || []).length, 6);
    assert.equal((wall.match(/<img /g) || []).length, 0);
    assert.doesNotMatch(wall, /honor-[^" ]+\.webp/);
    assert.equal(
      (wall.match(/aria-hidden="true"/g) || []).length,
      12,
      "Decorative icons and their containers are hidden from screen readers",
    );
    for (const honor of data.honorsData) {
      const escapedTitle = renderToStaticMarkup(
        React.createElement("h4", null, translateText(honor.title)),
      );
      assert.ok(
        wall.includes(escapedTitle.replace("<h4>", '<h4 class="honorTitle">')),
      );
    }
  });
}
