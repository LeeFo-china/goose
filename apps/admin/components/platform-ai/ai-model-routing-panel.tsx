"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { AiConfigData, AiModelRecord, AiProviderRecord, AiSceneRouteRecord } from "@/components/platform-ai/ai-config-types";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AiModelRouteTab } from "@/components/platform-ai/ai-model-route-tab";
import { countModelsByProvider, ModelFormCard, ModelTable, ProviderFormCard, ProviderTable } from "@/components/platform-ai/ai-model-routing-sections";
import { emptyModelForm, emptyProviderForm, emptyRouteForm, NONE_VALUE, requestBackend, type ModelFormState, type ProviderFormState, type RouteFormState } from "@/components/platform-ai/ai-model-routing-shared";

export function AiModelRoutingPanel({ data }: { data: AiConfigData }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [providerForm, setProviderForm] = useState<ProviderFormState>(emptyProviderForm());
  const [modelForm, setModelForm] = useState<ModelFormState>(
    emptyModelForm(data.providers[0]?.id || ""),
  );
  const [routeForm, setRouteForm] = useState<RouteFormState>(
    emptyRouteForm(data.models[0]?.id || ""),
  );

  function refresh() {
    startTransition(() => router.refresh());
  }

  async function submitProvider() {
    const payload = {
      code: providerForm.code,
      name: providerForm.name,
      provider_type: "openai_compatible",
      endpoint_url: providerForm.endpoint_url || null,
      api_key_setting_key: providerForm.api_key_setting_key || null,
      status: providerForm.status,
      sort_order: Number(providerForm.sort_order || 0),
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
    };
    await requestBackend(
      modelForm.id ? `/platform/ai-config/models/${modelForm.id}` : "/platform/ai-config/models",
      {
        method: modelForm.id ? "PATCH" : "POST",
        body: JSON.stringify(payload),
      },
    );
    toast.success(modelForm.id ? "模型已更新" : "模型已创建");
    setModelForm(emptyModelForm(data.providers[0]?.id || ""));
    refresh();
  }

  async function submitRoute() {
    const payload = {
      scene_code: routeForm.scene_code,
      name: routeForm.name,
      primary_model_id: routeForm.primary_model_id || null,
      fallback_model_id: routeForm.fallback_model_id === NONE_VALUE ? null : routeForm.fallback_model_id,
      temperature: routeForm.temperature ? Number(routeForm.temperature) : null,
      response_format: routeForm.response_format,
      timeout_ms: routeForm.timeout_ms ? Number(routeForm.timeout_ms) : null,
      status: routeForm.status,
    };
    await requestBackend(
      routeForm.id ? `/platform/ai-config/routes/${routeForm.id}` : "/platform/ai-config/routes",
      {
        method: routeForm.id ? "PATCH" : "POST",
        body: JSON.stringify(payload),
      },
    );
    toast.success(routeForm.id ? "场景路由已更新" : "场景路由已创建");
    setRouteForm(emptyRouteForm(data.models[0]?.id || ""));
    refresh();
  }

  function editProvider(item: AiProviderRecord) {
    setProviderForm({
      id: item.id,
      code: item.code,
      name: item.name,
      endpoint_url: item.endpoint_url || "",
      api_key_setting_key: item.api_key_setting_key || "",
      status: item.status,
      sort_order: String(item.sort_order ?? 0),
    });
  }

  function editModel(item: AiModelRecord) {
    setModelForm({
      id: item.id,
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
      scene_code: item.scene_code,
      name: item.name,
      primary_model_id: item.primary_model_id || "",
      fallback_model_id: item.fallback_model_id || NONE_VALUE,
      temperature: item.temperature == null ? "" : String(item.temperature),
      response_format: item.response_format || "json_object",
      timeout_ms: item.timeout_ms == null ? "" : String(item.timeout_ms),
      status: item.status,
    });
  }

  return (
    <Tabs defaultValue="routes" className="flex min-h-0 flex-1 flex-col gap-4">
      <TabsList className="w-fit shrink-0">
        <TabsTrigger value="routes">场景路由</TabsTrigger>
        <TabsTrigger value="models">模型</TabsTrigger>
        <TabsTrigger value="providers">供应商</TabsTrigger>
      </TabsList>

      <TabsContent value="routes" className="m-0 min-h-0 flex-1 overflow-hidden">
        <AiModelRouteTab
          routes={data.routes}
          models={data.models}
          routeForm={routeForm}
          isPending={isPending}
          onRouteFormChange={setRouteForm}
          onRouteSubmit={submitRoute}
          onRouteEdit={editRoute}
        />
      </TabsContent>

      <TabsContent value="models" className="m-0 min-h-0 flex-1 overflow-hidden">
        <div className="grid h-full min-h-0 gap-4 overflow-auto xl:grid-cols-[360px_minmax(0,1fr)] xl:overflow-hidden">
          <ModelFormCard
            form={modelForm}
            providers={data.providers}
            isPending={isPending}
            onChange={setModelForm}
            onSubmit={submitModel}
            onReset={() => setModelForm(emptyModelForm(data.providers[0]?.id || ""))}
          />
          <ModelTable models={data.models} onEdit={editModel} />
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
          <ProviderTable providers={data.providers} modelCountByProvider={countModelsByProvider(data.models)} onEdit={editProvider} />
        </div>
      </TabsContent>
    </Tabs>
  );
}
