import { existsSync, readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

import { createEmptySiteContentBlock, resolveAllowedSiteContentBlockTypes } from
  "@/components/site-content/site-content-block-editor";
import { narrowMaterialNoteEditorBlocks } from
  "@/components/douyin-miniapp/material-note-editor";
import { selectMaterialVersionAfterPageLoad } from
  "@/components/douyin-miniapp/material-note-detail";

const adminRoot = new URL("../../", import.meta.url);

function read(path: string) {
  const url = new URL(path, adminRoot);
  return existsSync(url) ? readFileSync(url, "utf8") : "";
}

describe("抖音资料后台工作台 UI 合同", () => {
  test("资料编辑器只开放五类文本块且官网编辑器默认能力不变", () => {
    expect(resolveAllowedSiteContentBlockTypes()).toEqual([
      "paragraph",
      "heading",
      "image",
      "quote",
      "list",
      "callout",
      "metrics",
      "gallery",
    ]);
    expect(resolveAllowedSiteContentBlockTypes([
      "heading",
      "paragraph",
      "list",
      "quote",
      "callout",
    ])).toEqual([
      "heading",
      "paragraph",
      "list",
      "quote",
      "callout",
    ]);
    expect(resolveAllowedSiteContentBlockTypes(["image", "paragraph", "image"]))
      .toEqual(["image", "paragraph"]);
    expect(narrowMaterialNoteEditorBlocks([{ type: "paragraph", text: "" }]))
      .toEqual([{ type: "paragraph", text: "" }]);
    expect(narrowMaterialNoteEditorBlocks([{
      type: "image",
      fileId: "11111111-1111-4111-8111-111111111111",
      alt: "图片",
    }])).toBeNull();
    expect(createEmptySiteContentBlock("quote")).toEqual({
      type: "quote",
      text: "",
    });
  });

  test("菜单和页面按 read/manage/publish 三层权限收口", () => {
    const menu = read("components/layout/menu-config.ts");
    const listPage = read("app/(console)/douyin-miniapp/materials/page.tsx");
    const newPage = read("app/(console)/douyin-miniapp/materials/new/page.tsx");
    const detailPage = read("app/(console)/douyin-miniapp/materials/[id]/page.tsx");

    expect(menu).toContain('href: "/douyin-miniapp/materials"');
    expect(menu).toContain('permission: "douyin_material_note.read"');
    expect(listPage).toContain("douyin_material_note.read");
    expect(newPage).toContain("douyin_material_note.manage");
    expect(detailPage).toContain("douyin_material_note.manage");
    expect(detailPage).toContain("douyin_material_note.publish");
  });

  test("列表提供 URL 筛选分页、聚合列和稳定状态", () => {
    const table = read("components/douyin-miniapp/material-note-table.tsx");
    const loading = read("app/(console)/douyin-miniapp/materials/loading.tsx");
    expect(table).toContain("keyword");
    expect(table).toContain("status");
    expect(table).toContain("pageSize");
    expect(table).toContain("router.push");
    expect(table).toContain("claim_count");
    expect(table).toContain("current_version");
    expect(table).toContain("initialError");
    expect(table).toContain("Empty");
    expect(table).toContain("Skeleton");
    expect(loading).toContain("Skeleton");
    expect(loading).toContain("正在加载资料列表");
  });

  test("版本预览先单独取正文，保存只创建新版本", () => {
    const editor = read("components/douyin-miniapp/material-note-editor.tsx");
    const detail = read("components/douyin-miniapp/material-note-detail.tsx");
    expect(editor).toContain("MATERIAL_NOTE_ALLOWED_BLOCK_TYPES");
    expect(editor).toContain("appendMaterialNoteVersion");
    expect(editor).toContain("createMaterialNote");
    expect(editor).toContain("SiteContentBlockEditor");
    expect(editor).toContain("list-decimal");
    expect(editor).toContain("list-disc");
    expect(detail).toContain("getMaterialNoteVersion");
    expect(detail).toContain("selectedVersion");
    expect(detail).toContain("content_blocks");

    const first = { id: "11111111-1111-4111-8111-111111111111" };
    const second = { id: "22222222-2222-4222-8222-222222222222" };
    const previous = { id: "33333333-3333-4333-8333-333333333333" };
    expect(selectMaterialVersionAfterPageLoad([first, second], previous)).toBe(first);
    expect(selectMaterialVersionAfterPageLoad([first, second], previous, second.id)).toBe(second);
    expect(selectMaterialVersionAfterPageLoad([], previous)).toBe(previous);
  });

  test("发布指定版本；归档与不可恢复撤回使用不同确认和原因", () => {
    const actions = read("components/douyin-miniapp/material-note-actions.tsx");
    expect(actions).toContain("createMaterialNoteCommandRequest");
    expect(actions).toContain("executeMaterialNoteCommand");
    expect(actions).toContain("retryRequest");
    expect(actions).toContain("versionId");
    expect(actions).toContain("发布目标版本");
    expect(actions).toContain("归档资料");
    expect(actions).toContain("永久撤回资料");
    expect(actions).toContain("撤回后不能恢复");
    expect(actions).toContain("撤回原因不能为空");
  });

  test("后台不渲染领取人身份或领取人导出操作", () => {
    const materialSources = [
      "components/douyin-miniapp/material-note-contract.ts",
      "components/douyin-miniapp/material-note-api.ts",
      "components/douyin-miniapp/material-note-table.tsx",
      "components/douyin-miniapp/material-note-editor.tsx",
      "components/douyin-miniapp/material-note-actions.tsx",
      "components/douyin-miniapp/material-note-detail.tsx",
      "app/(console)/douyin-miniapp/materials/page.tsx",
      "app/(console)/douyin-miniapp/materials/new/page.tsx",
      "app/(console)/douyin-miniapp/materials/[id]/page.tsx",
    ].map(read).join("\n").toLowerCase();

    expect(materialSources).not.toContain("subject_hash");
    expect(materialSources).not.toContain("claimants");
    expect(materialSources).not.toContain("领取人导出");
    expect(materialSources).not.toContain("export claimant");
  });
});
