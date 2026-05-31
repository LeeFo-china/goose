"use client";

import { useState } from "react";
import { Edit3, Plus, RotateCcw, Save } from "lucide-react";
import { toast } from "sonner";
import type { AiModelRecord, AiProviderRecord } from "@/components/platform-ai/ai-config-types";
import { statusLabel } from "@/components/platform-ai/ai-config-types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { ModelFormState, ProviderFormState } from "@/components/platform-ai/ai-model-routing-shared";

export function StatusBadge({ status }: { status: string }) {
  return (
    <Badge variant={status === "active" ? "success" : "outline"}>
      {statusLabel(status)}
    </Badge>
  );
}



export function countModelsByProvider(models: AiModelRecord[]) {
  return models.reduce((map, item) => {
    map.set(item.provider_id, (map.get(item.provider_id) || 0) + 1);
    return map;
  }, new Map<string, number>());
}

export function RouteStatusSelect({
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

export function FormActions({
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

export function ProviderFormCard({
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

export function ModelFormCard({
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

export function ModelTable({
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

export function ProviderTable({
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
