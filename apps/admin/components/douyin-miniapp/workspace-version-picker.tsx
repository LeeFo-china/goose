"use client";

import { AlertCircle, History } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from
  "@/components/ui/select";
import type { TenantDouyinReleaseOption, TenantDouyinReleaseOptionsResponse } from
  "./workspace-types";
import { versionActionCopy } from "./workspace-version-policy";

type Props = {
  data: TenantDouyinReleaseOptionsResponse;
  disabled: boolean;
  selected: TenantDouyinReleaseOption | null;
  onSelect(id: string): void;
};

const STAGE_LABELS: Record<TenantDouyinReleaseOption["stage"], string> = {
  ready_to_upload: "可生成测试码", created: "准备上传", uploaded: "已上传",
  testing: "体验测试中", audit_pending: "审核中", audit_rejected: "审核未通过",
  audit_approved: "审核通过", released: "已发布", failed: "同步异常",
};

export function WorkspaceVersionPicker({ data, disabled, selected, onSelect }: Props) {
  const copy = selected ? versionActionCopy(selected) : null;
  return (
    <div className="space-y-4">
      {data.provider_message ? (
        <Alert>
          <AlertCircle aria-hidden="true" />
          <AlertDescription>{data.provider_message}</AlertDescription>
        </Alert>
      ) : null}
      {data.list.length > 0 && selected ? (
        <div className="grid gap-4 rounded-md border bg-muted/20 p-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground" htmlFor="douyin-release-version">
              操作版本
            </label>
            <Select disabled={disabled} onValueChange={onSelect} value={selected.id}>
              <SelectTrigger id="douyin-release-version" className="bg-background">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {data.list.map((option) => (
                  <SelectItem key={option.id} value={option.id}>
                    {option.template_version} · {STAGE_LABELS[option.stage]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-medium">{copy?.title}</p>
              <Badge variant="outline">{STAGE_LABELS[selected.stage]}</Badge>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{copy?.description}</p>
            <p className="mt-2 font-mono text-xs text-muted-foreground">
              模板 {selected.template_id} · 更新于 {formatDateTime(selected.updated_at)}
            </p>
          </div>
        </div>
      ) : (
        <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
          当前没有可操作版本。
        </p>
      )}
      <ReleaseHistory data={data} />
    </div>
  );
}

function ReleaseHistory({ data }: { data: TenantDouyinReleaseOptionsResponse }) {
  if (data.history.length === 0) return null;
  return (
    <details className="group rounded-md border">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-medium">
        <History className="size-4 text-muted-foreground" aria-hidden="true" />
        发布历史
        <span className="text-xs font-normal text-muted-foreground">{data.pagination.total} 条</span>
      </summary>
      <div className="divide-y border-t">
        {data.history.map((release) => (
          <div className="grid gap-1 px-4 py-3 sm:grid-cols-[7rem_minmax(0,1fr)_8rem] sm:items-center" key={release.id}>
            <span className="flex items-center gap-2 font-medium tabular-nums">
              {release.template_version}
              <Badge variant="secondary">{STAGE_LABELS[release.status]}</Badge>
            </span>
            <span className="truncate text-sm text-muted-foreground">
              模板 …{release.template_id.slice(-6)} · {release.description}
            </span>
            <span className="text-xs text-muted-foreground sm:text-right">
              {formatDateTime(release.updated_at)}
            </span>
          </div>
        ))}
      </div>
    </details>
  );
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "时间待同步";
  return new Intl.DateTimeFormat("zh-CN", { dateStyle: "short", timeStyle: "short",
    timeZone: "Asia/Shanghai" }).format(date);
}
