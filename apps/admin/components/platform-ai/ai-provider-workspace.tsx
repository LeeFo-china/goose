"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusAlert } from "@/components/admin/status-alert";
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
      {pending ? <Skeleton className="h-20 w-full motion-reduce:animate-none" aria-label="供应商列表加载中" /> : page.list.length ? page.list.map((provider) => <div key={provider.id} className="flex flex-col gap-2 rounded-md border p-3">
        <Button variant={selectedId === provider.id ? "secondary" : "ghost"} className="h-auto min-w-0 justify-start" aria-pressed={selectedId === provider.id} onClick={() => onSelect(provider.id)}>
          <span className="truncate" title={provider.name}>{provider.name}</span>
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
    <div className="flex min-h-0 min-w-0 flex-col gap-6 overflow-auto rounded-lg border bg-card p-5">
      <AiProviderEditor key={provider?.id || "new"} provider={provider} canManage={props.canManage} onSaved={saved}
        onReload={provider ? () => props.onReload?.(provider.id) ?? Promise.resolve(null) : undefined} />
      <Separator />
      <AiProviderModels key={provider?.id || "new"} providerId={provider?.id || ""} providerName={provider?.name || "新供应商"} canManage={props.canManage} />
    </div>
  </div>;
}
