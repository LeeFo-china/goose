import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "bun:test";
import { AiModelCatalogTab, changeTypeLabel } from "./ai-model-catalog-tab";
import type { AiCatalogEntryRecord, AiCatalogRunRecord, AiModelRecord, AiProviderRecord, PageData } from "./ai-config-types";

const provider: AiProviderRecord = {
  id: "11111111-1111-4111-8111-111111111111",
  code: "openrouter",
  name: "OpenRouter",
  provider_type: "openrouter",
  endpoint_url: "https://openrouter.ai/api/v1",
  api_key_setting_key: "OPENROUTER_API_KEY",
  status: "active",
  sort_order: 0,
  created_at: "2026-09-01T00:00:00.000Z",
  updated_at: "2026-09-01T00:00:00.000Z",
};

const runs: PageData<AiCatalogRunRecord> = {
  list: [{
    id: "22222222-2222-4222-8222-222222222222",
    provider_id: provider.id,
    source_endpoint: "https://openrouter.ai/api/v1/models",
    catalog_hash: "a".repeat(64),
    run_status: "preview",
    model_count: 3,
    summary_payload: { total: 3, new: 1, changed: 1, removed: 1, unchanged: 0 },
    created_at: "2026-09-01T00:00:00.000Z",
  }],
  pagination: { page: 1, pageSize: 20, total: 60, totalPages: 3 },
};

const models: AiModelRecord[] = [
  {
    id: "44444444-4444-4444-8444-444444444444",
    provider_id: provider.id,
    code: "openrouter.gpt",
    name: "GPT",
    model_name: "openai/gpt",
    modality: "text",
    input_modalities: ["text"],
    probe_status: "eligible",
    version: 1,
    current_price_snapshot_id: null,
    status: "active",
    sort_order: 0,
    created_at: "2026-09-01T00:00:00.000Z",
    updated_at: "2026-09-01T00:00:00.000Z",
    provider,
  },
  {
    id: "55555555-5555-4555-8555-555555555555",
    provider_id: provider.id,
    code: "openrouter.unknown",
    name: "Unknown",
    model_name: "openrouter/unknown",
    modality: "text",
    input_modalities: ["text"],
    probe_status: "stale",
    version: 1,
    current_price_snapshot_id: null,
    status: "active",
    sort_order: 1,
    created_at: "2026-09-01T00:00:00.000Z",
    updated_at: "2026-09-01T00:00:00.000Z",
    provider,
  },
];

const entries: PageData<AiCatalogEntryRecord> = {
  list: ["new", "changed", "removed", "unchanged"].map((changeType, index) => ({
    id: `${index}2222222-2222-4222-8222-222222222222`,
    run_id: runs.list[0]!.id,
    entry_position: index,
    external_model_id: `openrouter/model-${index}`,
    model_name: `模型 ${index}`,
    modality: "text",
    change_type: changeType,
    current_model_id: null,
    current_model_version: null,
    raw_price_projection: { prompt: "0.1", completion: "0.2" },
    catalog_hash: "b".repeat(64),
  })),
  pagination: { page: 1, pageSize: 20, total: 44, totalPages: 3 },
};

describe("AiModelCatalogTab", () => {
  test("renders preview states, OpenRouter actions and warning copy without leaking keys", () => {
    const html = renderToStaticMarkup(createElement(AiModelCatalogTab, {
      providers: [provider],
      models,
      runs,
      entries,
      credits: { total_credits: 10, total_usage: 3 },
    }));

    expect(html).toContain("同步 OpenRouter 模型");
    expect(html).toContain("目录预览");
    expect(html).toContain("应用选中（最多 100）");
    expect(html).toContain("目录记录第 1 / 3 页");
    expect(html).toContain("条目第 1 / 3 页");
    expect(html).toContain("当前显示 4 条，共 44 条");
    expect(html).toContain("价格快照");
    expect(html).toContain("来源端点");
    expect(html).toContain("https://openrouter.ai/api/v1/models");
    expect(html).toContain("新增 1");
    expect(html).toContain("已变化 1");
    expect(html).toContain("已载入模型探针");
    expect(html).toContain("可用 1");
    expect(html).toContain("需复核 1");
    expect(html).toContain("OpenRouter 余额");
    expect(html).toContain("$10.0000");
    expect(html).toContain("$3.0000");
    expect(html).toContain("读取 OpenRouter 余额");
    expect(html).toContain("新增");
    expect(html).toContain("能力或价格变化");
    expect(html).toContain("已下架");
    expect(html).toContain("不会自动切换业务路由");
    expect(html).not.toContain("OPENROUTER_API_KEY");
    expect(html).not.toContain("secret");
  });

  test("maps catalog change labels defensively", () => {
    expect(changeTypeLabel("new")).toBe("新增");
    expect(changeTypeLabel("changed")).toBe("能力或价格变化");
    expect(changeTypeLabel("unexpected")).toBe("未知变化");
  });
});
