"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Edit3, Plus, RotateCcw, Save } from "lucide-react";
import { toast } from "sonner";
import type {
  AiConfigData,
  AiModelRecord,
  AiProviderRecord,
  AiSceneRouteRecord,
} from "@/components/platform-ai/ai-config-types";
import { statusLabel } from "@/components/platform-ai/ai-config-types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type ProviderFormState = {
  id?: string;
  code: string;
  name: string;
  endpoint_url: string;
  api_key_setting_key: string;
  status: "active" | "inactive";
  sort_order: string;
};

type ModelFormState = {
  id?: string;
  provider_id: string;
  code: string;
  name: string;
  model_name: string;
  status: "active" | "inactive";
  sort_order: string;
};

type RouteFormState = {
  id?: string;
  scene_code: string;
  name: string;
  primary_model_id: string;
  fallback_model_id: string;
  temperature: string;
  response_format: "json_object" | "text";
  timeout_ms: string;
  status: "active" | "inactive";
};

const NONE_VALUE = "__none";

function emptyProviderForm(): ProviderFormState {
  return {
    code: "",
    name: "",
    endpoint_url: "",
    api_key_setting_key: "",
    status: "active",
    sort_order: "0",
  };
}

function emptyModelForm(providerId = ""): ModelFormState {
  return {
    provider_id: providerId,
    code: "",
    name: "",
    model_name: "",
    status: "active",
    sort_order: "0",
  };
}

function emptyRouteForm(modelId = ""): RouteFormState {
  return {
    scene_code: "",
    name: "",
    primary_model_id: modelId,
    fallback_model_id: NONE_VALUE,
    temperature: "0.7",
    response_format: "json_object",
    timeout_ms: "60000",
    status: "active",
  };
}

