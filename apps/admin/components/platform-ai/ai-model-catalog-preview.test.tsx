import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "bun:test";
import { AiModelCatalogPreview } from "./ai-model-catalog-preview";
import type { AiCatalogEntryRecord, PageData } from "./ai-config-types";

const entries: PageData<AiCatalogEntryRecord> = {
  list: [{
    id: "11111111-1111-4111-8111-111111111111",
    run_id: "22222222-2222-4222-8222-222222222222",
    entry_position: 1,
    external_model_id: "openrouter/text-model",
    model_name: "Text Model",
    modality: "text",
    change_type: "new",
    current_model_id: null,
    current_model_version: null,
    raw_price_projection: { prompt: "0.1" },
    apply_status: "eligible",
    apply_block_code: null,
    catalog_hash: "a".repeat(64),
  }, {
    id: "33333333-3333-4333-8333-333333333333",
    run_id: "22222222-2222-4222-8222-222222222222",
    entry_position: 2,
    external_model_id: "openrouter/image-model",
    model_name: "Image Model",
    modality: "image",
    change_type: "changed",
    current_model_id: "44444444-4444-4444-8444-444444444444",
    current_model_version: 2,
    raw_price_projection: {},
    apply_status: "blocked",
    apply_block_code: "CAPABILITY_METADATA_INCOMPLETE",
    catalog_hash: "b".repeat(64),
  }],
  pagination: { page: 1, pageSize: 20, total: 2, totalPages: 1 },
};

describe("AiModelCatalogPreview", () => {
  test("renders classified toolbar, friendly modality labels and blocked rows", () => {
    const html = renderToStaticMarkup(createElement(AiModelCatalogPreview, {
      entries,
      filters: { keyword: "", modality: "all", changeType: "all" },
      selectedEntries: ["11111111-1111-4111-8111-111111111111"],
      pending: false,
      applying: false,
      onApplySelected: () => undefined,
      onToggleEntry: () => undefined,
      onFiltersChange: () => undefined,
      onPageChange: () => undefined,
    }));

    expect(html).toContain("OpenRouter 多模态目录");
    expect(html).toContain("搜索模型名称或 OpenRouter ID");
    expect(html).toContain("全部");
    expect(html).toContain("文本");
    expect(html).toContain("图片生成");
    expect(html).toContain("视频生成");
    expect(html).toContain("语音生成");
    expect(html).toContain("功能");
    expect(html).toContain("能力信息不足，暂不可应用");
    expect(html).toContain("disabled");
    expect(html).not.toContain(">image<");
  });

  test("keeps modality, change and apply status columns scannable", () => {
    const html = renderToStaticMarkup(createElement(AiModelCatalogPreview, {
      entries,
      filters: { keyword: "", modality: "all", changeType: "all" },
      selectedEntries: [],
      pending: false,
      applying: false,
      onApplySelected: () => undefined,
      onToggleEntry: () => undefined,
      onFiltersChange: () => undefined,
      onPageChange: () => undefined,
    }));

    expect(html).toContain("w-[120px] whitespace-nowrap");
    expect(html).toContain("w-[240px] whitespace-nowrap");
    expect(html).toContain("inline-flex whitespace-nowrap");
    expect(html).toContain("max-w-[360px] whitespace-normal break-words");
  });

  test("uses a distinct empty state when filters produce no rows", () => {
    const html = renderToStaticMarkup(createElement(AiModelCatalogPreview, {
      entries: { list: [], pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 } },
      filters: { keyword: "flux", modality: "image", changeType: "all" },
      selectedEntries: [],
      pending: false,
      applying: false,
      onApplySelected: () => undefined,
      onToggleEntry: () => undefined,
      onFiltersChange: () => undefined,
      onPageChange: () => undefined,
    }));

    expect(html).toContain("没有符合筛选条件的模型");
    expect(html).not.toContain("暂无目录条目");
  });
});
