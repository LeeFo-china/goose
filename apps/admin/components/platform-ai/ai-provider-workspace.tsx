"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusAlert } from "@/components/admin/status-alert";
import { cn } from "@/lib/utils";
import type { AiProviderRecord, PageData } from "./ai-config-types";
import { AiProviderDelete } from "./ai-provider-delete";
import { AiProviderEditor } from "./ai-provider-editor";
import { AiProviderModels } from "./ai-provider-models";

interface WorkspaceProps {
  page: PageData<AiProviderRecord>; providers: AiProviderRecord[]; pending: boolean;
  error?: string; canManage: boolean; deleteDisabled?: boolean;
  onPageChange: (page: number) => void;
  onSaved: (provider: AiProviderRecord) => Promise<void>;
  onReload?: (id: string) => Promise<AiProviderRecord | null>;
  onDeleted: (provider: AiProviderRecord) => Promise<void>;
}

function ProviderRail({ page, selectedId, pending, error, canManage, deleteDisabled, onSelect, onCreate, onPageChange, onDeleted }: WorkspaceProps & {
  selectedId: string | null; onSelect: (id: string) => void; onCreate: () => void;
}) {
  return <aside aria-label="供应商列表" className="flex max-h-[360px] min-h-0 min-w-0 flex-col gap-3 rounded-lg border bg-card p-4 xl:max-h-none [&_button]:min-h-11 sm:[&_button]:min-h-9">
    <div className="flex items-center justify-between gap-2"><h2 className="text-base font-semibold">供应商</h2>
      {canManage ? <Button variant="outline" onClick={onCreate}><Plus data-icon="inline-start" />新增供应商</Button> : null}
    </div>
    {error ? <StatusAlert>{error}<Button variant="outline" onClick={() => onPageChange(page.pagination.page)}>重试</Button></StatusAlert> : null}
    <div className="flex min-h-0 flex-col gap-2 overflow-auto" aria-busy={pending}>
      {pending ? <Skeleton className="h-20 w-full motion-reduce:animate-none" aria-label="供应商列表加载中" /> : page.list.length ? page.list.map((provider) => <div key={provider.id} data-provider-id={provider.id} className={cn(
        "flex flex-col gap-2 rounded-md border p-3 transition-colors",
        selectedId === provider.id ? "border-primary/40 bg-primary/10" : "border bg-card",
      )}>
        <Button variant="ghost" className="h-auto min-w-0 justify-start px-1" aria-pressed={selectedId === provider.id}
          aria-current={selectedId === provider.id ? "true" : undefined} onClick={() => onSelect(provider.id)}>
          <span className={cn("truncate", selectedId === provider.id && "font-semibold text-primary")} title={provider.name}>{provider.name}</span>
        </Button>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Badge variant={provider.status === "active" ? "success" : "outline"}>{provider.status === "active" ? "启用" : "停用"}</Badge>
          {canManage ? <AiProviderDelete provider={provider} onDeleted={onDeleted} disabled={deleteDisabled} /> : null}
        </div>
      </div>) : <p className="py-4 text-sm text-muted-foreground">暂无供应商，可新增连接配置。</p>}
    </div>
    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
      <span>第 {page.pagination.page} / {Math.max(1, page.pagination.totalPages)} 页</span>
      <div className="flex gap-2"><Button variant="outline" size="sm" disabled={pending || page.pagination.page <= 1} onClick={() => onPageChange(page.pagination.page - 1)}>上一页</Button>
        <Button variant="outline" size="sm" disabled={pending || page.pagination.page >= page.pagination.totalPages} onClick={() => onPageChange(page.pagination.page + 1)}>下一页</Button></div>
    </div>
  </aside>;
}

function ProviderDetail({ provider, canManage, onSaved, onReload }: {
  provider: AiProviderRecord | null; canManage: boolean;
  onSaved: (provider: AiProviderRecord) => Promise<void>;
  onReload?: (id: string) => Promise<AiProviderRecord | null>;
}) {
  const detailId = provider?.id || "new";
  return <Card key={detailId} role="region" aria-labelledby="ai-provider-detail-label"
    data-provider-detail-id={detailId} className="flex min-h-0 min-w-0 flex-col overflow-hidden">
    <span id="ai-provider-detail-label" className="sr-only">供应商详情</span>
    <CardHeader className="shrink-0 border-b">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1.5">
          <CardTitle id="ai-provider-detail-title" className="truncate" title={provider?.name || "新增供应商"}>
            {provider?.name || "新增供应商"}
          </CardTitle>
          <CardDescription>{provider ? `系统编码：${provider.code}` : "保存后由系统生成供应商编码。"}</CardDescription>
        </div>
        {provider ? <Badge variant={provider.status === "active" ? "success" : "outline"}>
          {provider.status === "active" ? "启用" : "停用"}
        </Badge> : null}
      </div>
    </CardHeader>
    <CardContent className="flex min-h-0 flex-1 flex-col gap-6 overflow-auto pt-5">
      <AiProviderEditor provider={provider} canManage={canManage} onSaved={onSaved}
        onReload={provider ? () => onReload?.(provider.id) ?? Promise.resolve(null) : undefined} />
      <Separator />
      <AiProviderModels providerId={provider?.id || ""} providerName={provider?.name || "新供应商"} canManage={canManage} />
    </CardContent>
  </Card>;
}

export function AiProviderWorkspace(props: WorkspaceProps) {
  const [selectedId, setSelectedId] = useState<string | null>(props.page.list[0]?.id || null);
  const provider = props.page.list.find((item) => item.id === selectedId) || props.providers.find((item) => item.id === selectedId) || null;
  async function saved(record: AiProviderRecord) {
    setSelectedId(record.id);
    await props.onSaved(record);
  }
  async function deleted(record: AiProviderRecord) {
    if (selectedId === record.id) setSelectedId(props.page.list.find((item) => item.id !== record.id)?.id || null);
    await props.onDeleted(record);
  }
  return <div className="grid h-full min-h-0 auto-rows-max grid-cols-1 gap-4 overflow-auto xl:auto-rows-fr xl:grid-cols-[320px_minmax(0,1fr)] xl:overflow-hidden">
    <ProviderRail {...props} selectedId={selectedId} onSelect={setSelectedId} onCreate={() => setSelectedId(null)} onDeleted={deleted} />
    <ProviderDetail provider={provider} canManage={props.canManage} onSaved={saved} onReload={props.onReload} />
  </div>;
}
