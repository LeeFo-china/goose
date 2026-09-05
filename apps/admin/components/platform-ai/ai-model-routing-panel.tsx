"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type {
  AiProviderRecord,
  AiRouteModelOptionRecord,
  AiSceneRouteRecord,
  PageData,
} from "@/components/platform-ai/ai-config-types";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AiModelRouteTab } from "@/components/platform-ai/ai-model-route-tab";
import { ProviderFormCard, ProviderTable } from "@/components/platform-ai/ai-model-routing-sections";
import {
  emptyProviderForm,
  emptyRouteForm,
  NONE_VALUE,
  providerFormFromRecord,
  requestBackend,
  routeModelOptionFromModel,
  type ProviderFormState,
  type RouteFormState,
} from "@/components/platform-ai/ai-model-routing-shared";

const emptyRouteOptionPage = (): PageData<AiRouteModelOptionRecord> => ({
  list: [],
  pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
});

export function AiModelRoutingPanel({
  providerPage: initialProviderPage,
  routePage: initialRoutePage,
  providerOptions: initialProviderOptions,
}: {
  providerPage: PageData<AiProviderRecord>;
  routePage: PageData<AiSceneRouteRecord>;
  providerOptions: AiProviderRecord[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [providerPage, setProviderPage] = useState(initialProviderPage);
  const [routePage, setRoutePage] = useState(initialRoutePage);
  const [providerOptions, setProviderOptions] = useState(initialProviderOptions);
  const [primaryOptions, setPrimaryOptions] = useState<PageData<AiRouteModelOptionRecord>>(emptyRouteOptionPage());
  const [fallbackOptions, setFallbackOptions] = useState<PageData<AiRouteModelOptionRecord>>(emptyRouteOptionPage());
  const [providerLoading, setProviderLoading] = useState(false);
  const [routeLoading, setRouteLoading] = useState(false);
  const [providerForm, setProviderForm] = useState<ProviderFormState>(emptyProviderForm());
  const initialProviderId = initialProviderOptions[0]?.id || initialProviderPage.list[0]?.id || "";
  const [routeForm, setRouteForm] = useState<RouteFormState>(emptyRouteForm(initialProviderId));

  function refresh() {
    startTransition(() => router.refresh());
  }

  async function loadProviderPage(page: number) {
    setProviderLoading(true);
    try {
      setProviderPage(await requestBackend<PageData<AiProviderRecord>>(
        `/platform/ai-config/providers?page=${page}&pageSize=20`,
      ));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "供应商列表加载失败");
    } finally {
      setProviderLoading(false);
    }
  }

  async function loadProviderOptions() {
    try {
      const response = await requestBackend<PageData<AiProviderRecord>>(
        "/platform/ai-config/providers?page=1&pageSize=100",
      );
      setProviderOptions(response.list);
      return response.list;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "供应商选项加载失败");
      return providerOptions;
    }
  }

  async function loadRoutePage(page: number) {
    setRouteLoading(true);
    try {
      setRoutePage(await requestBackend<PageData<AiSceneRouteRecord>>(
        `/platform/ai-config/routes?page=${page}&pageSize=20`,
      ));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "场景路由列表加载失败");
    } finally {
      setRouteLoading(false);
    }
  }

  async function reloadProviderState() {
    await Promise.all([
      loadProviderPage(providerPage.pagination.page),
      loadProviderOptions(),
    ]);
  }

  async function reloadRouteState() {
    await loadRoutePage(routePage.pagination.page);
  }

  async function loadRouteModelOptions(target: "primary" | "fallback", providerId: string, keyword: string) {
    if (!providerId) {
      if (target === "primary") setPrimaryOptions(emptyRouteOptionPage());
      else setFallbackOptions(emptyRouteOptionPage());
      return;
    }

    const params = new URLSearchParams({
      page: "1",
      pageSize: "20",
      modality: routeForm.modality,
    });
    if (keyword.trim()) params.set("keyword", keyword.trim());
    try {
      const response = await requestBackend<PageData<AiRouteModelOptionRecord>>(
        `/platform/ai-config/providers/${providerId}/route-model-options?${params.toString()}`,
      );
      if (target === "primary") setPrimaryOptions(response);
      else setFallbackOptions(response);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "模型候选加载失败");
    }
  }

  async function submitProvider() {
    const payload = {
      name: providerForm.name,
      provider_type: providerForm.provider_type,
      endpoint_url: providerForm.endpoint_url || null,
      api_key_setting_key: providerForm.api_key_setting_key || null,
      status: providerForm.status,
      sort_order: Number(providerForm.sort_order || 0),
      ...(providerForm.id ? { expected_version: providerForm.version ?? 1 } : {}),
    };
    await requestBackend(
      providerForm.id
        ? `/platform/ai-config/providers/${providerForm.id}`
        : "/platform/ai-config/providers",
      {
        method: providerForm.id ? "PATCH" : "POST",
        body: JSON.stringify(payload),
      },
    );
    toast.success(providerForm.id ? "供应商已更新" : "供应商已创建");
    setProviderForm(emptyProviderForm());
    await reloadProviderState();
    refresh();
  }

  async function resolveSelectedRouteModel(target: "primary" | "fallback") {
    const providerId = target === "primary" ? routeForm.primary_provider_id : routeForm.fallback_provider_id;
    const optionValue = target === "primary" ? routeForm.primary_option_value : routeForm.fallback_option_value;
    const currentModelId = target === "primary" ? routeForm.primary_model_id : routeForm.fallback_model_id;
    const options = target === "primary" ? primaryOptions.list : fallbackOptions.list;

    if (target === "fallback" && optionValue === NONE_VALUE) return null;
    if (!optionValue) return currentModelId && currentModelId !== NONE_VALUE ? currentModelId : null;

    const option = options.find((item) => item.value === optionValue);
    if (!option) return optionValue === currentModelId ? currentModelId : null;
    if (option.source === "internal") return option.model_id || option.value;
    if (option.model_id) return option.model_id;
    if (!providerId) return null;

    const response = await requestBackend<{ model_id: string }>(
      `/platform/ai-config/providers/${providerId}/route-model-options:resolve`,
      {
        method: "POST",
        body: JSON.stringify(option.source === "manual"
          ? { source: "manual", model_name: option.label, modality: "text" }
          : { source: "catalog", value: option.value }),
      },
    );
    return response.model_id;
  }

  async function submitRoute() {
    const [primaryModelId, fallbackModelId] = await Promise.all([
      resolveSelectedRouteModel("primary"),
      resolveSelectedRouteModel("fallback"),
    ]);
    const payload = {
      scene_code: routeForm.scene_code,
      name: routeForm.name,
      primary_model_id: primaryModelId,
      quality_tier: routeForm.quality_tier,
      modality: routeForm.modality,
      fallback_model_id: fallbackModelId,
      temperature: routeForm.temperature ? Number(routeForm.temperature) : null,
      response_format: routeForm.response_format,
      timeout_ms: routeForm.timeout_ms ? Number(routeForm.timeout_ms) : null,
      status: routeForm.status,
      ...(routeForm.id ? { expected_version: routeForm.version ?? 1 } : {}),
    };
    await requestBackend(
      routeForm.id ? `/platform/ai-config/routes/${routeForm.id}` : "/platform/ai-config/routes",
      {
        method: routeForm.id ? "PATCH" : "POST",
        body: JSON.stringify(payload),
      },
    );
    toast.success(routeForm.id ? "场景路由已更新" : "场景路由已创建");
    setRouteForm(emptyRouteForm(providerOptions[0]?.id || ""));
    setPrimaryOptions(emptyRouteOptionPage());
    setFallbackOptions(emptyRouteOptionPage());
    await reloadRouteState();
    refresh();
  }

  function editProvider(item: AiProviderRecord) {
    setProviderForm(providerFormFromRecord(item));
  }

  function editRoute(item: AiSceneRouteRecord) {
    const primaryProviderId = item.primary_model?.provider_id || providerOptions[0]?.id || "";
    const fallbackProviderId = item.fallback_model?.provider_id || primaryProviderId;
    setRouteForm({
      id: item.id,
      version: item.version ?? 1,
      scene_code: item.scene_code,
      name: item.name,
      primary_model_id: item.primary_model_id || "",
      primary_provider_id: primaryProviderId,
      primary_keyword: "",
      primary_option_value: item.primary_model_id || "",
      fallback_model_id: item.fallback_model_id || NONE_VALUE,
      fallback_provider_id: fallbackProviderId,
      fallback_keyword: "",
      fallback_option_value: item.fallback_model_id || NONE_VALUE,
      temperature: item.temperature == null ? "" : String(item.temperature),
      response_format: item.response_format || "json_object",
      timeout_ms: item.timeout_ms == null ? "" : String(item.timeout_ms),
      status: item.status,
      quality_tier: item.quality_tier || "balanced",
      modality: item.modality || "text",
    });
    setPrimaryOptions(item.primary_model
      ? { list: [routeModelOptionFromModel(item.primary_model)], pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 } }
      : emptyRouteOptionPage());
    setFallbackOptions(item.fallback_model
      ? { list: [routeModelOptionFromModel(item.fallback_model)], pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 } }
      : emptyRouteOptionPage());
  }

  return (
    <Tabs defaultValue="routes" className="flex min-h-0 flex-1 flex-col gap-4">
      <TabsList className="w-fit shrink-0">
        <TabsTrigger value="routes">场景路由</TabsTrigger>
        <TabsTrigger value="providers">供应商</TabsTrigger>
      </TabsList>

      <TabsContent value="routes" className="m-0 min-h-0 flex-1 overflow-hidden">
        <AiModelRouteTab
          routePage={routePage}
          providers={providerOptions}
          primaryOptions={primaryOptions}
          fallbackOptions={fallbackOptions}
          routeForm={routeForm}
          isPending={isPending}
          isRouteLoading={routeLoading}
          onRouteFormChange={setRouteForm}
          onRouteSubmit={submitRoute}
          onRouteEdit={editRoute}
          onRoutePageChange={(page) => void loadRoutePage(page)}
          onModelSearch={loadRouteModelOptions}
        />
      </TabsContent>

      <TabsContent value="providers" className="m-0 min-h-0 flex-1 overflow-hidden">
        <div className="grid h-full min-h-0 gap-4 overflow-auto xl:grid-cols-[360px_minmax(0,1fr)] xl:overflow-hidden">
          <ProviderFormCard
            form={providerForm}
            isPending={isPending}
            onChange={setProviderForm}
            onSubmit={submitProvider}
            onReset={() => setProviderForm(emptyProviderForm())}
          />
          <ProviderTable
            page={providerPage}
            pending={providerLoading}
            onEdit={editProvider}
            onPageChange={(page) => void loadProviderPage(page)}
          />
        </div>
      </TabsContent>
    </Tabs>
  );
}
