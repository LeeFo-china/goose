"use client";

import { AlertCircle, Search } from "lucide-react";
import type { AiProviderRecord, AiRouteModelOptionRecord, PageData } from "@/components/platform-ai/ai-config-types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { NONE_VALUE } from "@/components/platform-ai/ai-model-routing-shared";
import { AiRouteModelInspection } from "./ai-route-model-inspection";

export type RouteModelTarget = "primary" | "fallback";

export type RouteModelOptionsState = {
  data: PageData<AiRouteModelOptionRecord>;
  loading: boolean;
  error: string | null;
  selected: AiRouteModelOptionRecord | null;
};

type Props = {
  title: string;
  target: RouteModelTarget;
  providers: AiProviderRecord[];
  providerId: string;
  keyword: string;
  value: string;
  state: RouteModelOptionsState;
  allowNone?: boolean;
  disabled?: boolean;
  inspect?: boolean;
  sceneModality?: AiRouteModelOptionRecord["modality"];
  onProviderChange: (target: RouteModelTarget, providerId: string) => void;
  onKeywordChange: (target: RouteModelTarget, keyword: string) => void;
  onSearch: (target: RouteModelTarget, page?: number) => void;
  onSelect: (target: RouteModelTarget, option: AiRouteModelOptionRecord | null) => void;
};

function optionText(option: AiRouteModelOptionRecord): string {
  return option.description ? `${option.label} · ${option.description}` : option.label;
}

export function AiRouteModelSelector({
  title, target, providers, providerId, keyword, value, state, allowNone = false, disabled = false, inspect = false, sceneModality = "image",
  onProviderChange, onKeywordChange, onSearch, onSelect,
}: Props) {
  const selected = state.selected;
  const optionList = selected
    ? [selected, ...state.data.list.filter((item) => item.value !== selected.value)]
    : state.data.list;
  const providerInactive = providers.find((provider) => provider.id === providerId)?.status === "inactive";
  const modelDisabled = disabled || providerInactive;
  const canSearch = Boolean(providerId) && !modelDisabled && !state.loading;
  const visibleProviders = providers.filter((item) => item.status === "active" || item.id === providerId);
  const totalPages = Math.max(state.data.pagination.totalPages, 1);

  return (
    <Field role="group" aria-label={title}>
      <FieldLabel>{title}</FieldLabel>
      <div className="flex flex-col gap-3 rounded-md border bg-muted/20 p-3">
        <Field>
          <FieldLabel htmlFor={`ai-route-${target}-provider`}>{title}供应商</FieldLabel>
          <Select value={providerId} disabled={disabled} onValueChange={(next) => onProviderChange(target, next)}>
            <SelectTrigger id={`ai-route-${target}-provider`}><SelectValue placeholder="选择供应商" /></SelectTrigger>
            <SelectContent><SelectGroup>
              {visibleProviders.map((item) => (
                <SelectItem key={item.id} value={item.id} disabled={item.status !== "active"}>{item.name}{item.status === "inactive" ? "（已停用）" : ""}</SelectItem>
              ))}
            </SelectGroup></SelectContent>
          </Select>
          {providerId && visibleProviders.find((item) => item.id === providerId)?.status === "inactive" ? (
            <FieldDescription>当前绑定供应商已停用，不能作为新的选择。保存前需恢复供应商或更换绑定。</FieldDescription>
          ) : null}
        </Field>
        <Field>
          <FieldLabel htmlFor={`ai-route-${target}-keyword`}>搜索{title}</FieldLabel>
          <div className="flex gap-2">
            <Input id={`ai-route-${target}-keyword`} value={keyword} disabled={modelDisabled}
              onChange={(event) => onKeywordChange(target, event.target.value)} placeholder="搜索模型名称或调用名称" />
            <Button type="button" variant="outline" disabled={!canSearch} onClick={() => onSearch(target, 1)}>
              <Search data-icon="inline-start" />搜索
            </Button>
          </div>
        </Field>
        {inspect ? <AiRouteModelInspection title={title} state={state} providers={providers} providerId={providerId} sceneModality={sceneModality} /> : <Field>
          <FieldLabel htmlFor={`ai-route-${target}-model`}>选择{title}</FieldLabel>
          <Select value={value} disabled={!providerId || modelDisabled || state.loading} onValueChange={(next) => {
            if (next === NONE_VALUE) return onSelect(target, null);
            onSelect(target, optionList.find((item) => item.value === next) || null);
          }}>
            <SelectTrigger id={`ai-route-${target}-model`}><SelectValue placeholder={state.loading ? "候选模型加载中" : allowNone ? "无备用模型" : "选择模型"} /></SelectTrigger>
            <SelectContent><SelectGroup>
              {allowNone ? <SelectItem value={NONE_VALUE}>无备用模型</SelectItem> : null}
              {optionList.map((item) => (
                <SelectItem key={`${item.source}:${item.value}`} value={item.value} disabled={Boolean(item.status && item.status !== "active")}>
                  {optionText(item)}
                </SelectItem>
              ))}
            </SelectGroup></SelectContent>
          </Select>
        </Field>}
        <div>
          {state.loading ? <FieldDescription role="status" aria-live="polite">候选模型加载中</FieldDescription> : null}
          {state.error ? (
            <div className="flex flex-wrap items-center gap-2 text-sm text-destructive" role="alert">
              <AlertCircle data-icon="inline-start" />模型候选加载失败，请重试。
              <Button type="button" variant="outline" size="sm" disabled={modelDisabled} onClick={() => onSearch(target, state.data.pagination.page)}>重试加载模型</Button>
            </div>
          ) : null}
          {!inspect && !disabled && !state.loading && !state.error && providerId && state.data.list.length === 0 ? <FieldDescription role="status" aria-live="polite">暂无符合场景模态的可用模型。</FieldDescription> : null}
          {!inspect && state.selected?.status && state.selected.status !== "active" ? (
            <>
              <Badge variant="outline">当前绑定模型不可用</Badge>
              <FieldDescription>原绑定已保留；保存前需恢复模型，或在场景允许时替换、清空不可用绑定。</FieldDescription>
            </>
          ) : null}
        </div>
        {state.data.pagination.totalPages > 1 ? (
          <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
            <span>第 {state.data.pagination.page} / {totalPages} 页</span>
            <div className="flex gap-2">
              <Button type="button" size="sm" variant="outline" disabled={!canSearch || state.data.pagination.page <= 1} onClick={() => onSearch(target, state.data.pagination.page - 1)}>上一页</Button>
              <Button type="button" size="sm" variant="outline" disabled={!canSearch || state.data.pagination.page >= totalPages} onClick={() => onSearch(target, state.data.pagination.page + 1)}>下一页</Button>
            </div>
          </div>
        ) : null}
      </div>
    </Field>
  );
}
