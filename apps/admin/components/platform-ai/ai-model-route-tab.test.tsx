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
      scenes: { list: [], pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 } },
      sceneLoadError: null,
      sceneLoading: false,
      primaryOptions: { data: { list: [], pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 } }, loading: false, error: null, selected: null },
      fallbackOptions: { data: { list: [], pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 } }, loading: false, error: null, selected: null },
      routeForm: emptyRouteForm(provider.id),
      selectedScene: null,
      isPending: false,
      isRouteLoading: false,
      isRouteSaving: false,
      canManageRoutes: true,
      onRouteFormChange: () => undefined,
      onSceneChange: () => undefined,
      onSceneRetry: () => undefined,
      onRouteSubmit: async () => undefined,
      onRouteReset: () => undefined,
      onRouteEdit: () => undefined,
      onRoutePageChange: () => undefined,
      onProviderChange: () => undefined,
      onKeywordChange: () => undefined,
      onModelSearch: () => undefined,
      onModelSelect: () => undefined,
    }));

    expect(html).toContain("主模型供应商");
    expect(html).toContain("搜索主模型");
    expect(html).not.toContain("OpenRouter 目录");
    expect(html).not.toContain("模型编码");
  });
});
