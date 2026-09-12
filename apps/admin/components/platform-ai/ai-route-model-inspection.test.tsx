import { createElement, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "bun:test";
import { AiModelRouteTab } from "./ai-model-route-tab";
import { emptyRouteForm } from "./ai-model-routing-shared";

test("disconnected scenes expose registered model information and enabled browsing without selection", () => {
  const data = { list: [], pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 } };
  const option = { source: "internal" as const, value: "model", provider_id: "provider", label: "Registered text",
    description: "text-call-id", modality: "text" as const, status: "inactive", input_modalities: ["text"], probe_status: "unverified" as const };
  const props: ComponentProps<typeof AiModelRouteTab> = {
    routePage: data, scenes: data, sceneLoadError: null, sceneLoading: false,
    providers: [{ id: "provider", name: "方舟", code: "ark", provider_type: "openai_compatible", endpoint_url: null,
      api_key_setting_key: null, status: "active", sort_order: 0, created_at: "", updated_at: "" }],
    primaryOptions: { data: { ...data, list: [option] }, selected: null, loading: false, error: null },
    fallbackOptions: { data, selected: null, loading: false, error: null },
    routeForm: { ...emptyRouteForm("provider"), modality: "image" },
    selectedScene: { code: "decoration_raw_drawing", name: "装修生图", modality: "image", required_input_modalities: ["text", "image"],
      runtime_status: "not_connected", requirements_source: "planned_adapter", requires_streaming: false, min_reference_images: 2,
      source: "system", allow_new_configuration: true },
    isPending: false, isRouteLoading: false, isRouteSaving: false, canManageRoutes: true,
    onRouteFormChange: () => {}, onSceneChange: () => {}, onSceneRetry: () => {}, onRouteSubmit: async () => {},
    onRouteReset: () => {}, onRouteEdit: () => {}, onRoutePageChange: () => {}, onProviderChange: () => {},
    onKeywordChange: () => {}, onModelSearch: () => {}, onModelSelect: () => {},
  };
  const html = renderToStaticMarkup(createElement(AiModelRouteTab, props));
  expect(html.match(/<button[^>]*id="ai-route-primary-provider"[^>]*>/)?.[0]).not.toContain('disabled=""');
  expect(html).toContain("尚未绑定主模型");
  expect(html).toContain("Registered text");
  expect(html).toContain("text-call-id");
  expect(html).toContain("已登记输出模态");
  expect(html).toContain("已登记输入模态");
  expect(html).toContain("能力待核实");
  expect(html).toContain("文本模型不匹配图片场景");
  expect(html).toContain("模型已停用");
  expect(html).toContain("非厂商完整目录");
  expect(html).not.toContain('id="ai-route-primary-model"');
});
