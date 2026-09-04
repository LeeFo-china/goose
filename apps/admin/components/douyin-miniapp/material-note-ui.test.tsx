import { existsSync, readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

import { createEmptySiteContentBlock, resolveAllowedSiteContentBlockTypes } from
  "@/components/site-content/site-content-block-editor";
import {
  materialNoteBlocksToTiptapDoc,
  removeMaterialNoteImageBlock,
  tiptapDocToMaterialNoteBlocks,
} from "@/components/douyin-miniapp/material-note-rich-editor-adapter";
import {
  narrowMaterialNoteEditorBlocks,
  resolveMaterialNoteDraftPreviewImageSrc,
  validateMaterialNoteEditorDraft,
} from
  "@/components/douyin-miniapp/material-note-editor";
import {
  hasRetainedPasteContent,
  removePastedImageTags,
} from "@/components/douyin-miniapp/material-note-rich-editor";
import { resolveCurrentMaterialNoteActions } from
  "@/components/douyin-miniapp/material-note-detail";
const adminRoot = new URL("../../", import.meta.url);

function read(path: string) {
  const url = new URL(path, adminRoot);
  return existsSync(url) ? readFileSync(url, "utf8") : "";
}

describe("抖音资料后台工作台 UI 合同", () => {
  test("资料编辑器开放受控图文块且官网编辑器默认能力不变", () => {
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
      "image",
    ])).toEqual([
      "heading",
      "paragraph",
      "list",
      "quote",
      "callout",
      "image",
    ]);
    expect(resolveAllowedSiteContentBlockTypes(["image", "paragraph", "image"]))
      .toEqual(["image", "paragraph"]);
    expect(narrowMaterialNoteEditorBlocks([{ type: "paragraph", text: "" }]))
      .toEqual([{ type: "paragraph", text: "" }]);
    expect(narrowMaterialNoteEditorBlocks([{
      type: "image",
      fileId: "11111111-1111-4111-8111-111111111111",
      alt: "图片",
    }])).toEqual([{
      type: "image",
      fileId: "11111111-1111-4111-8111-111111111111",
      alt: "图片",
    }]);
    expect(createEmptySiteContentBlock("quote")).toEqual({
      type: "quote",
      text: "",
    });
  });

  test("富文本适配器只输出受控资料块，图片草稿不持久化 src", () => {
    const blocks = [{
      type: "heading" as const,
      level: 2 as const,
      text: "开工资料",
    }, {
      type: "paragraph" as const,
      text: "先核对施工图。",
    }, {
      type: "image" as const,
      fileId: "11111111-1111-4111-8111-111111111111",
      alt: "墙面检查图",
      caption: "图片说明",
    }];
    const doc = materialNoteBlocksToTiptapDoc(blocks, {
      "11111111-1111-4111-8111-111111111111": "https://cdn.goodcms.cn/wall.webp",
    });

    expect(JSON.stringify(doc)).toContain("materialImage");
    expect(JSON.stringify(doc)).toContain("https://cdn.goodcms.cn/wall.webp");
    expect(tiptapDocToMaterialNoteBlocks(doc)).toEqual(blocks);
    expect(JSON.stringify(tiptapDocToMaterialNoteBlocks(doc))).not.toContain("cdn.goodcms.cn");
  });

  test("富文本适配器为 fileId 图片生成后台预览 URL，仍优先使用本次上传预览", () => {
    const fileId = "11111111-1111-4111-8111-111111111111";
    const blocks = [{
      type: "image" as const,
      fileId,
      alt: "现场截图",
    }];
    const persistedDoc = materialNoteBlocksToTiptapDoc(blocks);
    const uploadedDoc = materialNoteBlocksToTiptapDoc(blocks, {
      [fileId]: "blob:https://admin-dev.goodcms.cn/preview",
    });

    expect(persistedDoc.content[0]?.attrs?.src).toBe(
      `/api/backend/uploads/public-url?fileId=${fileId}`,
    );
    expect(uploadedDoc.content[0]?.attrs?.src).toBe(
      "blob:https://admin-dev.goodcms.cn/preview",
    );
    expect(tiptapDocToMaterialNoteBlocks(persistedDoc)).toEqual(blocks);
  });

  test("资料图片编辑和小程序预览都使用可访问图片 URL", () => {
    const fileId = "11111111-1111-4111-8111-111111111111";
    const imageBlock = {
      type: "image" as const,
      fileId,
      alt: "好店智装云-logo-200x200",
    };
    const richEditor = read("components/douyin-miniapp/material-note-rich-editor.tsx");
    const editor = read("components/douyin-miniapp/material-note-editor.tsx");

    expect(resolveMaterialNoteDraftPreviewImageSrc(imageBlock)).toBe(
      `/api/backend/uploads/public-url?fileId=${fileId}`,
    );
    expect(richEditor).toContain("result.url || result.publicUrl");
    expect(richEditor).toContain('className="flex items-center gap-3 rounded-md border bg-background p-2"');
    expect(richEditor).toContain("truncate text-sm font-medium");
    expect(richEditor).not.toContain("图片替代文本");
    expect(richEditor).not.toContain("图片说明");
    expect(editor).toContain("<img");
    expect(editor).toContain("resolveMaterialNoteDraftPreviewImageSrc");
    expect(editor).not.toContain("图片已绑定");
  });

  test("富文本适配器支持按图片块序号删除图片，不误删文本块", () => {
    const image = {
      type: "image" as const,
      fileId: "11111111-1111-4111-8111-111111111111",
      alt: "现场截图",
    };
    const blocks = [
      { type: "paragraph" as const, text: "保留正文" },
      image,
      { type: "quote" as const, text: "保留引用" },
    ];

    expect(removeMaterialNoteImageBlock(blocks, 1)).toEqual([
      { type: "paragraph", text: "保留正文" },
      { type: "quote", text: "保留引用" },
    ]);
    expect(removeMaterialNoteImageBlock(blocks, 0)).toEqual(blocks);
  });

  test("富文本适配器忽略 Tiptap 不支持的 HTML、链接和 base64 图片", () => {
    expect(tiptapDocToMaterialNoteBlocks({
      type: "doc",
      content: [{
        type: "paragraph",
        content: [{ type: "text", text: "保留纯文本" }],
      }, {
        type: "image",
        attrs: { src: "data:image/png;base64,xxx", alt: "非法图片" },
      }, {
        type: "html",
        html: "<script />",
      }],
    })).toEqual([{ type: "paragraph", text: "保留纯文本" }]);
  });

  test("富文本编辑器支持粘贴和拖拽真实图片文件自动上传，不接收外链和 base64 图片", () => {
    const richEditor = read("components/douyin-miniapp/material-note-rich-editor.tsx");

    expect(richEditor).toContain("handlePaste");
    expect(richEditor).toContain("handleDrop");
    expect(richEditor).toContain("transformPastedHTML");
    expect(richEditor).toContain("removePastedImageTags");
    expect(richEditor).toContain("extractImageFiles");
    expect(richEditor).toContain("clipboardData?.items");
    expect(richEditor).toContain("dataTransfer?.items");
    expect(richEditor).toContain('item.type.startsWith("image/")');
    expect(richEditor).toContain("event.preventDefault()");
    expect(richEditor).toContain("if (moved) return false");
    expect(richEditor).toContain("void handleFiles(imageFiles)");
    expect(richEditor).toContain("posAtCoords");
    expect(richEditor).toContain("insertContentAt(insertAt, imageContents)");
    expect(richEditor).toContain("allowBase64: false");

    expect(removePastedImageTags('<p>保留文字</p><img src="https://example.com/a.png"><p>继续</p>'))
      .toBe("<p>保留文字</p><p>继续</p>");
    expect(removePastedImageTags('<img src="data:image/png;base64,xxx">').trim()).toBe("");
    expect(hasRetainedPasteContent({
      html: '<p><img src="https://example.com/a.png"></p>',
      plainText: "",
    })).toBe(false);
    expect(hasRetainedPasteContent({
      html: '<html><body><meta charset="utf-8"><img src="https://example.com/a.png"></body></html>',
      plainText: "",
    })).toBe(false);
    expect(hasRetainedPasteContent({
      html: '<p>保留文字</p><img src="https://example.com/a.png">',
      plainText: "",
    })).toBe(true);
    expect(hasRetainedPasteContent({
      html: "",
      plainText: "保留纯文本",
    })).toBe(true);
  });

  test("富文本图片块支持在正文中拖拽排序且不重新上传", () => {
    const richEditor = read("components/douyin-miniapp/material-note-rich-editor.tsx");
    const blocks = [
      { type: "paragraph" as const, text: "第一段" },
      {
        type: "image" as const,
        fileId: "11111111-1111-4111-8111-111111111111",
        alt: "现场图",
      },
      { type: "paragraph" as const, text: "第二段" },
    ];

    expect(richEditor).toContain("ReactNodeViewRenderer(MaterialImageNodeView)");
    expect(richEditor).toContain("NodeViewWrapper");
    expect(richEditor).toContain("data-drag-handle");
    expect(richEditor).toContain("deleteNode()");
    expect(richEditor).toContain('aria-label="删除当前图片"');
    expect(richEditor).toContain("GripVertical");
    expect(richEditor).toContain('aria-label="拖动图片调整位置"');
    expect(richEditor).toContain("sticky top-0 z-20");
    expect(richEditor).toContain('draggable: true');
    expect(JSON.stringify(materialNoteBlocksToTiptapDoc(blocks))).toContain(
      "11111111-1111-4111-8111-111111111111",
    );
    expect(tiptapDocToMaterialNoteBlocks(materialNoteBlocksToTiptapDoc([
      blocks[0],
      blocks[2],
      blocks[1],
    ]))).toEqual([
      blocks[0],
      blocks[2],
      blocks[1],
    ]);
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
    expect(detailPage).not.toContain("assertMaterialNoteRequestedPage");
  });

  test("新建资料页在后台固定视口内提供纵向滚动容器", () => {
    const newPage = read("app/(console)/douyin-miniapp/materials/new/page.tsx");

    expect(newPage).toContain("h-[calc(100vh-6.5625rem)]");
    expect(newPage).toContain("min-h-0 flex-col overflow-y-auto");
    expect(newPage).toContain("[scrollbar-gutter:stable]");
    expect(newPage).toContain("<MaterialNoteEditor canManage />");
  });

  test("列表提供 URL 筛选分页、聚合列和稳定状态", () => {
    const table = read("components/douyin-miniapp/material-note-table.tsx");
    const loading = read("app/(console)/douyin-miniapp/materials/loading.tsx");
    expect(table).toContain("keyword");
    expect(table).toContain("status");
    expect(table).toContain("pageSize");
    expect(table).toContain("router.push");
    expect(table).toContain("FieldGroup");
    expect(table).toContain("FieldLabel");
    expect(table).toContain("claim_count");
    expect(table).toContain("current_version");
    expect(table).toContain("initialError");
    expect(table).toContain("Empty");
    expect(table).toContain("Skeleton");
    expect(loading).toContain("Skeleton");
    expect(loading).toContain("正在加载资料列表");
  });

  test("编辑页默认读取最新正文，保存修改仍创建内部新版本", () => {
    const editor = read("components/douyin-miniapp/material-note-editor.tsx");
    const richEditor = read("components/douyin-miniapp/material-note-rich-editor.tsx");
    const detail = read("components/douyin-miniapp/material-note-detail.tsx");
    expect(editor).toContain("MATERIAL_NOTE_ALLOWED_BLOCK_TYPES");
    expect(editor).toContain("appendMaterialNoteVersion");
    expect(editor).toContain("createMaterialNote");
    expect(editor).toContain("MaterialNoteRichEditor");
    expect(editor).toContain("onUploadStateChange");
    expect(editor).toContain("保存修改");
    expect(editor).toContain("创建资料");
    expect(editor).not.toContain("保存新版本");
    expect(editor).not.toContain("创建资料和版本 1");
    expect(editor).not.toContain("新版本 v");
    expect(richEditor).toContain("buildMaterialNoteImagePreviewUrl");
    expect(richEditor).toContain("removeMaterialNoteImageBlock");
    expect(richEditor).toContain("删除图片");
    expect(editor).toContain("list-decimal");
    expect(editor).toContain("list-disc");
    expect(detail).toContain("getMaterialNoteVersion");
    expect(detail).toContain("currentVersionId");
    expect(detail).toContain("content_blocks");
    expect(detail).toContain("currentVersionDetail");
  });

  test("详情页在后台固定视口内提供唯一纵向滚动区域", () => {
    const detail = read("components/douyin-miniapp/material-note-detail.tsx");
    expect(detail).toContain(
      'className="flex h-full min-h-0 flex-col gap-5 overflow-y-auto pb-6 pr-1 [scrollbar-gutter:stable]"',
    );
  });

  test("编辑器按字段路径映射中文错误并关联可访问属性", () => {
    const result = validateMaterialNoteEditorDraft({
      title: "",
      summary: "",
      category: "",
      applicable_to: null,
      content_blocks: [{ type: "paragraph", text: "" }],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.fieldErrors).toEqual({
        title: "请输入 1～300 个字符的资料标题",
        summary: "请输入 1～1000 个字符的资料摘要",
        category: "请输入 1～100 个字符的资料分类",
        content_blocks: "请检查正文内容块，确保必填内容完整且格式有效",
      });
    }

    const editor = read("components/douyin-miniapp/material-note-editor.tsx");
    const actions = read("components/douyin-miniapp/material-note-actions.tsx");
    for (const field of ["title", "summary", "category", "blocks"]) {
      expect(editor).toContain(`material-${field}-error`);
    }
    expect(editor).toContain("data-invalid");
    expect(editor).toContain("aria-invalid");
    expect(editor).toContain("aria-describedby");
    expect(editor).toContain("aria-required");
    expect(actions).toContain("required");
    expect(actions).toContain("aria-required");
    expect(actions).toContain("aria-describedby");
  });

  test("编辑器使用资料分类选择器并隐藏适用场景输入", () => {
    const editor = read("components/douyin-miniapp/material-note-editor.tsx");
    const categorySelect = read("components/douyin-miniapp/material-note-category-select.tsx");
    const api = read("components/douyin-miniapp/material-note-api.ts");

    expect(editor).toContain("MaterialNoteCategorySelect");
    expect(editor).not.toContain("material-applicable");
    expect(editor).not.toContain("适用场景");
    expect(categorySelect).toContain("listMaterialNoteCategories");
    expect(categorySelect).toContain("createMaterialNoteCategory");
    expect(categorySelect).toContain("新建分类");
    expect(api).toContain("/tenant/douyin-material-note-categories");
  });

  test("发布当前内容；归档与不可恢复撤回使用不同确认和原因", () => {
    const actions = read("components/douyin-miniapp/material-note-actions.tsx");
    expect(actions).toContain("createMaterialNoteCommandRequest");
    expect(actions).toContain("executeMaterialNoteCommand");
    expect(actions).toContain("retryRequest");
    expect(actions).toContain("versionId");
    expect(actions).toContain("发布当前内容");
    expect(actions).toContain("归档资料");
    expect(actions).toContain("永久撤回资料");
    expect(actions).toContain("撤回后不能恢复");
    expect(actions).toContain("撤回原因不能为空");
  });

  test("详情页隐藏版本列表，只围绕当前内容编辑和发布", () => {
    const detail = read("components/douyin-miniapp/material-note-detail.tsx");
    const detailPage = read("app/(console)/douyin-miniapp/materials/[id]/page.tsx");

    for (const text of ["不可变版本", "版本历史", "TableHeader", "TableRow", "selectedVersion"]) {
      expect(detail).not.toContain(text);
    }
    expect(detailPage).not.toContain("/versions?page=1");
    expect(detailPage).not.toContain("parseMaterialNoteVersionList");
    expect(detail).toContain("当前内容");
    expect(detail).toContain("MaterialNoteActionDialog");
    expect(detail).toContain("versionId={currentVersionDetail.id}");
    expect(detail).not.toContain("versionNumber=");
  });

  test("当前内容已发布时隐藏重复发布动作，最新内容未发布时保留发布动作", () => {
    const publishedVersionId = "11111111-1111-4111-8111-111111111111";
    const latestVersionId = "22222222-2222-4222-8222-222222222222";

    expect(resolveCurrentMaterialNoteActions({
      status: "published",
      currentVersionId: publishedVersionId,
      publishedVersionId,
      canPublish: true,
    })).toEqual(["archive", "withdraw"]);
    expect(resolveCurrentMaterialNoteActions({
      status: "published",
      currentVersionId: latestVersionId,
      publishedVersionId,
      canPublish: true,
    })).toEqual(["publish", "archive", "withdraw"]);
    expect(resolveCurrentMaterialNoteActions({
      status: "published",
      currentVersionId: latestVersionId,
      publishedVersionId,
      canPublish: false,
    })).toEqual([]);
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
