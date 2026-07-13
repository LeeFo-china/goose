import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { SiteContentPublicBlock } from "@gooes/domain";

import { ContentBlockRenderer } from "@/components/content/content-block-renderer";
import { ContentCard } from "@/components/content/content-card";
import { ContentList } from "@/components/content/content-list";
import { serializeJsonLd } from "@/components/content/content-structured-data";
import {
  getPublicSiteContentDetail,
  getPublicSiteContentList,
} from "@/lib/site-content-api";
import {
  buildContentListCanonical,
  getSiteContentListForPage,
  parseContentListPage,
} from "@/lib/site-content-page";

describe("public content rendering behavior", () => {
  test("renders all approved blocks as escaped semantic markup", () => {
    const blocks: SiteContentPublicBlock[] = [
      { type: "paragraph", text: "段落 <script>alert(1)</script>" },
      { type: "heading", level: 2, text: "章节标题" },
      {
        type: "image",
        asset: {
          fileId: "11111111-1111-4111-8111-111111111111",
          src: "https://cdn.example.com/room.jpg",
          alt: "完工后的客厅",
          width: 1600,
          height: 1000,
        },
      },
      { type: "quote", text: "施工过程每天都能看到。", attribution: "项目业主" },
      { type: "list", style: "ordered", items: ["确认需求", "开始施工"] },
      { type: "callout", tone: "warning", title: "到场确认", text: "请提前预约。" },
      { type: "metrics", items: [{ label: "工期", value: "86 天" }] },
      {
        type: "gallery",
        images: [
          {
            fileId: "22222222-2222-4222-8222-222222222222",
            src: "https://cdn.example.com/kitchen.jpg",
            alt: "完工后的厨房",
            width: 1200,
            height: 900,
          },
        ],
      },
    ];

    const html = renderToStaticMarkup(
      createElement(ContentBlockRenderer, { blocks }),
    );

    for (const text of [
      "章节标题",
      "完工后的客厅",
      "施工过程每天都能看到。",
      "确认需求",
      "到场确认",
      "86 天",
      "完工后的厨房",
    ]) {
      expect(html).toContain(text);
    }
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
  });

  test("normalizes untrusted page query values", () => {
    expect(parseContentListPage(undefined)).toBe(1);
    expect(parseContentListPage("0")).toBe(1);
    expect(parseContentListPage("2.5")).toBe(1);
    expect(parseContentListPage("9007199254740992")).toBe(1);
    expect(parseContentListPage(["3", "4"])).toBe(1);
    expect(parseContentListPage("7")).toBe(7);
  });

  test("escapes tag openings in JSON-LD payloads", () => {
    const json = serializeJsonLd({
      "@context": "https://schema.org",
      "@type": "Article",
      headline: "</script><script>alert(1)</script>",
      description: "安全测试",
      datePublished: "2026-07-12T08:00:00+08:00",
      author: { "@type": "Person", name: "内容编辑" },
      mainEntityOfPage: "https://www.goodcms.cn/articles/safe-json",
      publisher: { "@type": "Organization", name: "鹅班长" },
    });

    expect(json).not.toContain("<");
    expect(json).toContain("\\u003c/script>");
  });

  test("rejects a public list item from the wrong endpoint type", async () => {
    const fetcher = async (): Promise<Response> => Response.json({
      data: {
        list: [
          {
            id: "33333333-3333-4333-8333-333333333333",
            contentType: "case",
            slug: "wrong-type-case",
            title: "不应出现在文章列表的案例",
            summary: "错误类型响应",
            cover: null,
            publishedAt: "2026-07-12T08:00:00+08:00",
            metadata: {
              city: "杭州",
              areaSquareMeters: 100,
              decorationType: "全案",
              metrics: [],
            },
          },
        ],
        pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
      },
      message: "ok",
    });

    expect(
      getPublicSiteContentList("article", { fetcher }),
    ).rejects.toThrow("官网内容响应格式无效");
  });

  test("reads the paginated public city collection for sitemap discovery", async () => {
    const fetcher = async (input: string | URL | Request): Promise<Response> => {
      expect(String(input)).toContain("/public/site/cities?page=1&pageSize=100");
      return Response.json({
        data: {
          list: [{
            id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
            contentType: "city",
            slug: "shanghai",
            title: "上海装修协作服务",
            summary: "上海城市服务",
            cover: null,
            publishedAt: "2026-07-12T08:00:00+08:00",
            metadata: {
              administrativeCode: "310000",
              cityName: "上海",
              localServiceIntroduction: "为上海装修企业提供项目协作服务。",
            },
          }],
          pagination: { page: 1, pageSize: 100, total: 1, totalPages: 1 },
        },
        message: "ok",
      });
    };

    const result = await getPublicSiteContentList("city", {
      page: 1,
      pageSize: 100,
      fetcher,
    });

    expect(result.list[0]?.contentType).toBe("city");
  });

  test("preserves the upstream requestId on public API failures", async () => {
    const fetcher = async (): Promise<Response> => Response.json(
      {
        success: false,
        message: "内容服务暂时不可用",
        code: "SITE_CONTENT_UPSTREAM_ERROR",
        requestId: "request-sitemap-1",
      },
      { status: 503 },
    );

    await expect(getPublicSiteContentList("article", { fetcher })).rejects.toMatchObject({
      status: 503,
      code: "SITE_CONTENT_UPSTREAM_ERROR",
      requestId: "request-sitemap-1",
    });
  });

  test("bounds public list and detail fetches with stable timeout and network errors", async () => {
    const hangingFetcher = (_input: string | URL | Request, init?: RequestInit): Promise<Response> =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true });
      });

    await expect(getPublicSiteContentList("article", {
      fetcher: hangingFetcher,
      timeoutMs: 5,
    })).rejects.toMatchObject({
      status: 504,
      code: "SITE_CONTENT_UPSTREAM_TIMEOUT",
      category: "timeout",
    });
    await expect(getPublicSiteContentDetail("city", "shanghai", {
      fetcher: async () => Promise.reject(new TypeError("network down")),
      timeoutMs: 5,
    })).rejects.toMatchObject({
      status: 502,
      code: "SITE_CONTENT_UPSTREAM_UNAVAILABLE",
      category: "network",
    });
  });

  test("rejects a public detail from the wrong endpoint type", async () => {
    const fetcher = async (): Promise<Response> => Response.json({
      data: {
        id: "44444444-4444-4444-8444-444444444444",
        contentType: "case",
        slug: "wrong-detail-type",
        title: "错误详情类型",
        summary: "不应通过文章详情校验",
        cover: null,
        publishedAt: "2026-07-12T08:00:00+08:00",
        metadata: {
          city: "杭州",
          areaSquareMeters: 100,
          decorationType: "全案",
          metrics: [],
        },
        seoTitle: null,
        seoDescription: null,
        canonicalUrl: null,
        blocks: [],
      },
      message: "ok",
    });

    expect(
      getPublicSiteContentDetail("article", "wrong-detail-type", { fetcher }),
    ).rejects.toThrow("官网内容响应格式无效");
  });

  test("builds a page-aware canonical without duplicating page one", () => {
    expect(buildContentListCanonical("/articles", 1)).toBe("/articles");
    expect(buildContentListCanonical("/articles", 3)).toBe("/articles?page=3");
    expect(buildContentListCanonical("/cases", 2)).toBe("/cases?page=2");
  });

  test("maps only the stable out-of-range API error to a 404", async () => {
    const outOfRangeFetcher = async (): Promise<Response> => Response.json(
      {
        success: false,
        message: "请求页码超出官网内容范围",
        code: "SITE_CONTENT_PAGE_OUT_OF_RANGE",
      },
      { status: 400 },
    );
    const otherBadRequestFetcher = async (): Promise<Response> => Response.json(
      {
        success: false,
        message: "参数错误",
        code: "SITE_CONTENT_QUERY_INVALID",
      },
      { status: 400 },
    );

    expect(
      getSiteContentListForPage("article", 2, { fetcher: outOfRangeFetcher }),
    ).rejects.toMatchObject({ digest: "NEXT_HTTP_ERROR_FALLBACK;404" });
    expect(
      getSiteContentListForPage("article", 2, { fetcher: otherBadRequestFetcher }),
    ).rejects.toMatchObject({ status: 400, code: "SITE_CONTENT_QUERY_INVALID" });
  });

  test("prioritizes only the first visible list cover and declares its layout sizes", () => {
    const content = {
      id: "55555555-5555-4555-8555-555555555555",
      contentType: "article" as const,
      slug: "priority-cover",
      title: "首屏图片优先级",
      summary: "验证列表首图加载策略",
      cover: {
        fileId: "66666666-6666-4666-8666-666666666666",
        src: "https://cdn.example.com/priority.jpg",
        alt: "装修项目客厅",
        width: 1600,
        height: 1000,
      },
      publishedAt: "2026-07-12T08:00:00+08:00",
      metadata: {
        category: "项目管理",
        author: "内容编辑",
        displayPublishedAt: "2026-07-12T08:00:00+08:00",
      },
    };
    const priorityHtml = renderToStaticMarkup(
      createElement(ContentCard, { content, priority: true }),
    );
    const deferredHtml = renderToStaticMarkup(
      createElement(ContentCard, { content, priority: false }),
    );

    expect(priorityHtml).toContain('loading="eager"');
    expect(priorityHtml).toContain('fetchPriority="high"');
    expect(priorityHtml).toContain('sizes="(min-width: 1280px) 528px');
    expect(deferredHtml).toContain('loading="lazy"');
    expect(deferredHtml).toContain('fetchPriority="auto"');
  });

  test("prioritizes the first available cover when the first row has none", () => {
    const metadata = {
      category: "项目管理",
      author: "内容编辑",
      displayPublishedAt: "2026-07-12T08:00:00+08:00",
    };
    const html = renderToStaticMarkup(createElement(ContentList, {
      basePath: "/articles",
      title: "装修经营文章",
      description: "内容列表",
      data: {
        list: [
          {
            id: "77777777-7777-4777-8777-777777777777",
            contentType: "article",
            slug: "without-cover",
            title: "无封面文章",
            summary: "第一条没有封面",
            cover: null,
            publishedAt: "2026-07-12T08:00:00+08:00",
            metadata,
          },
          {
            id: "88888888-8888-4888-8888-888888888888",
            contentType: "article",
            slug: "with-cover",
            title: "有封面文章",
            summary: "第二条是首个有封面的内容",
            cover: {
              fileId: "99999999-9999-4999-8999-999999999999",
              src: "https://cdn.example.com/first-visible-cover.jpg",
              alt: "首个可见封面",
              width: 1600,
              height: 1000,
            },
            publishedAt: "2026-07-12T08:00:00+08:00",
            metadata,
          },
        ],
        pagination: { page: 1, pageSize: 20, total: 2, totalPages: 1 },
      },
    }));

    expect(html).toContain('src="https://cdn.example.com/first-visible-cover.jpg"');
    expect(html).toContain('loading="eager"');
    expect(html).toContain('fetchPriority="high"');
    expect(html.match(/<img[^>]*fetchPriority="high"/g)).toHaveLength(1);
  });
});
