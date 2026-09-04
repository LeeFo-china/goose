"use client";

import { Edit3, Search } from "lucide-react";
import type {
  AiProviderRecord,
  AiRouteModelOptionRecord,
  AiSceneRouteRecord,
  PageData,
} from "@/components/platform-ai/ai-config-types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FormActions, RouteStatusSelect, StatusBadge, TablePageFooter } from "@/components/platform-ai/ai-model-routing-sections";
import {
  emptyRouteForm,
  modelLabel,
  NONE_VALUE,
  type RouteFormState,
} from "@/components/platform-ai/ai-model-routing-shared";

type RouteModelTarget = "primary" | "fallback";

type RouteModelSelectorProps = {
  title: string;
  target: RouteModelTarget;
  providers: AiProviderRecord[];
  options: PageData<AiRouteModelOptionRecord>;
  routeForm: RouteFormState;
  allowNone?: boolean;
  onRouteFormChange: (form: RouteFormState) => void;
  onModelSearch: (target: RouteModelTarget, providerId: string, keyword: string) => Promise<void>;
};

function optionDescription(option: AiRouteModelOptionRecord) {
  if (!option.description) return "";
  return ` · ${option.description}`;
}

function RouteModelSelector({
  title,
  target,
  providers,
  options,
  routeForm,
  allowNone = false,
  onRouteFormChange,
  onModelSearch,
}: RouteModelSelectorProps) {
  const isPrimary = target === "primary";
  const providerKey = isPrimary ? "primary_provider_id" : "fallback_provider_id";
  const keywordKey = isPrimary ? "primary_keyword" : "fallback_keyword";
  const optionKey = isPrimary ? "primary_option_value" : "fallback_option_value";
  const modelKey = isPrimary ? "primary_model_id" : "fallback_model_id";
  const providerId = routeForm[providerKey];
  const keyword = routeForm[keywordKey];
  const optionValue = routeForm[optionKey];

  return (
    <Field>
      <FieldLabel>{title}</FieldLabel>
      <div className="flex flex-col gap-3 rounded-md border bg-muted/20 p-3">
        <Field>
          <FieldLabel>选择供应商</FieldLabel>
          <Select
            value={providerId}
            onValueChange={(value) => onRouteFormChange({
              ...routeForm,
              [providerKey]: value,
              [keywordKey]: "",
              [optionKey]: allowNone ? NONE_VALUE : "",
              [modelKey]: allowNone ? NONE_VALUE : "",
            })}
          >
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
          <FieldLabel htmlFor={`ai-route-${target}-keyword`}>搜索模型</FieldLabel>
          <div className="flex gap-2">
            <Input
              id={`ai-route-${target}-keyword`}
              value={keyword}
              onChange={(event) => onRouteFormChange({ ...routeForm, [keywordKey]: event.target.value })}
              placeholder="搜索模型名称或调用名称"
            />
            <Button
              type="button"
              variant="outline"
              disabled={!providerId}
              onClick={() => void onModelSearch(target, providerId, keyword)}
            >
              <Search data-icon="inline-start" />
              搜索
            </Button>
          </div>
        </Field>
        <Field>
          <FieldLabel>选择模型</FieldLabel>
          <Select
            value={optionValue}
            onValueChange={(value) => onRouteFormChange({
              ...routeForm,
              [optionKey]: value,
              [modelKey]: value,
            })}
            disabled={!providerId}
          >
            <SelectTrigger>
              <SelectValue placeholder={allowNone ? "无备用模型" : "选择模型"} />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {allowNone ? <SelectItem value={NONE_VALUE}>无备用模型</SelectItem> : null}
                {options.list.map((item) => (
                  <SelectItem key={`${item.source}:${item.value}`} value={item.value}>
                    {item.label}{optionDescription(item)}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
      </div>
    </Field>
  );
}

export function AiModelRouteTab({
  routePage,
  providers,
  primaryOptions,
  fallbackOptions,
  routeForm,
  isPending,
  isRouteLoading,
  onRouteFormChange,
  onRouteSubmit,
  onRouteEdit,
  onRoutePageChange,
  onModelSearch,
}: {
  routePage: PageData<AiSceneRouteRecord>;
  providers: AiProviderRecord[];
  primaryOptions: PageData<AiRouteModelOptionRecord>;
  fallbackOptions: PageData<AiRouteModelOptionRecord>;
  routeForm: RouteFormState;
  isPending: boolean;
  isRouteLoading: boolean;
  onRouteFormChange: (form: RouteFormState) => void;
  onRouteSubmit: () => Promise<void>;
  onRouteEdit: (item: AiSceneRouteRecord) => void;
  onRoutePageChange: (page: number) => void;
  onModelSearch: (target: RouteModelTarget, providerId: string, keyword: string) => Promise<void>;
}) {
  return (
    <div className="grid h-full min-h-0 gap-4 overflow-auto xl:grid-cols-[360px_minmax(0,1fr)] xl:overflow-hidden">
      <Card className="flex min-h-0 flex-col overflow-hidden">
        <CardHeader className="shrink-0">
          <CardTitle>{routeForm.id ? "编辑场景路由" : "新增场景路由"}</CardTitle>
          <CardDescription>先选择供应商，再搜索并选择具体模型。</CardDescription>
        </CardHeader>
        <CardContent className="min-h-0 flex-1 overflow-auto">
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="ai-route-scene-code">场景编码</FieldLabel>
              <Input
                id="ai-route-scene-code"
                value={routeForm.scene_code}
                onChange={(event) => onRouteFormChange({ ...routeForm, scene_code: event.target.value })}
                placeholder="decoration_qa"
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="ai-route-name">场景名称</FieldLabel>
              <Input
                id="ai-route-name"
                value={routeForm.name}
                onChange={(event) => onRouteFormChange({ ...routeForm, name: event.target.value })}
                placeholder="装修问答"
              />
            </Field>
            <Field>
              <FieldLabel>模型模态</FieldLabel>
              <Select
                value={routeForm.modality}
                onValueChange={(value) => onRouteFormChange({
                  ...routeForm,
                  modality: value as RouteFormState["modality"],
                  primary_option_value: "",
                  primary_model_id: "",
                  fallback_option_value: NONE_VALUE,
                  fallback_model_id: NONE_VALUE,
                })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="text">文本</SelectItem>
                    <SelectItem value="image">图片生成</SelectItem>
                    <SelectItem value="video">视频生成</SelectItem>
                    <SelectItem value="speech">语音生成</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
            <RouteModelSelector
              title="主模型"
              target="primary"
              providers={providers}
              options={primaryOptions}
              routeForm={routeForm}
              onRouteFormChange={onRouteFormChange}
              onModelSearch={onModelSearch}
            />
            <RouteModelSelector
              title="备用模型"
              target="fallback"
              providers={providers}
              options={fallbackOptions}
              routeForm={routeForm}
              allowNone
              onRouteFormChange={onRouteFormChange}
              onModelSearch={onModelSearch}
            />
            <details className="rounded-md border bg-muted/20 p-3">
              <summary className="cursor-pointer text-sm font-medium">高级参数</summary>
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <Field>
                  <FieldLabel htmlFor="ai-route-temperature">温度</FieldLabel>
                  <Input
                    id="ai-route-temperature"
                    value={routeForm.temperature}
                    onChange={(event) => onRouteFormChange({ ...routeForm, temperature: event.target.value })}
                    inputMode="decimal"
                  />
                </Field>
                <Field>
                  <FieldLabel>格式</FieldLabel>
                  <Select
                    value={routeForm.response_format}
                    onValueChange={(value) => onRouteFormChange({
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
                    onChange={(event) => onRouteFormChange({ ...routeForm, timeout_ms: event.target.value })}
                    inputMode="numeric"
                  />
                </Field>
              </div>
            </details>
            <RouteStatusSelect
              value={routeForm.status}
              onChange={(status) => onRouteFormChange({ ...routeForm, status })}
            />
            <FormActions
              isPending={isPending}
              isEditing={Boolean(routeForm.id)}
              onReset={() => onRouteFormChange(emptyRouteForm(providers[0]?.id || ""))}
              onSubmit={onRouteSubmit}
            />
          </FieldGroup>
        </CardContent>
      </Card>

      <Card className="flex min-h-0 flex-col overflow-hidden">
        <CardHeader className="shrink-0">
          <CardTitle>场景路由列表</CardTitle>
          <CardDescription>模型切换后，新请求立即按最新配置解析。</CardDescription>
        </CardHeader>
        <CardContent className="min-h-0 flex-1 p-0">
          <Table containerClassName="h-full" className="min-w-[980px]">
            <TableHeader className="sticky top-0 bg-card">
              <TableRow>
                <TableHead>场景</TableHead>
                <TableHead>主模型</TableHead>
                <TableHead>备用模型</TableHead>
                <TableHead>参数</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isRouteLoading ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground">
                    场景路由加载中
                  </TableCell>
                </TableRow>
              ) : routePage.list.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground">
                    暂无场景路由
                  </TableCell>
                </TableRow>
              ) : routePage.list.map((item) => (
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
                      <Badge variant="secondary">{item.modality || "text"}</Badge>
                      <Badge variant="secondary">T {item.temperature ?? "-"}</Badge>
                      <Badge variant="secondary">{item.response_format || "默认"}</Badge>
                      <Badge variant="secondary">{item.timeout_ms || "-"}ms</Badge>
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="outline" size="sm" onClick={() => onRouteEdit(item)}>
                      <Edit3 data-icon="inline-start" />
                      编辑
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
        <TablePageFooter
          pagination={routePage.pagination}
          visibleCount={routePage.list.length}
          pending={isRouteLoading}
          onPageChange={onRoutePageChange}
        />
      </Card>
    </div>
  );
}
