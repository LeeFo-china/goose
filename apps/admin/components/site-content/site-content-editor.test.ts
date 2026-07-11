import { existsSync, readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

const root = new URL("../../", import.meta.url);

function read(path: string) {
  const url = new URL(path, root);
  return existsSync(url) ? readFileSync(url, "utf8") : "";
}

describe("官网内容后台合同", () => {
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

  test("预览和高风险动作遵循权限与确认合同", () => {
    const actions = [
      read("components/site-content/site-content-actions.tsx"),
      read("components/site-content/site-content-api.ts"),
    ].join("\n");
    const versions = read("components/site-content/site-content-version-panel.tsx");

    expect(actions).toContain("preview-token");
    expect(actions).toContain("window.open(previewUrl, \"_blank\", \"noopener,noreferrer\")");
    expect(actions).toContain("AlertDialog");
    expect(actions).toContain("cache_revalidation.status === \"failed\"");
    expect(actions).toContain("platform.site_content.publish");
    expect(versions).toContain("pageSize: 20");
    expect(versions).toContain("SiteContentRollbackAction");
  });
});
