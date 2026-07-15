import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  PHASE_DEVELOPMENT_SERVER,
  PHASE_PRODUCTION_BUILD,
} from "next/constants";

import sitemap from "@/app/sitemap";
import { scanVisibleCopySource } from "@/scripts/check-visible-copy.mjs";
import createNextConfig from "../next.config";

const webRoot = join(import.meta.dir, "..");

function read(path: string): string {
  const absolutePath = join(webRoot, path);
  return existsSync(absolutePath) ? readFileSync(absolutePath, "utf8") : "";
}

describe("official website release quality contract", () => {
  test("separates development and production Next outputs", () => {
    const previousDistDir = process.env.NEXT_DIST_DIR;

    try {
      delete process.env.NEXT_DIST_DIR;
      expect(createNextConfig(PHASE_DEVELOPMENT_SERVER).distDir).toBe(".next-dev");

      process.env.NEXT_DIST_DIR = ".next-custom";
      expect(createNextConfig(PHASE_DEVELOPMENT_SERVER).distDir).toBe(".next-custom");
      expect(createNextConfig(PHASE_PRODUCTION_BUILD).distDir).toBe(".next");
    } finally {
      if (previousDistDir === undefined) {
        delete process.env.NEXT_DIST_DIR;
      } else {
        process.env.NEXT_DIST_DIR = previousDistDir;
      }
    }
  });

  test("scans visible copy without treating code or aria labels as visible text", () => {
    const findings = scanVisibleCopySource(`
      const Scroll = "implementation detail";
      export function Sample() {
        return <div aria-label="Scroll"><p>正常内容</p></div>;
      }
    `);

    expect(findings).toEqual([]);
    expect(scanVisibleCopySource("<p>流程—清晰</p>")).toMatchObject([
      { rule: "em-dash" },
    ]);
    expect(scanVisibleCopySource("<footer>v1.4.2</footer>")).toMatchObject([
      { rule: "version-footer" },
    ]);
    expect(scanVisibleCopySource(`
      // 页面—注释不渲染
      const internalCopy = "内部—常量不渲染";
      export function Sample() { return <p>正常内容</p>; }
    `)).toEqual([]);
  });

  test("rejects decorative section sequences and placeholder-only fields", () => {
    expect(scanVisibleCopySource("<><p>01 / 产品</p><p>02 / 案例</p><p>03 / 关于</p></>"))
      .toContainEqual(expect.objectContaining({ rule: "section-number" }));
    expect(scanVisibleCopySource('<Field><Input placeholder="姓名" /></Field>'))
      .toContainEqual(expect.objectContaining({ rule: "placeholder-as-label" }));
    expect(scanVisibleCopySource('<Field><SelectValue placeholder="请选择" /></Field>'))
      .toContainEqual(expect.objectContaining({ rule: "placeholder-as-label" }));
    expect(scanVisibleCopySource(
      '<Field><FieldLabel>姓名</FieldLabel><Input placeholder="请输入姓名" /></Field>',
    )).toEqual([]);
    expect(scanVisibleCopySource(
      '<Field><FieldLabel></FieldLabel><input placeholder="姓名" /></Field>',
    )).toContainEqual(expect.objectContaining({ rule: "placeholder-as-label" }));
    expect(scanVisibleCopySource(
      '<Field><label className="sr-only">姓名</label><textarea placeholder="姓名" /></Field>',
    )).toContainEqual(expect.objectContaining({ rule: "placeholder-as-label" }));
  });

  test("scans strings from data objects that a JSX map actually renders", () => {
    const findings = scanVisibleCopySource(`
      const visibleItems = [
        { title: "01 / 产品" },
        { title: "02 / 案例" },
        { title: "03 / 关于" },
      ];
      const unusedItems = [{ title: "内部—不渲染" }];
      export function Sample() {
        return <>{visibleItems.map((item) => <p>{item.title}</p>)}</>;
      }
    `);

    expect(findings).toContainEqual(expect.objectContaining({ rule: "section-number" }));
    expect(findings).not.toContainEqual(expect.objectContaining({ rule: "em-dash" }));
  });

  test("scans only attributes and object properties that JSX makes visible", () => {
    const findings = scanVisibleCopySource(`
      const copy = { title: "Scroll to explore", internal: "内部—不渲染" };
      const unused = { title: "未渲染—对象" };
      export function Sample() {
        return <>
          <Card title="卡片—标题" description="描述—文案" aria-label="忽略—aria" className="忽略—样式" />
          <img alt="图片—说明" src="/hero—asset.jpg" />
          <input title="输入—提示" placeholder="占位—文案" name="field—name" value="值—行为" />
          <p>{copy.title}</p>
        </>;
      }
    `);

    expect(findings.filter((finding) => finding.rule === "em-dash").map((finding) => finding.text))
      .toEqual(["卡片—标题", "描述—文案", "图片—说明", "输入—提示", "占位—文案"]);
    expect(findings).toContainEqual(expect.objectContaining({ rule: "scroll-cue" }));
    expect(findings).toContainEqual(expect.objectContaining({ rule: "placeholder-as-label" }));
    expect(JSON.stringify(findings)).not.toContain("未渲染—对象");
    expect(JSON.stringify(findings)).not.toContain("忽略—aria");
    expect(JSON.stringify(findings)).not.toContain("忽略—样式");
    expect(JSON.stringify(findings)).not.toContain("hero—asset");
    expect(JSON.stringify(findings)).not.toContain("field—name");
    expect(JSON.stringify(findings)).not.toContain("值—行为");
  });

  test("walks every public collection page with pageSize 100", async () => {
    const originalFetch = globalThis.fetch;
    const requested: string[] = [];
    const summary = (contentType: "article" | "case" | "city", slug: string) => ({
      id: contentType === "article"
        ? "11111111-1111-4111-8111-111111111111"
        : contentType === "case"
          ? "22222222-2222-4222-8222-222222222222"
          : "33333333-3333-4333-8333-333333333333",
      contentType,
      slug,
      title: `${slug} 标题`,
      summary: `${slug} 摘要`,
      cover: null,
      publishedAt: "2026-07-12T08:00:00+08:00",
      metadata: contentType === "article"
        ? { category: "经营", author: "内容编辑", displayPublishedAt: "2026-07-12T08:00:00+08:00" }
        : contentType === "case"
          ? { city: "上海", areaSquareMeters: 100, decorationType: "全案", metrics: [] }
          : { administrativeCode: "310000", cityName: "上海", localServiceIntroduction: "上海装修协作服务" },
    });
    globalThis.fetch = Object.assign(async (input: string | URL | Request) => {
      const url = String(input);
      requested.push(url);
      const path = new URL(url).pathname;
      const page = Number(new URL(url).searchParams.get("page"));
      const type = path.includes("articles") ? "article" : path.includes("cases") ? "case" : "city";
      const isArticle = type === "article";
      const list = isArticle && page === 1
        ? Array.from({ length: 100 }, (_, index) => summary(type, `article-page-${index + 1}`))
        : [summary(type, isArticle ? "article-page-two" : `${type}-page-one`)];
      return Response.json({
        data: {
          list,
          pagination: {
            page,
            pageSize: 100,
            total: isArticle ? 101 : 1,
            totalPages: isArticle ? 2 : 1,
          },
        },
        message: "ok",
      });
    }, { preconnect: originalFetch.preconnect });

    try {
      const entries = await sitemap();
      expect(entries.map((entry) => entry.url)).toEqual(expect.arrayContaining([
        "https://www.goodcms.cn/articles/article-page-two",
        "https://www.goodcms.cn/cases/case-page-one",
        "https://www.goodcms.cn/cities/city-page-one",
      ]));
      expect(requested).toHaveLength(4);
      expect(requested.every((url) => url.includes("pageSize=100"))).toBe(true);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("keeps static routes and logs requestId when one collection fails", async () => {
    const originalFetch = globalThis.fetch;
    const originalError = console.error;
    const errors: unknown[][] = [];
    globalThis.fetch = Object.assign(async () => Response.json({
      success: false,
      message: "upstream failed",
      code: "SITE_CONTENT_UPSTREAM_ERROR",
      requestId: "request-sitemap-failure",
    }, { status: 503 }), { preconnect: originalFetch.preconnect });
    console.error = (...args: unknown[]) => errors.push(args);

    try {
      const entries = await sitemap();
      expect(entries.map((entry) => entry.url)).toContain("https://www.goodcms.cn/partners");
      expect(errors).toContainEqual([
        "官网 Sitemap 内容读取失败",
        expect.objectContaining({
          contentType: "article",
          requestId: "request-sitemap-failure",
          status: 503,
          code: "SITE_CONTENT_UPSTREAM_ERROR",
          category: "upstream",
        }),
      ]);
    } finally {
      globalThis.fetch = originalFetch;
      console.error = originalError;
    }
  });

  test("fails soft before sitemap page or URL limits can grow without bound", async () => {
    const originalFetch = globalThis.fetch;
    const originalError = console.error;
    const errors: unknown[][] = [];
    globalThis.fetch = Object.assign(async (input: string | URL | Request) => {
      const url = new URL(String(input));
      const contentType = url.pathname.includes("articles") ? "article" : url.pathname.includes("cases") ? "case" : "city";
      const metadata = contentType === "article"
        ? { category: "经营", author: "编辑", displayPublishedAt: "2026-07-12T08:00:00+08:00" }
        : contentType === "case"
          ? { city: "上海", areaSquareMeters: 90, decorationType: "全案", metrics: [] }
          : { administrativeCode: "310000", cityName: "上海", localServiceIntroduction: "上海装修服务" };
      return Response.json({
        data: {
          list: Array.from({ length: 100 }, (_, index) => ({
            id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
            contentType,
            slug: `${contentType}-overflow-${index + 1}`,
            title: "容量边界",
            summary: "容量边界",
            cover: null,
            publishedAt: "2026-07-12T08:00:00+08:00",
            metadata,
          })),
          pagination: { page: 1, pageSize: 100, total: 49_001, totalPages: 491 },
        },
        message: "ok",
      });
    }, { preconnect: originalFetch.preconnect });
    console.error = (...args: unknown[]) => errors.push(args);

    try {
      const entries = await sitemap();
      expect(entries.length).toBeLessThan(50_000);
      expect(entries.some((entry) => entry.url.includes("overflow"))).toBe(false);
      expect(JSON.stringify(errors)).toContain("SITEMAP_PAGE_LIMIT_EXCEEDED");
    } finally {
      globalThis.fetch = originalFetch;
      console.error = originalError;
    }
  });

  test("builds a paginated fail-soft dynamic sitemap", () => {
    const source = read("app/sitemap.ts");

    expect(source).toContain("async function sitemap");
    expect(source).toContain("SITEMAP_PAGE_SIZE = 100");
    expect(source).toContain("totalPages");
    expect(source).toContain("requestId");
    expect(source).toContain('"/products"');
    expect(source).toContain('"/articles"');
    expect(source).toContain('"/cases"');
  });

  test("keeps unpublished sitemap bait out of public E2E fixtures", () => {
    const stub = read("e2e/upstream-stub.mjs");

    expect(stub).toContain("allContentFixtures");
    expect(stub).toContain('status: "published"');
    expect(stub).toContain('status: "draft"');
    expect(stub).toContain('status: "archived"');
    expect(stub).toContain('entry.status === "published"');
    expect(stub).toContain('slug: "draft-article"');
    expect(stub).toContain('slug: "archived-case"');
  });

  test("provides a generated default Open Graph image and complete root metadata", () => {
    const layout = read("app/layout.tsx");
    const image = read("app/opengraph-image.tsx");

    expect(layout).toContain("openGraph:");
    expect(layout).toContain("twitter:");
    expect(image).toContain("ImageResponse");
    expect(image).toContain("1200");
    expect(image).toContain("630");
  });

  test("runs the visible-copy scanner as part of web check", () => {
    const packageJson = read("package.json");
    const scanner = read("scripts/check-visible-copy.mjs");

    expect(packageJson).toContain("check:visible-copy");
    expect(packageJson).toContain("pnpm run check:visible-copy");
    expect(scanner).toContain("placeholder-as-label");
    expect(scanner).toContain("section-number");
    expect(scanner).toContain("version-footer");
  });

  test("isolates E2E data cache from local and production builds", () => {
    const nextConfig = read("next.config.ts");
    const playwrightConfig = read("playwright.config.ts");
    const runner = read("scripts/run-playwright-e2e.mjs");

    expect(playwrightConfig).toContain("reuseExistingServer: false");
    expect(playwrightConfig).not.toContain("next-e2e");
    expect(runner).toContain('rmSync(join(webRoot, ".next")');
    expect(runner).toContain('"next-env.d.ts"');
    expect(runner).toContain('"tsconfig.json"');
    expect(runner).toContain("createHash");
  });

  test("keeps Playwright release checks deterministic without retries", () => {
    const playwrightConfig = read("playwright.config.ts");

    expect(playwrightConfig).toContain("retries: 0");
    expect(playwrightConfig).not.toContain("process.env.CI ? 2 : 0");
  });

  test("blocks streaming metadata for every user agent", () => {
    const nextConfig = read("next.config.ts");
    const lighthouseDoc = read("LIGHTHOUSE.md");

    expect(nextConfig).toContain("htmlLimitedBots: /.*/");
    expect(nextConfig).toContain("动态 metadata");
    expect(lighthouseDoc).toContain("约 2.02 秒");
    expect(lighthouseDoc).toContain("首页 metadata 为静态");
    expect(lighthouseDoc).toContain("2.465 秒");
  });

  test("gives every public landing and paginated list its own Open Graph URL", () => {
    for (const [path, canonical] of [
      ["app/(marketing)/products/page.tsx", "/products"],
      ["app/(marketing)/solutions/page.tsx", "/solutions"],
      ["app/(marketing)/about/page.tsx", "/about"],
      ["app/(marketing)/partners/page.tsx", "/partners"],
    ] as const) {
      const source = read(path);
      expect(source).toContain("openGraph:");
      expect(source).toContain(`url: "${canonical}"`);
      expect(source).toContain("title:");
      expect(source).toContain("description:");
    }

    for (const path of [
      "app/(content)/articles/page.tsx",
      "app/(content)/cases/page.tsx",
    ]) {
      const source = read(path);
      expect(source).toContain("openGraph:");
      expect(source).toContain("canonical");
      expect(source).toContain("第 ${page} 页");
    }
  });

  test("checks a reproducible five-route Lighthouse summary", () => {
    const packageJson = read("package.json");
    const runner = read("scripts/run-lighthouse-gate.mjs");
    const checker = read("scripts/check-lighthouse-summary.mjs");
    const summary = JSON.parse(read("lighthouse-summary.json") || "null") as {
      generatedAt?: string;
      baseUrl?: string;
      sourceDigest?: string;
      fixtureDigest?: string;
      buildId?: string;
      revision?: string;
      routes?: Array<{ path?: string }>;
    } | null;

    expect(packageJson).toContain("lighthouse:gate");
    expect(packageJson).toContain("check:lighthouse-summary");
    expect(packageJson).toContain("pnpm run check:lighthouse-summary");
    expect(runner).toContain("lighthouse@12.8.2");
    expect(runner).toContain("performance: 85");
    expect(runner).toContain("accessibility: 95");
    expect(runner).toContain("seo: 95");
    expect(runner).toContain("lcpMs: 2_500");
    expect(runner).toContain("cityRuns = 3");
    expect(runner).toContain("assertPortAvailable");
    expect(runner).toContain("GOOES_BUILD_SHA");
    expect(runner).toContain("x-gooes-revision");
    expect(runner).toContain("computeReleaseQualityDigests");
    expect(checker).toContain("lighthouse-summary.json");
    expect(checker).toContain("computeReleaseQualityDigests");
    const digest = read("scripts/release-quality-digest.mjs");
    for (const script of [
      "sync-standalone-assets.mjs",
      "run-lighthouse-gate.mjs",
      "check-lighthouse-summary.mjs",
      "release-quality-digest.mjs",
      "check-visible-copy.mjs",
      "run-playwright-e2e.mjs",
      "verify-standalone-css.mjs",
    ]) {
      expect(digest).toContain(script);
    }
    expect(digest).not.toContain("lighthouse-summary.json");
    expect(summary?.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/u);
    expect(summary?.baseUrl).toBe("http://127.0.0.1:3020");
    expect(summary?.sourceDigest).toMatch(/^[a-f0-9]{64}$/u);
    expect(summary?.fixtureDigest).toMatch(/^[a-f0-9]{64}$/u);
    expect(summary?.buildId).toBeTruthy();
    expect(summary?.revision).toBe(summary?.sourceDigest);
    expect(summary?.routes?.map((route) => route.path)).toEqual([
      "/",
      "/partners",
      "/articles/e2e-article",
      "/cases/e2e-case",
      "/cities/shanghai",
    ]);
  });
});
