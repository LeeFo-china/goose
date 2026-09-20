"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { requestBackendJson } from "@/lib/backend-client";
import {
  getTemplateSelectabilityState,
  type PlatformDouyinDeployableTemplate,
  type PlatformDouyinTemplateList,
} from "./platform-douyin-template-rules";

export function PlatformDouyinTemplateAllowlist({
  initialData,
  initialError,
}: {
  initialData: PlatformDouyinTemplateList | null;
  initialError: string | null;
}) {
  const [data, setData] = useState(initialData);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [loadingPage, setLoadingPage] = useState(false);

  async function loadPage(page: number) {
    setLoadingPage(true);
    try {
      const next = await requestBackendJson<PlatformDouyinTemplateList>(
        `/platform/douyin-miniapps/deployable-templates?channel=default&page=${page}&pageSize=20`,
        { fallbackMessage: "获取租户可选模板失败" },
      );
      setData(next);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "获取租户可选模板失败");
    } finally {
      setLoadingPage(false);
    }
  }

  async function setSelectable(template: PlatformDouyinDeployableTemplate, checked: boolean) {
    if (pendingId || template.is_current) return;
    setPendingId(template.id);
    try {
      const changed = await requestBackendJson<PlatformDouyinDeployableTemplate>(
        `/platform/douyin-miniapps/deployable-templates/${template.id}/selectability`,
        {
          method: "POST",
          body: JSON.stringify({
            is_tenant_selectable: checked,
            expected_is_tenant_selectable: template.is_tenant_selectable,
          }),
          fallbackMessage: "修改租户可选状态失败",
        },
      );
      setData((current) => current ? {
        ...current,
        list: current.list.map((item) => item.id === changed.id ? changed : item),
      } : current);
      toast.success(checked ? "模板已开放给租户" : "模板已从租户版本列表下架");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "修改租户可选状态失败");
      await loadPage(data?.pagination.page ?? 1);
    } finally {
      setPendingId(null);
    }
  }

  if (!data || data.list.length === 0) {
    return initialError ? (
      <div className="border-t p-6"><Alert variant="destructive"><AlertDescription>{initialError}</AlertDescription></Alert></div>
    ) : <p className="border-t px-6 py-5 text-sm text-muted-foreground">暂无已确认模板。</p>;
  }

  return (
    <div className="border-t">
      <div className="flex items-center justify-between px-6 py-4">
        <div>
          <h2 className="font-semibold">租户可选版本</h2>
          <p className="mt-1 text-sm text-muted-foreground">推荐版本始终可选，历史稳定版可单独开放或下架。</p>
        </div>
        <span className="text-xs text-muted-foreground">共 {data.pagination.total} 个版本</span>
      </div>
      {initialError ? <div className="px-6 pb-4"><Alert variant="destructive"><AlertDescription>{initialError}</AlertDescription></Alert></div> : null}
      <div className="divide-y border-t">
        {data.list.map((template) => {
          const state = getTemplateSelectabilityState(template);
          const pending = pendingId === template.id;
          return (
            <div className="grid gap-3 px-6 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center" key={template.id}>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium tabular-nums">{template.template_version}</span>
                  {template.is_current ? <Badge variant="success">推荐版本</Badge> : null}
                  <span className="font-mono text-xs text-muted-foreground">模板 …{template.template_id.slice(-6)}</span>
                </div>
                <p className="mt-1 truncate text-sm text-muted-foreground">{template.description}</p>
                {state.help ? <p className="mt-1 text-xs text-muted-foreground">{state.help}</p> : null}
              </div>
              <label className="inline-flex items-center gap-2 text-sm">
                {pending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
                <Switch
                  aria-label={`设置模板 ${template.template_version} 是否对租户可选`}
                  checked={template.is_tenant_selectable}
                  disabled={state.disabled || pendingId !== null}
                  onCheckedChange={(checked) => setSelectable(template, checked)}
                />
                <span className="w-28 text-muted-foreground">{pending ? "正在保存" : state.label}</span>
              </label>
            </div>
          );
        })}
      </div>
      {data.pagination.totalPages > 1 ? (
        <div className="flex justify-end gap-2 border-t px-6 py-4">
          <Button disabled={loadingPage || data.pagination.page <= 1} onClick={() => loadPage(data.pagination.page - 1)} size="sm" variant="outline">上一页</Button>
          <Button disabled={loadingPage || data.pagination.page >= data.pagination.totalPages} onClick={() => loadPage(data.pagination.page + 1)} size="sm" variant="outline">下一页</Button>
        </div>
      ) : null}
    </div>
  );
}
