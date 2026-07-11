import { existsSync, readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

import {
  formatCaseMetrics,
  parseCaseMetrics,
  SiteContentEditorSchema,
} from "./site-content-editor-schema";
import { parseSiteContentPreviewUrl } from "./site-content-preview";

const root = new URL("../../", import.meta.url);

function read(path: string) {
  const url = new URL(path, root);
  return existsSync(url) ? readFileSync(url, "utf8") : "";
}

describe("官网内容后台合同", () => {
  const baseEditorValue = {
    contentType: "article",
    slug: "valid-article",
    title: "有效标题",
    summary: null,
    coverFileId: null,
    blocks: [],
    seoTitle: null,
    seoDescription: null,
    canonicalUrl: null,
    metadata: {
      category: "装修指南",
      author: "鹅班长编辑部",
      displayPublishedAt: "2026-07-12T08:00:00.000+08:00",
    },
  } as const;

  test("按 contentType 校验 metadata 并映射字段路径", () => {
    expect(SiteContentEditorSchema.safeParse(baseEditorValue).success).toBe(true);

    const invalid = SiteContentEditorSchema.safeParse({
      ...baseEditorValue,
      metadata: {
        city: "郑州",
        areaSquareMeters: 120,
        decorationType: "整装",
        metrics: [],
      },
    });
    expect(invalid.success).toBe(false);
    if (!invalid.success) {
      expect(invalid.error.issues.some((issue) => issue.path[0] === "metadata")).toBe(true);
      expect(invalid.error.issues.some((issue) => issue.path[1] === "category")).toBe(true);
    }
  });

  test("案例指标文本可无损解析和格式化", () => {
    const metrics = parseCaseMetrics("工期|90 天\n面积|128 ㎡");
    expect(metrics).toEqual([
      { label: "工期", value: "90 天" },
      { label: "面积", value: "128 ㎡" },
    ]);
    expect(formatCaseMetrics(metrics)).toBe("工期|90 天\n面积|128 ㎡");
  });

  test("Preview URL 只接受绝对 HTTP(S) 地址", () => {
    expect(parseSiteContentPreviewUrl("https://www.goodcms.cn/preview?t=secret")).toBe(
      "https://www.goodcms.cn/preview?t=secret",
    );
    expect(parseSiteContentPreviewUrl("http://localhost:3020/preview?t=secret")).toBe(
      "http://localhost:3020/preview?t=secret",
    );
    expect(parseSiteContentPreviewUrl("javascript:alert(1)")).toBeNull();
    expect(parseSiteContentPreviewUrl("ftp://example.com/file")).toBeNull();
    expect(parseSiteContentPreviewUrl("/relative-preview")).toBeNull();
    expect(parseSiteContentPreviewUrl(123)).toBeNull();
  });

  test("只在平台模式展示有读取权限的入口", () => {
    const menu = read("components/layout/menu-config.ts");
    const page = read("app/(console)/platform/site-content/page.tsx");

    expect(menu).toContain('href: "/platform/site-content"');
    expect(menu).toContain('permission: "platform.site_content.read"');
    expect(page).toContain("isPlatformOnlySession");
    expect(page).toContain("platform.site_content.read");
  });

  test("列表使用 URL 分页和固定边界", () => {
    const page = read("app/(console)/platform/site-content/page.tsx");
    const types = read("components/site-content/site-content-types.ts");

    expect(page).toContain("pageSize");
    expect(types).toContain("SITE_CONTENT_DEFAULT_PAGE_SIZE = 20");
    expect(types).toContain("SITE_CONTENT_MAX_PAGE_SIZE = 100");
  });

  test("编辑器使用 FieldGroup 和八种受控内容块", () => {
    const editor = read("components/site-content/site-content-editor.tsx");
    const blocks = [
      read("components/site-content/site-content-block-editor.tsx"),
      read("components/site-content/site-content-image-field.tsx"),
    ].join("\n");

    expect(editor).toContain("FieldGroup");
    expect(editor).toContain("SiteContentBlockEditor");
    for (const type of [
      "paragraph",
      "heading",
      "image",
      "quote",
      "list",
      "callout",
      "metrics",
      "gallery",
    ]) {
      expect(blocks).toContain(`\"${type}\"`);
    }
    expect(blocks).toContain("uploadDirectToCos");
    expect(editor).not.toContain("dangerouslySetInnerHTML");
    expect(blocks).not.toContain("dangerouslySetInnerHTML");
    expect(editor.toLowerCase()).not.toContain("html editor");
  });

  test("案例指标可编辑，封面不收集会被丢弃的替代文本", () => {
    const editor = read("components/site-content/site-content-editor.tsx");
    const imageField = read("components/site-content/site-content-image-field.tsx");

    expect(editor).toContain('htmlFor="case-metrics"');
    expect(editor).toContain('onChange("metrics"');
    expect(editor).toContain("hideAlt");
    expect(imageField).toContain("hideAlt?: boolean");
    expect(imageField).toContain("封面替代文本由公开渲染策略生成");
  });

  test("上传期间以稳定 client key 锁定编辑器结构和提交", () => {
    const editor = read("components/site-content/site-content-editor.tsx");
    const blocks = read("components/site-content/site-content-block-editor.tsx");
    const imageField = read("components/site-content/site-content-image-field.tsx");

    expect(blocks).toContain("clientKeys");
    expect(blocks).toContain("onUploadStateChange");
    expect(editor).toContain("activeUploads");
    expect(editor).toContain("isUploading");
    expect(editor).toContain("pending || isUploading");
    expect(imageField).toContain("onUploadingChange");
    expect(imageField).toContain("mountedRef");
    expect(imageField).toContain("useEffect(() => {\n    mountedRef.current = true;");
    expect(imageField).toContain("onChangeRef.current");
  });

  test("slug 独立保存且版本保存不再隐式更新 slug", () => {
    const editor = read("components/site-content/site-content-editor.tsx");

    expect(editor).toContain("保存 slug");
    expect(editor).toContain("savedSlug");
    expect(editor).toContain("hasUnsavedSlug");
    expect(editor).not.toContain("await updateSiteContentSlug(detail.entry.id, values.slug.trim())");
  });

  test("metadata 映射就近错误，画廊可删除图片，新建页要求 manage", () => {
    const editor = read("components/site-content/site-content-editor.tsx");
    const blockFields = read("components/site-content/site-content-block-fields.tsx");
    const newPage = read("app/(console)/platform/site-content/new/page.tsx");

    expect(editor).toContain("SiteContentEditorSchema");
    expect(editor).toContain("getMetadataError");
    expect(editor).toContain("aria-invalid");
    expect(blockFields).toContain("删除画廊图片");
    expect(blockFields).toContain("block.images.length <= 1");
    expect(newPage).toContain("platform.site_content.manage");
    expect(newPage).toContain("notFound()");
  });

  test("预览和高风险动作遵循权限与确认合同", () => {
    const actions = [
      read("components/site-content/site-content-actions.tsx"),
      read("components/site-content/site-content-api.ts"),
    ].join("\n");
    const versions = read("components/site-content/site-content-version-panel.tsx");

    expect(actions).toContain("preview-token");
    expect(actions).toContain('window.open("about:blank", "_blank")');
    expect(actions).toContain("previewWindow.opener = null");
    expect(actions).toContain("previewWindow.location.replace(safePreviewUrl)");
    expect(actions).toContain("previewWindow.close()");
    expect(actions).toContain("parseSiteContentPreviewUrl");
    expect(actions).toContain("AlertDialog");
    expect(actions).toContain("cache_revalidation.status === \"failed\"");
    expect(actions).toContain("platform.site_content.publish");
    expect(versions).toContain("pageSize: 20");
    expect(versions).toContain("SiteContentRollbackAction");
  });
});