async function requestBackend<T>(path: string, init?: RequestInit) {
  const response = await fetch(`/api/backend${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init?.headers || {}),
    },
  });
  const payload = await response.json().catch(() => ({})) as { data?: T; message?: string };
  if (!response.ok) {
    throw new Error(payload.message || `请求失败(${response.status})`);
  }
  return payload.data as T;
}

function modelLabel(model?: AiModelRecord | null) {
  if (!model) return "未配置";
  return `${model.name} · ${model.model_name}`;
}

function modelOptionLabel(model: AiModelRecord) {
  return `${model.name} / ${model.model_name}`;
}

function StatusBadge({ status }: { status: string }) {
  return (
    <Badge variant={status === "active" ? "success" : "outline"}>
      {statusLabel(status)}
    </Badge>
  );
}

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

function countModelsByProvider(models: AiModelRecord[]) {
  return models.reduce((map, item) => {
    map.set(item.provider_id, (map.get(item.provider_id) || 0) + 1);
    return map;
  }, new Map<string, number>());
}

function RouteStatusSelect({
  value,
  onChange,
}: {
  value: "active" | "inactive";
  onChange: (value: "active" | "inactive") => void;
}) {
  return (
    <Field>
      <FieldLabel>状态</FieldLabel>
      <Select value={value} onValueChange={(next) => onChange(next as "active" | "inactive")}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectItem value="active">启用</SelectItem>
            <SelectItem value="inactive">停用</SelectItem>
          </SelectGroup>
        </SelectContent>
      </Select>
    </Field>
  );
}

function FormActions({
  isPending,
  isEditing,
  onReset,
  onSubmit,
}: {
  isPending: boolean;
  isEditing: boolean;
  onReset: () => void;
  onSubmit: () => Promise<void>;
}) {
  const [submitting, setSubmitting] = useState(false);
  async function submit() {
    setSubmitting(true);
    try {
      await onSubmit();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存失败");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Button type="button" onClick={submit} disabled={submitting || isPending}>
        {isEditing ? <Save data-icon="inline-start" /> : <Plus data-icon="inline-start" />}
        {isEditing ? "保存修改" : "新增"}
      </Button>
      <Button type="button" variant="outline" onClick={onReset} disabled={submitting || isPending}>
        <RotateCcw data-icon="inline-start" />
        重置
      </Button>
    </div>
  );
}

function ProviderFormCard({
  form,
  isPending,
  onChange,
  onSubmit,
  onReset,
}: {
  form: ProviderFormState;
  isPending: boolean;
  onChange: (value: ProviderFormState) => void;
  onSubmit: () => Promise<void>;
  onReset: () => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{form.id ? "编辑供应商" : "新增供应商"}</CardTitle>
        <CardDescription>供应商密钥只保存引用 Key，密钥值仍在系统配置维护。</CardDescription>
      </CardHeader>
      <CardContent>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="ai-provider-code">编码</FieldLabel>
            <Input id="ai-provider-code" value={form.code} onChange={(event) => onChange({ ...form, code: event.target.value })} />
          </Field>
          <Field>
            <FieldLabel htmlFor="ai-provider-name">名称</FieldLabel>
            <Input id="ai-provider-name" value={form.name} onChange={(event) => onChange({ ...form, name: event.target.value })} />
          </Field>
          <Field>
            <FieldLabel htmlFor="ai-provider-endpoint">Endpoint</FieldLabel>
            <Input id="ai-provider-endpoint" value={form.endpoint_url} onChange={(event) => onChange({ ...form, endpoint_url: event.target.value })} />
          </Field>
          <Field>
            <FieldLabel htmlFor="ai-provider-key">密钥配置 Key</FieldLabel>
            <Input id="ai-provider-key" value={form.api_key_setting_key} onChange={(event) => onChange({ ...form, api_key_setting_key: event.target.value })} />
            <FieldDescription>例如 AI_API_KEY、DEEPSEEK_API_KEY。</FieldDescription>
          </Field>
          <RouteStatusSelect value={form.status} onChange={(status) => onChange({ ...form, status })} />
          <Field>
            <FieldLabel htmlFor="ai-provider-sort">排序</FieldLabel>
            <Input id="ai-provider-sort" value={form.sort_order} inputMode="numeric" onChange={(event) => onChange({ ...form, sort_order: event.target.value })} />
          </Field>
          <FormActions isPending={isPending} isEditing={Boolean(form.id)} onReset={onReset} onSubmit={onSubmit} />
        </FieldGroup>
      </CardContent>
    </Card>
  );
}

function ModelFormCard({
  form,
  providers,
  isPending,
  onChange,
  onSubmit,
  onReset,
}: {
  form: ModelFormState;
  providers: AiProviderRecord[];
  isPending: boolean;
  onChange: (value: ModelFormState) => void;
  onSubmit: () => Promise<void>;
  onReset: () => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{form.id ? "编辑模型" : "新增模型"}</CardTitle>
        <CardDescription>模型编码用于内部统计，调用名称会传给供应商接口。</CardDescription>
      </CardHeader>
      <CardContent>
        <FieldGroup>
          <Field>
            <FieldLabel>供应商</FieldLabel>
            <Select value={form.provider_id} onValueChange={(value) => onChange({ ...form, provider_id: value })}>
              <SelectTrigger>
                <SelectValue placeholder="选择供应商" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {providers.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.name}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel htmlFor="ai-model-code">模型编码</FieldLabel>
            <Input id="ai-model-code" value={form.code} onChange={(event) => onChange({ ...form, code: event.target.value })} />
          </Field>
          <Field>
            <FieldLabel htmlFor="ai-model-name">显示名称</FieldLabel>
            <Input id="ai-model-name" value={form.name} onChange={(event) => onChange({ ...form, name: event.target.value })} />
          </Field>
          <Field>
            <FieldLabel htmlFor="ai-model-call-name">调用名称</FieldLabel>
            <Input id="ai-model-call-name" value={form.model_name} onChange={(event) => onChange({ ...form, model_name: event.target.value })} />
          </Field>
          <RouteStatusSelect value={form.status} onChange={(status) => onChange({ ...form, status })} />
          <Field>
            <FieldLabel htmlFor="ai-model-sort">排序</FieldLabel>
            <Input id="ai-model-sort" value={form.sort_order} inputMode="numeric" onChange={(event) => onChange({ ...form, sort_order: event.target.value })} />
          </Field>
          <FormActions isPending={isPending} isEditing={Boolean(form.id)} onReset={onReset} onSubmit={onSubmit} />
        </FieldGroup>
      </CardContent>
    </Card>
  );
}

function ModelTable({
  models,
  onEdit,
}: {
  models: AiModelRecord[];
  onEdit: (item: AiModelRecord) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>模型列表</CardTitle>
        <CardDescription>同一场景可以使用不同供应商下的模型做主备切换。</CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>模型</TableHead>
              <TableHead>供应商</TableHead>
              <TableHead>调用名称</TableHead>
              <TableHead>状态</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {models.map((item) => (
              <TableRow key={item.id}>
                <TableCell>
                  <div className="font-medium">{item.name}</div>
                  <div className="text-xs text-muted-foreground">{item.code}</div>
                </TableCell>
                <TableCell>{item.provider?.name || item.provider_id}</TableCell>
                <TableCell>{item.model_name}</TableCell>
                <TableCell><StatusBadge status={item.status} /></TableCell>
                <TableCell className="text-right">
                  <Button variant="outline" size="sm" onClick={() => onEdit(item)}>
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
  );
}

function ProviderTable({
  providers,
  modelCountByProvider,
  onEdit,
}: {
  providers: AiProviderRecord[];
  modelCountByProvider: Map<string, number>;
  onEdit: (item: AiProviderRecord) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>供应商列表</CardTitle>
        <CardDescription>当前只接入 OpenAI-compatible 协议，原生 Claude/Gemini 需要后续扩展适配器。</CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>供应商</TableHead>
              <TableHead>Endpoint</TableHead>
              <TableHead>密钥 Key</TableHead>
              <TableHead>模型数</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {providers.map((item) => (
              <TableRow key={item.id}>
                <TableCell>
                  <div className="font-medium">{item.name}</div>
                  <div className="text-xs text-muted-foreground">{item.code}</div>
                </TableCell>
                <TableCell className="max-w-[280px] truncate">{item.endpoint_url || "-"}</TableCell>
                <TableCell>{item.api_key_setting_key || "-"}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={item.status} />
                    <Badge variant="secondary">{modelCountByProvider.get(item.id) || 0} 个模型</Badge>
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  <Button variant="outline" size="sm" onClick={() => onEdit(item)}>
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
  );
}
