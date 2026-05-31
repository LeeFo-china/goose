"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Edit3 } from "lucide-react";
import { toast } from "sonner";
import type { AiConfigData, AiModelRecord, AiProviderRecord, AiSceneRouteRecord } from "@/components/platform-ai/ai-config-types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { countModelsByProvider, FormActions, ModelFormCard, ModelTable, ProviderFormCard, ProviderTable, RouteStatusSelect, StatusBadge } from "@/components/platform-ai/ai-model-routing-sections";
import { emptyModelForm, emptyProviderForm, emptyRouteForm, modelLabel, modelOptionLabel, NONE_VALUE, requestBackend, type ModelFormState, type ProviderFormState, type RouteFormState } from "@/components/platform-ai/ai-model-routing-shared";

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
    <Tabs defaultValue="routes" className="flex flex-col gap-4">
      <TabsList className="w-fit">
        <TabsTrigger value="routes">场景路由</TabsTrigger>
        <TabsTrigger value="models">模型</TabsTrigger>
        <TabsTrigger value="providers">供应商</TabsTrigger>
      </TabsList>

      <TabsContent value="routes" className="m-0">
        <div className="grid gap-4 xl:grid-cols-[360px_1fr]">
          <Card>
            <CardHeader>
              <CardTitle>{routeForm.id ? "编辑场景路由" : "新增场景路由"}</CardTitle>
              <CardDescription>给业务场景配置主模型、备用模型和调用参数。</CardDescription>
            </CardHeader>
            <CardContent>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="ai-route-scene-code">场景编码</FieldLabel>
                  <Input
                    id="ai-route-scene-code"
                    value={routeForm.scene_code}
                    onChange={(event) => setRouteForm({ ...routeForm, scene_code: event.target.value })}
                    placeholder="decoration_qa"
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="ai-route-name">场景名称</FieldLabel>
                  <Input
                    id="ai-route-name"
                    value={routeForm.name}
                    onChange={(event) => setRouteForm({ ...routeForm, name: event.target.value })}
                    placeholder="装修问答"
                  />
                </Field>
                <Field>
                  <FieldLabel>主模型</FieldLabel>
                  <Select
                    value={routeForm.primary_model_id}
                    onValueChange={(value) => setRouteForm({ ...routeForm, primary_model_id: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="选择主模型" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {data.models.map((item) => (
                          <SelectItem key={item.id} value={item.id}>
                            {modelOptionLabel(item)}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>
                <Field>
                  <FieldLabel>备用模型</FieldLabel>
                  <Select
                    value={routeForm.fallback_model_id}
                    onValueChange={(value) => setRouteForm({ ...routeForm, fallback_model_id: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="无备用模型" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem value={NONE_VALUE}>无备用模型</SelectItem>
                        {data.models.map((item) => (
                          <SelectItem key={item.id} value={item.id}>
                            {modelOptionLabel(item)}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>
                <div className="grid gap-3 sm:grid-cols-3">
                  <Field>
                    <FieldLabel htmlFor="ai-route-temperature">温度</FieldLabel>
                    <Input
                      id="ai-route-temperature"
                      value={routeForm.temperature}
                      onChange={(event) => setRouteForm({ ...routeForm, temperature: event.target.value })}
                      inputMode="decimal"
                    />
                  </Field>
                  <Field>
                    <FieldLabel>格式</FieldLabel>
                    <Select
                      value={routeForm.response_format}
                      onValueChange={(value) => setRouteForm({
                        ...routeForm,
                        response_format: value as RouteFormState["response_format"],
                      })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          <SelectItem value="json_object">JSON</SelectItem>
                          <SelectItem value="text">文本</SelectItem>
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="ai-route-timeout">超时</FieldLabel>
                    <Input
                      id="ai-route-timeout"
                      value={routeForm.timeout_ms}
                      onChange={(event) => setRouteForm({ ...routeForm, timeout_ms: event.target.value })}
                      inputMode="numeric"
                    />
                  </Field>
                </div>
                <RouteStatusSelect value={routeForm.status} onChange={(status) => setRouteForm({ ...routeForm, status })} />
                <FormActions
                  isPending={isPending}
                  isEditing={Boolean(routeForm.id)}
                  onReset={() => setRouteForm(emptyRouteForm(data.models[0]?.id || ""))}
                  onSubmit={submitRoute}
                />
              </FieldGroup>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>场景路由列表</CardTitle>
              <CardDescription>模型切换后，新请求立即按最新配置解析。</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>场景</TableHead>
                    <TableHead>主模型</TableHead>
                    <TableHead>备用模型</TableHead>
                    <TableHead>参数</TableHead>
                    <TableHead className="text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.routes.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>
                        <div className="font-medium">{item.name}</div>
                        <div className="text-xs text-muted-foreground">{item.scene_code}</div>
                      </TableCell>
                      <TableCell>{modelLabel(item.primary_model)}</TableCell>
                      <TableCell>{modelLabel(item.fallback_model)}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-2">
                          <StatusBadge status={item.status} />
                          <Badge variant="secondary">T {item.temperature ?? "-"}</Badge>
                          <Badge variant="secondary">{item.response_format || "默认"}</Badge>
                          <Badge variant="secondary">{item.timeout_ms || "-"}ms</Badge>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="outline" size="sm" onClick={() => editRoute(item)}>
                          <Edit3 data-icon="inline-start" />
                          编辑
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      </TabsContent>

      <TabsContent value="models" className="m-0">
        <div className="grid gap-4 xl:grid-cols-[360px_1fr]">
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

      <TabsContent value="providers" className="m-0">
        <div className="grid gap-4 xl:grid-cols-[360px_1fr]">
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
