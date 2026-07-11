import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { SiteContentPublicBlock } from "@gooes/domain";

import { ContentBlockRenderer } from "@/components/content/content-block-renderer";
import { serializeJsonLd } from "@/components/content/content-structured-data";
import {
  getPublicSiteContentDetail,
  getPublicSiteContentList,
} from "@/lib/site-content-api";
import { parseContentListPage } from "@/lib/site-content-page";

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
});
