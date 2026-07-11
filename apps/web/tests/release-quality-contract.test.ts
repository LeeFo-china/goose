import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import sitemap from "@/app/sitemap";
import { scanVisibleCopySource } from "@/scripts/check-visible-copy.mjs";

const webRoot = join(import.meta.dir, "..");

function read(path: string): string {
  const absolutePath = join(webRoot, path);
  return existsSync(absolutePath) ? readFileSync(absolutePath, "utf8") : "";
}

describe("official website release quality contract", () => {
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
      expect(entries.map((entry) => entry.url)).toContain(
        "https://www.goodcms.cn/articles/article-page-two",
      );
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
      expect(JSON.stringify(errors)).toContain("request-sitemap-failure");
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

    expect(nextConfig).toContain("GOOES_WEB_DIST_DIR");
    expect(playwrightConfig).toContain("GOOES_WEB_DIST_DIR=.next-e2e");
  });
});
