import { describe, expect, test } from "bun:test";

import {
  buildProjectPublicationHref,
  getPublicationReadinessWarnings,
  getPublicationWarnings,
  normalizeProjectPage,
  normalizeSavedProjectProfile,
  safeHttpsPreview,
  updateImageSelection,
  type ProjectPublicationDraft,
} from "./project-publication-logic";

const completeDraft: ProjectPublicationDraft = {
  public_title: "现代简约实景",
  public_description: "这是一段满足公开发布要求的项目说明，介绍空间规划、施工节点和完工效果。",
  public_image_urls: ["image-1", "image-2", "image-3"],
  style_tags: ["现代", "简约"],
  budget_band: "20-30 万",
  publication_status: "published",
};

describe("tenant project publication behavior", () => {
  test("blocks incomplete content and permits zero images for draft and hidden profiles", () => {
    expect(getPublicationWarnings(completeDraft)).toEqual([]);
    expect(getPublicationWarnings({
      ...completeDraft,
      public_title: "短",
      public_description: "说明太短",
      public_image_urls: ["image-1", "image-2"],
    })).toEqual([
      "公开标题至少需要 2 个字符",
      "公开说明至少需要 20 个字符",
      "发布项目至少需要选择 3 张图片",
    ]);

    for (const publicationStatus of ["draft", "hidden"] as const) {
      expect(getPublicationWarnings({
        public_title: "待完善实景",
        public_description: "草稿和隐藏资料仍保存合法的公开标题与说明，只允许暂时不选择公开图片。",
        public_image_urls: [],
        style_tags: [],
        budget_band: null,
        publication_status: publicationStatus,
      })).toEqual([]);
    }
    expect(getPublicationWarnings({
      ...completeDraft,
      publication_status: "draft",
      style_tags: ["超".repeat(41)],
    })).toContain("每个风格标签最多 40 个字符");
    expect(getPublicationWarnings({
      ...completeDraft,
      publication_status: "draft",
      style_tags: Array.from({ length: 9 }, (_, index) => `风格${index + 1}`),
    })).toContain("风格标签最多选择 8 个");
    expect(getPublicationReadinessWarnings({
      ...completeDraft,
      publication_status: "draft",
      public_image_urls: [],
    })).toContain("发布项目至少需要选择 3 张图片");
  });

  test("keeps image selections across candidate pages and caps them at 30", () => {
    const firstPage = Array.from({ length: 20 }, (_, index) => `image-${index + 1}`);
    const acrossPages = updateImageSelection(firstPage, "image-21", true);
    expect(acrossPages).toHaveLength(21);
    expect(acrossPages).toContain("image-1");
    expect(acrossPages).toContain("image-21");
    expect(updateImageSelection(acrossPages, "image-1", false)).not.toContain("image-1");

    const maximum = Array.from({ length: 30 }, (_, index) => `image-${index + 1}`);
    expect(updateImageSelection(maximum, "image-31", true)).toEqual(maximum);
  });

  test("resets list page on status changes and keeps list pagination fixed at 20", () => {
    expect(buildProjectPublicationHref({
      page: 8,
      publicationStatus: "published",
      statusChanged: true,
    })).toBe("/douyin-miniapp/projects?publicationStatus=published");
    expect(buildProjectPublicationHref({
      page: 2,
      publicationStatus: "draft",
    })).toBe("/douyin-miniapp/projects?page=2&publicationStatus=draft");
  });

  test("rejects mismatched pagination echoes and malformed project pages", () => {
    const page = {
      list: [{
        id: "11111111-1111-4111-8111-111111111111",
        name: "晴天花园装修项目",
        status: "constructing",
        updated_at: "2026-08-21T00:00:00.000Z",
        property: { community: "晴天花园", layout: "三室两厅", area: 120 },
        public_profile: null,
      }],
      pagination: { page: 2, pageSize: 20, total: 21, totalPages: 2 },
    };

    expect(normalizeProjectPage(page, { page: 2, pageSize: 20 })).toEqual(page);
    expect(normalizeProjectPage(page, { page: 1, pageSize: 20 })).toBeNull();
    expect(normalizeProjectPage({
      ...page,
      pagination: { ...page.pagination, pageSize: 100 },
    }, { page: 2, pageSize: 20 })).toBeNull();
    expect(normalizeProjectPage({ ...page, list: [{ id: "raw-id-only" }] }, {
      page: 2,
      pageSize: 20,
    })).toBeNull();
    expect(normalizeProjectPage({
      ...page,
      list: [{
        ...page.list[0],
        property: { community: "晴天花园", layout: {}, area: 120 },
      }],
    }, { page: 2, pageSize: 20 })).toBeNull();
  });

  test("uses only safe HTTPS preview URLs", () => {
    expect(safeHttpsPreview("https://cdn.example.test/project.jpg"))
      .toBe("https://cdn.example.test/project.jpg");
    expect(safeHttpsPreview("http://cdn.example.test/project.jpg")).toBeNull();
    expect(safeHttpsPreview("not-a-url")).toBeNull();
    expect(safeHttpsPreview(null)).toBeNull();
  });

  test("accepts only a complete saved profile response", () => {
    const saved = {
      ...completeDraft,
      updated_at: "2026-08-21T01:00:00.000Z",
    };
    expect(normalizeSavedProjectProfile(saved)).toEqual(saved);
    expect(normalizeSavedProjectProfile({
      ...saved,
      publication_status: "unknown",
    })).toBeNull();
    expect(normalizeSavedProjectProfile({
      ...saved,
      public_image_urls: [1, 2, 3],
    })).toBeNull();
  });
});

describe("tenant project publication source contract", () => {
  test("uses the tenant API, accessible admin primitives, and no manual project ID", async () => {
    const componentSource = await Bun.file(
      new URL("./project-publication.tsx", import.meta.url),
    ).text();
    const pageSource = await Bun.file(
      new URL("../../app/(console)/douyin-miniapp/projects/page.tsx", import.meta.url),
    ).text();
    const menuSource = await Bun.file(
      new URL("../layout/menu-config.ts", import.meta.url),
    ).text();

    expect(componentSource).toContain("项目实景内容");
    expect(componentSource).toContain("publication_status");
    expect(componentSource).toContain("已选图片");
    expect(componentSource).toContain("DialogTitle");
    expect(componentSource).toContain("DialogDescription");
    expect(componentSource).toContain("FieldGroup");
    expect(componentSource).toContain("FieldSet");
    expect(componentSource).toContain("FieldLegend");
    expect(componentSource).toContain("styleTagsInput");
    expect(componentSource).toContain("FieldError");
    expect(componentSource).toContain("useEffect");
    expect(componentSource).toContain("}, [project]);");
    expect(componentSource).toContain("/tenant/douyin-miniapp/projects/");
    expect(componentSource).toContain("/images?");
    expect(componentSource).not.toContain("手工输入项目 ID");
    expect(componentSource).not.toContain("space-y-");
    expect(componentSource).not.toMatch(/(?:bg|text|border)-(?:red|blue|green|yellow|orange|purple)-/);

    expect(pageSource).toContain("/tenant/douyin-miniapp/projects?");
    expect(pageSource).toContain('pageSize: "20"');
    expect(pageSource).toContain('cache: "no-store"');
    expect(pageSource).toContain('"douyin_miniapp.manage"');
    expect(menuSource).toContain('href: "/douyin-miniapp/projects"');
    expect(menuSource).toContain('label: "项目实景内容"');
    expect(menuSource).toContain('permission: "douyin_miniapp.manage"');
  });
});
