import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "bun:test";

import { AiModelRouteTab } from "./ai-model-route-tab";
import { emptyRouteForm } from "./ai-model-routing-shared";

describe("AiModelRouteTab simplified route form", () => {
  test("uses provider-first model selection and hides internal model IDs", () => {
    const provider = {
      id: "11111111-1111-4111-8111-111111111111",
      code: "openrouter",
      name: "OpenRouter",
      provider_type: "openrouter",
      endpoint_url: "https://openrouter.ai/api/v1",
      api_key_setting_key: "OPENROUTER_API_KEY",
      status: "active" as const,
      sort_order: 0,
      created_at: "2026-09-05T00:00:00.000Z",
      updated_at: "2026-09-05T00:00:00.000Z",
    };

    const html = renderToStaticMarkup(createElement(AiModelRouteTab, {
      routePage: { list: [], pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 } },
      providers: [provider],
      primaryOptions: { list: [], pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 } },
      fallbackOptions: { list: [], pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 } },
      routeForm: emptyRouteForm(provider.id),
      isPending: false,
      isRouteLoading: false,
      onRouteFormChange: () => undefined,
      onRouteSubmit: async () => undefined,
      onRouteEdit: () => undefined,
      onRoutePageChange: () => undefined,
      onModelSearch: async () => undefined,
    }));

    expect(html).toContain("选择供应商");
    expect(html).toContain("搜索模型");
    expect(html).not.toContain("OpenRouter 目录");
    expect(html).not.toContain("模型编码");
  });
});
