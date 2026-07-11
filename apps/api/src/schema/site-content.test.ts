import { describe, expect, test } from "bun:test";

import {
  CreateSiteContentEntrySchema,
  CreateSiteContentVersionSchema,
  SiteContentIdParamSchema,
  SiteContentListQuerySchema,
  SiteContentSlugParamSchema,
} from "./site-content";

const validDraft = {
  title: "首篇文章",
  summary: "摘要",
  coverFileId: "11111111-1111-4111-8111-111111111111",
  blocks: [{ type: "paragraph", text: "正文" }],
  seoTitle: "SEO 标题",
  seoDescription: "SEO 描述",
  canonicalUrl: "https://www.goodcms.cn/articles/first-article",
};

describe("site content request schema", () => {
  test("validates slug, UUID and pagination boundaries", () => {
    expect(SiteContentSlugParamSchema.safeParse({ slug: "first-article" }).success).toBe(true);
    expect(SiteContentSlugParamSchema.safeParse({ slug: "First_article" }).success).toBe(false);
    expect(SiteContentIdParamSchema.safeParse({ id: "not-a-uuid" }).success).toBe(false);
    expect(SiteContentListQuerySchema.parse({})).toMatchObject({ page: 1, pageSize: 20 });
    expect(SiteContentListQuerySchema.safeParse({ pageSize: 101 }).success).toBe(false);
  });

  test("accepts only controlled blocks and canonical HTTP URLs", () => {
    expect(CreateSiteContentVersionSchema.safeParse(validDraft).success).toBe(true);
    expect(CreateSiteContentVersionSchema.safeParse({
      ...validDraft,
      blocks: [{ type: "html", html: "<script>alert(1)</script>" }],
    }).success).toBe(false);
    expect(CreateSiteContentVersionSchema.safeParse({
      ...validDraft,
      canonicalUrl: "javascript:alert(1)",
    }).success).toBe(false);
  });

  test("validates metadata by content type", () => {
    expect(CreateSiteContentEntrySchema.safeParse({
      contentType: "article",
      slug: "first-article",
      version: {
        ...validDraft,
        metadata: { category: "行业观察", author: "古德", displayPublishedAt: "2026-07-12T08:00:00+08:00" },
      },
    }).success).toBe(true);
    expect(CreateSiteContentEntrySchema.safeParse({
      contentType: "case",
      slug: "hangzhou-home",
      version: {
        ...validDraft,
        metadata: { city: "杭州", areaSquareMeters: 128, decorationType: "全案", metrics: [{ label: "工期", value: "120天" }] },
      },
    }).success).toBe(true);
    expect(CreateSiteContentEntrySchema.safeParse({
      contentType: "city",
      slug: "hangzhou",
      version: {
        ...validDraft,
        metadata: { administrativeCode: "330100", cityName: "杭州", localServiceIntroduction: "杭州本地装修服务" },
      },
    }).success).toBe(true);
    expect(CreateSiteContentEntrySchema.safeParse({
      contentType: "article",
      slug: "wrong-metadata",
      version: { ...validDraft, metadata: { cityName: "杭州" } },
    }).success).toBe(false);
  });
});
