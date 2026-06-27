"use client";

import { useEffect, useState } from "react";
import { Check, ChevronsUpDown, GitBranch, GitCommit, RefreshCw, Tag } from "lucide-react";
import { StatusAlert } from "@/components/admin/status-alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { Pagination, ReleaseRefOption, ReleaseRefType, ReleaseService } from "@/components/ops/ops-types";
import type { ReleaseSearchEnvironment } from "@/components/ops/release-deployments-shared";
import { cn } from "@/lib/utils";
import { diffVariant, environmentLabel, fetchReleaseRefs, formatDateTime, runtimeHealthVariant, runtimeVersionLabel, shortenImageId } from "@/components/ops/release-deployments-shared";

export function getRefTypeIcon(type: ReleaseRefType) {
  if (type === "tag") return Tag;
  if (type === "commit") return GitCommit;
  return GitBranch;
}

export function getRefEmptyMessage(type: ReleaseRefType, keyword: string, error: string) {
  if (error) return error;
  if (keyword.trim()) return "没有匹配的版本";
  if (type === "tag") return "仓库暂无 Tag，请先创建生产版本 Tag。";
  if (type === "commit") return "暂无可选 Commit，请输入关键词后重试。";
  return "暂无可选分支";
}

export function getTodayTagPlaceholder() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `v${year}.${month}.${day}.1`;
}

export function ReleaseRefCombobox({
  type,
  value,
  defaultRef,
  disabled,
  onChange,
}: {
  type: ReleaseRefType;
  value: string;
  defaultRef: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [keyword, setKeyword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [options, setOptions] = useState<ReleaseRefOption[]>([]);
  const Icon = getRefTypeIcon(type);

  useEffect(() => {
    if (!open) return;

    const timer = window.setTimeout(() => {
      setLoading(true);
      setError("");
      fetchReleaseRefs({
        type,
        keyword,
        baseRef: defaultRef,
      })
        .then((list) => setOptions(list))
        .catch((err) => setError(err instanceof Error ? err.message : "版本列表加载失败"))
        .finally(() => setLoading(false));
    }, 180);

    return () => window.clearTimeout(timer);
  }, [defaultRef, keyword, open, type]);

  useEffect(() => {
    setKeyword("");
    setOptions([]);
  }, [type]);

  const selectedOption = options.find((item) => item.value === value);
  const displayValue = selectedOption?.label || value || "选择版本";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className="w-full justify-between"
        >
          <span className="flex min-w-0 items-center gap-2">
            <Icon data-icon="inline-start" />
            <span className="truncate">{displayValue}</span>
          </span>
          <ChevronsUpDown data-icon="inline-end" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[--radix-popover-trigger-width] p-0">
        <Command shouldFilter={false}>
          <CommandInput
            value={keyword}
            onValueChange={setKeyword}
            placeholder="搜索版本..."
          />
          <CommandList>
            <CommandEmpty>{loading ? "加载中..." : getRefEmptyMessage(type, keyword, error)}</CommandEmpty>
            <CommandGroup>
              {options.map((item) => (
                <CommandItem
                  key={`${item.type}-${item.value}`}
                  value={item.value}
                  onSelect={() => {
                    onChange(item.value);
                    setOpen(false);
                  }}
                >
                  <Check className={cn(value === item.value ? "opacity-100" : "opacity-0")} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate">{item.label}</div>
                    <div className="truncate text-xs text-muted-foreground">{item.description}</div>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export function ReleaseServiceMultiSelect({
  options,
  value,
  disabled,
  onChange,
}: {
  options: Array<{ value: ReleaseService; label: string }>;
  value: ReleaseService[];
  disabled?: boolean;
  onChange: (value: ReleaseService[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = value.length ? value : [];
  const selectedSet = new Set(selected);
  const selectedLabels = selected.includes("all")
    ? "全部服务"
    : options
      .filter((item) => selectedSet.has(item.value))
      .map((item) => item.label);
  const displayValue = Array.isArray(selectedLabels)
    ? selectedLabels.length ? selectedLabels.join("、") : "选择服务"
    : selectedLabels;

  function toggleService(nextValue: ReleaseService) {
    if (nextValue === "all") {
      onChange(selectedSet.has("all") ? [] : ["all"]);
      return;
    }

    const next = selected.filter((item) => item !== "all");
    if (selectedSet.has(nextValue)) {
      onChange(next.filter((item) => item !== nextValue));
      return;
    }
    onChange([...next, nextValue]);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className="w-full justify-between"
        >
          <span className="truncate">{displayValue}</span>
          <ChevronsUpDown data-icon="inline-end" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[--radix-popover-trigger-width] p-0">
        <Command>
          <CommandInput placeholder="搜索服务..." />
          <CommandList>
            <CommandEmpty>没有匹配的服务</CommandEmpty>
            <CommandGroup>
              {options.map((item) => {
                const checked = selectedSet.has(item.value);
                const allSelected = selectedSet.has("all");
                const disabledByAll = allSelected && item.value !== "all";

                return (
                  <CommandItem
                    key={item.value}
                    value={`${item.label} ${item.value}`}
                    onSelect={() => toggleService(item.value)}
                    disabled={disabledByAll}
                  >
                    <Checkbox
                      checked={checked}
                      disabled={disabledByAll}
                      aria-label={item.label}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="truncate">{item.label}</div>
                      {item.value === "all" ? (
                        <div className="truncate text-xs text-muted-foreground">构建并发布当前环境的全部业务服务</div>
                      ) : null}
                    </div>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export function CompactPagination({
  pagination,
  pending,
  onPageChange,
}: {
  pagination: Pagination;
  pending?: boolean;
  onPageChange: (page: number) => void;
}) {
  const totalPages = Math.max(pagination.totalPages || 0, 1);
  const page = Math.min(Math.max(pagination.page || 1, 1), totalPages);

  return (
    <div className="flex flex-col gap-3">
      <Separator />
      <div className="flex items-center justify-between gap-3">
        <div className="text-xs text-muted-foreground">
          第 {page} / {totalPages} 页，共 {pagination.total} 条
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={pending || page <= 1}
            onClick={() => onPageChange(page - 1)}
          >
            上一页
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={pending || page >= totalPages}
            onClick={() => onPageChange(page + 1)}
          >
            下一页
          </Button>
        </div>
      </div>
    </div>
  );
}

export function successfulRefEnvironmentLabel(value: ReleaseSearchEnvironment) {
  if (value === "production") return "生产";
  if (value === "dev") return "开发";
  return "全部";
}
