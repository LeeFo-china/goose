"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { AiCatalogEntryRecord, AiCatalogRunRecord, AiConfigData, AiModelRecord, AiProviderRecord, AiSceneRouteRecord, PageData } from "@/components/platform-ai/ai-config-types";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AiModelCatalogTab } from "@/components/platform-ai/ai-model-catalog-tab";
import { AiModelRouteTab } from "@/components/platform-ai/ai-model-route-tab";
import { ModelFormCard, ModelTable, ProviderFormCard, ProviderTable } from "@/components/platform-ai/ai-model-routing-sections";
import { emptyModelForm, emptyProviderForm, emptyRouteForm, NONE_VALUE, requestBackend, type ModelFormState, type ProviderFormState, type RouteFormState } from "@/components/platform-ai/ai-model-routing-shared";

export function AiModelRoutingPanel({
  data,
  providerPage: initialProviderPage,
  modelPage: initialModelPage,
  routePage: initialRoutePage,
  providerOptions: initialProviderOptions,
  modelOptions: initialModelOptions,
  catalogRuns,
  catalogEntries,
}: {
  data: AiConfigData;
  providerPage: PageData<AiProviderRecord>;
  modelPage: PageData<AiModelRecord>;
  routePage: PageData<AiSceneRouteRecord>;
  providerOptions: AiProviderRecord[];
  modelOptions: AiModelRecord[];
  catalogRuns: PageData<AiCatalogRunRecord>;
  catalogEntries: PageData<AiCatalogEntryRecord>;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [providerPage, setProviderPage] = useState(initialProviderPage);
  const [modelPage, setModelPage] = useState(initialModelPage);
  const [routePage, setRoutePage] = useState(initialRoutePage);
  const [providerOptions, setProviderOptions] = useState(initialProviderOptions);
  const [modelOptions, setModelOptions] = useState(initialModelOptions);
  const [providerLoading, setProviderLoading] = useState(false);
  const [modelLoading, setModelLoading] = useState(false);
  const [routeLoading, setRouteLoading] = useState(false);
  const [providerForm, setProviderForm] = useState<ProviderFormState>(emptyProviderForm());
  const [modelForm, setModelForm] = useState<ModelFormState>(
    emptyModelForm(initialProviderOptions[0]?.id || initialProviderPage.list[0]?.id || ""),
  );
  const [routeForm, setRouteForm] = useState<RouteFormState>(
    emptyRouteForm(initialModelOptions[0]?.id || initialModelPage.list[0]?.id || ""),
  );

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

  async function loadModelPage(page: number) {
    setModelLoading(true);
    try {
      setModelPage(await requestBackend<PageData<AiModelRecord>>(
        `/platform/ai-config/models?page=${page}&pageSize=20`,
      ));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "模型列表加载失败");
    } finally {
      setModelLoading(false);
    }
  }

  async function loadModelOptions() {
    try {
      const response = await requestBackend<PageData<AiModelRecord>>(
        "/platform/ai-config/models?page=1&pageSize=100",
      );
      setModelOptions(response.list);
      return response.list;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "模型选项加载失败");
      return modelOptions;
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

  async function reloadModelState() {
    const [, nextOptions] = await Promise.all([
      loadModelPage(modelPage.pagination.page),
      loadModelOptions(),
    ]);
    return nextOptions;
  }

  async function reloadRouteState() {
    await loadRoutePage(routePage.pagination.page);
  }

  async function submitProvider() {
    const payload = {
      code: providerForm.code,
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

  async function submitModel() {
    const payload = {
      provider_id: modelForm.provider_id,
      code: modelForm.code,
      name: modelForm.name,
      model_name: modelForm.model_name,
      status: modelForm.status,
      sort_order: Number(modelForm.sort_order || 0),
      ...(modelForm.id ? { expected_version: modelForm.version ?? 1 } : {}),
    };
    await requestBackend(
      modelForm.id ? `/platform/ai-config/models/${modelForm.id}` : "/platform/ai-config/models",
      {
        method: modelForm.id ? "PATCH" : "POST",
        body: JSON.stringify(payload),
      },
    );
    toast.success(modelForm.id ? "模型已更新" : "模型已创建");
    const nextModelOptions = await reloadModelState();
    setModelForm(emptyModelForm(providerOptions[0]?.id || ""));
    if (!routeForm.primary_model_id && nextModelOptions[0]?.id) {
      setRouteForm(emptyRouteForm(nextModelOptions[0].id));
    }
    refresh();
  }

  async function submitRoute() {
    const payload = {
      scene_code: routeForm.scene_code,
      name: routeForm.name,
      primary_model_id: routeForm.primary_model_id || null,
      quality_tier: routeForm.quality_tier,
      modality: routeForm.modality,
      fallback_model_id: routeForm.fallback_model_id === NONE_VALUE ? null : routeForm.fallback_model_id,
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
    setRouteForm(emptyRouteForm(modelOptions[0]?.id || ""));
    await reloadRouteState();
    refresh();
  }

  function editProvider(item: AiProviderRecord) {
    setProviderForm({
      id: item.id,
      version: item.version ?? 1,
      code: item.code,
      name: item.name,
      provider_type: item.provider_type === "openrouter" ? "openrouter" : "openai_compatible",
      endpoint_url: item.endpoint_url || "",
      api_key_setting_key: item.api_key_setting_key || "",
      status: item.status,
      sort_order: String(item.sort_order ?? 0),
    });
  }

  function editModel(item: AiModelRecord) {
    setModelForm({
      id: item.id,
      version: item.version ?? 1,
      provider_id: item.provider_id,
      code: item.code,
      name: item.name,
      model_name: item.model_name,
      status: item.status,
      sort_order: String(item.sort_order ?? 0),
    });
  }

  function editRoute(item: AiSceneRouteRecord) {
    setRouteForm({
      id: item.id,
      version: item.version ?? 1,
      scene_code: item.scene_code,
      name: item.name,
      primary_model_id: item.primary_model_id || "",
      fallback_model_id: item.fallback_model_id || NONE_VALUE,
      temperature: item.temperature == null ? "" : String(item.temperature),
      response_format: item.response_format || "json_object",
      timeout_ms: item.timeout_ms == null ? "" : String(item.timeout_ms),
      status: item.status,
      quality_tier: item.quality_tier || "balanced",
      modality: item.modality || "text",
    });
  }

  return (
    <Tabs defaultValue="routes" className="flex min-h-0 flex-1 flex-col gap-4">
      <TabsList className="w-fit shrink-0">
        <TabsTrigger value="routes">场景路由</TabsTrigger>
        <TabsTrigger value="catalog">OpenRouter 目录</TabsTrigger>
        <TabsTrigger value="models">模型</TabsTrigger>
        <TabsTrigger value="providers">供应商</TabsTrigger>
      </TabsList>

      <TabsContent value="routes" className="m-0 min-h-0 flex-1 overflow-hidden">
        <AiModelRouteTab
          routePage={routePage}
          models={modelOptions}
          routeForm={routeForm}
          isPending={isPending}
          isRouteLoading={routeLoading}
          onRouteFormChange={setRouteForm}
          onRouteSubmit={submitRoute}
          onRouteEdit={editRoute}
          onRoutePageChange={(page) => void loadRoutePage(page)}
        />
      </TabsContent>

      <TabsContent value="catalog" className="m-0 min-h-0 flex-1 overflow-hidden">
        <AiModelCatalogTab
          providers={providerOptions}
          models={modelOptions}
          credits={data.credits}
          usageSummary={data.usage_summary}
          runs={catalogRuns}
          entries={catalogEntries}
        />
      </TabsContent>

      <TabsContent value="models" className="m-0 min-h-0 flex-1 overflow-hidden">
        <div className="grid h-full min-h-0 gap-4 overflow-auto xl:grid-cols-[360px_minmax(0,1fr)] xl:overflow-hidden">
          <ModelFormCard
            form={modelForm}
            providers={providerOptions}
            isPending={isPending}
            onChange={setModelForm}
            onSubmit={submitModel}
            onReset={() => setModelForm(emptyModelForm(providerOptions[0]?.id || ""))}
          />
          <ModelTable
            page={modelPage}
            pending={modelLoading}
            onEdit={editModel}
            onPageChange={(page) => void loadModelPage(page)}
          />
        </div>
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
