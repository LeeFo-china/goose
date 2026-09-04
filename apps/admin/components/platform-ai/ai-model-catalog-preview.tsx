"use client";

import { Save, Search, X } from "lucide-react";
import type { AiCatalogEntryRecord, PageData } from "@/components/platform-ai/ai-config-types";
import type { CatalogEntryFilters } from "@/components/platform-ai/ai-model-catalog-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const MODALITY_LABELS = {
  text: "文本",
  image: "图片生成",
  video: "视频生成",
  speech: "语音生成",
} as const;

const CHANGE_LABELS = {
  all: "全部变化",
  new: "新增",
  changed: "能力或价格变化",
  unchanged: "未变化",
  removed: "已下架",
} as const;

const BLOCK_LABELS = {
  CAPABILITY_METADATA_INCOMPLETE: "能力信息不足，暂不可应用",
} as const;

type PreviewProps = {
  entries: PageData<AiCatalogEntryRecord>;
  filters: CatalogEntryFilters;
  selectedEntries: string[];
  pending: boolean;
  applying: boolean;
  error?: string | null;
  onApplySelected: () => void;
  onToggleEntry: (id: string, checked: boolean) => void;
  onFiltersChange: (filters: CatalogEntryFilters) => void;
  onPageChange: (page: number) => void;
};

export function changeTypeLabel(value: string): string {
  return CHANGE_LABELS[value as keyof typeof CHANGE_LABELS] ?? "未知变化";
}

export function AiModelCatalogPreview({
  entries,
  filters,
  selectedEntries,
  pending,
  applying,
  error,
  onApplySelected,
  onToggleEntry,
  onFiltersChange,
  onPageChange,
}: PreviewProps) {
  const hasFilters = Boolean(filters.keyword.trim())
    || filters.modality !== "all"
    || filters.changeType !== "all";
  const page = entries.pagination;
  const totalPages = Math.max(page.totalPages, 1);

  function updateFilters(patch: Partial<CatalogEntryFilters>) {
    onFiltersChange({ ...filters, ...patch });
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 border-b bg-card px-4 py-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-base font-semibold tracking-normal">OpenRouter 多模态目录</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              勾选可应用条目；下架和价格变化不会自动切换业务路由。
            </p>
            {error ? <p className="mt-2 text-sm text-destructive">{error}</p> : null}
          </div>
          <Button
            type="button"
            onClick={onApplySelected}
            disabled={pending || applying || selectedEntries.length === 0}
          >
            <Save data-icon="inline-start" />
            {applying ? "应用中" : "应用选中（最多 100）"}
          </Button>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <div className="relative min-w-[260px] flex-1">
            <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={filters.keyword}
              onChange={(event) => updateFilters({ keyword: event.target.value })}
              placeholder="搜索模型名称或 OpenRouter ID"
              className="h-9 pl-9 pr-9"
            />
            {filters.keyword ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-1 top-1/2 size-7 -translate-y-1/2"
                aria-label="清空搜索"
                onClick={() => updateFilters({ keyword: "" })}
              >
                <X />
              </Button>
            ) : null}
          </div>
          <Tabs
            value={filters.modality}
            onValueChange={(value) => updateFilters({ modality: value as CatalogEntryFilters["modality"] })}
          >
            <TabsList>
              <TabsTrigger value="all">全部</TabsTrigger>
              {Object.entries(MODALITY_LABELS).map(([value, label]) => (
                <TabsTrigger key={value} value={value}>{label}</TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <Select
            value={filters.changeType}
            onValueChange={(value) => updateFilters({ changeType: value as CatalogEntryFilters["changeType"] })}
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="变化类型" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {Object.entries(CHANGE_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>{label}</SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="min-h-0 flex-1">
        <Table containerClassName="h-full" className="min-w-[1040px]">
          <TableHeader className="sticky top-0 bg-card">
            <TableRow>
              <TableHead className="w-12">选择</TableHead>
              <TableHead>模型</TableHead>
              <TableHead>功能</TableHead>
              <TableHead>变化</TableHead>
              <TableHead>应用状态</TableHead>
              <TableHead>价格快照</TableHead>
              <TableHead>当前版本</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.list.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-28 text-center text-muted-foreground">
                  {pending ? "目录条目加载中" : hasFilters ? "没有符合筛选条件的模型" : "暂无目录条目"}
                </TableCell>
              </TableRow>
            ) : entries.list.map((entry) => {
              const isBlocked = entry.apply_status === "blocked";
              return (
                <TableRow key={entry.id} data-state={selectedEntries.includes(entry.id) ? "selected" : undefined}>
                  <TableCell>
                    <Checkbox
                      aria-label={`选择 ${entry.model_name}`}
                      checked={selectedEntries.includes(entry.id)}
                      disabled={pending || isBlocked}
                      onCheckedChange={(checked) => onToggleEntry(entry.id, checked === true)}
                    />
                  </TableCell>
                  <TableCell>
                    <div className="font-medium">{entry.model_name}</div>
                    <div className="text-xs text-muted-foreground">{entry.external_model_id}</div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">
                      {MODALITY_LABELS[entry.modality as keyof typeof MODALITY_LABELS] ?? "未知功能"}
                    </Badge>
                  </TableCell>
                  <TableCell>{changeTypeLabel(entry.change_type)}</TableCell>
                  <TableCell>
                    {isBlocked ? (
                      <Badge variant="outline">
                        {BLOCK_LABELS[entry.apply_block_code as keyof typeof BLOCK_LABELS] ?? "暂不可应用"}
                      </Badge>
                    ) : (
                      <Badge variant="secondary">可应用</Badge>
                    )}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{priceSummary(entry.raw_price_projection)}</TableCell>
                  <TableCell>{entry.current_model_version ?? "-"}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t bg-card px-4 py-3 text-sm">
        <div className="text-muted-foreground">
          条目第 {page.page} / {totalPages} 页，当前显示 {entries.list.length} 条，共 {page.total} 条
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={pending || page.page <= 1}
            onClick={() => onPageChange(Math.max(1, page.page - 1))}
          >
            上一页
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={pending || page.page >= totalPages}
            onClick={() => onPageChange(page.page + 1)}
          >
            下一页
          </Button>
        </div>
      </div>
    </div>
  );
}

function priceSummary(value: AiCatalogEntryRecord["raw_price_projection"]): string {
  if (!value) return "-";
  const entries = Object.entries(value)
    .filter((entry): entry is [string, string | number] =>
      typeof entry[1] === "string" || typeof entry[1] === "number")
    .slice(0, 3);
  return entries.length
    ? entries.map(([key, price]) => `${key}:${price}`).join(" / ")
    : "-";
}
