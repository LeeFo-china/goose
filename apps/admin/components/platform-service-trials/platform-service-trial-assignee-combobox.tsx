"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, ChevronsUpDown, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { requestBackendJson } from "@/lib/backend-client";
import { cn } from "@/lib/utils";

import {
  ASSIGNEE_CANDIDATE_PAGE_SIZE,
  ASSIGNEE_SEARCH_DEBOUNCE_MS,
  buildTrialAssigneeCandidatesPath,
  formatTrialAssigneeCandidate,
  formatTrialAssigneeCandidateMeta,
  getTrialAssigneeSelectionActions,
  parseTrialAssigneeCandidatePage,
  resetTrialAssigneeSearchPage,
  selectTrialAssigneeCandidate,
} from "./platform-service-trial-assignee-options";
import type {
  PlatformServiceTrialAssigneeCandidate,
  PlatformServiceTrialAssigneeCandidatePage,
} from "./platform-service-trial-types";

type Props = {
  id?: string;
  value: string | null;
  onChange: (employeeId: string | null) => void;
  initialCandidate?: PlatformServiceTrialAssigneeCandidate | null;
  allowClear?: boolean;
  required?: boolean;
  disabled?: boolean;
  placeholder?: string;
  searchPlaceholder?: string;
  "aria-label"?: string;
};

const EMPTY_PAGE: PlatformServiceTrialAssigneeCandidatePage = {
  list: [],
  pagination: { page: 1, pageSize: ASSIGNEE_CANDIDATE_PAGE_SIZE, total: 0, totalPages: 0 },
};

export function PlatformServiceTrialAssigneeCombobox({
  id,
  value,
  onChange,
  initialCandidate = null,
  allowClear = false,
  required = false,
  disabled = false,
  placeholder = "选择平台跟进人",
  searchPlaceholder = "搜索姓名或手机号",
  "aria-label": ariaLabel = "平台跟进人",
}: Props) {
  const [open, setOpen] = useState(false);
  const [keyword, setKeyword] = useState("");
  const [search, setSearch] = useState({ page: 1, keyword: "" });
  const [result, setResult] = useState(EMPTY_PAGE);
  const [selectedCandidate, setSelectedCandidate] = useState<
    PlatformServiceTrialAssigneeCandidate | null
  >(() => value && initialCandidate?.id === value ? initialCandidate : null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    const timeoutId = window.setTimeout(() => {
      setSearch((current) => resetTrialAssigneeSearchPage(current, keyword));
    }, ASSIGNEE_SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timeoutId);
  }, [keyword, open]);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    const path = buildTrialAssigneeCandidatesPath({
      page: search.page,
      pageSize: ASSIGNEE_CANDIDATE_PAGE_SIZE,
      keyword: search.keyword,
      includeEmployeeId: value || undefined,
    });
    setLoading(true);
    setError("");
    requestBackendJson<unknown>(path, {
      signal: controller.signal,
      fallbackMessage: "平台跟进人加载失败",
    })
      .then((data) => {
        if (controller.signal.aborted) return;
        const nextResult = parseTrialAssigneeCandidatePage(data);
        setResult(nextResult);
        const selected = nextResult.list.find((candidate) => candidate.id === value);
        if (selected) setSelectedCandidate(selected);
      })
      .catch((caught) => {
        if (controller.signal.aborted) return;
        setError(caught instanceof Error ? caught.message : "平台跟进人加载失败");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [open, search.keyword, search.page, value]);

  useEffect(() => {
    if (!value) {
      setSelectedCandidate(null);
      return;
    }
    if (selectedCandidate?.id === value) return;
    if (initialCandidate?.id === value) setSelectedCandidate(initialCandidate);
  }, [initialCandidate, selectedCandidate, value]);

  const candidates = useMemo(() => {
    const byId = new Map(
      result.list.map((candidate) => [candidate.id, candidate] as const),
    );
    if (value && selectedCandidate?.id === value && !byId.has(value)) {
      byId.set(value, selectedCandidate);
    }
    return Array.from(byId.values());
  }, [result.list, selectedCandidate, value]);
  const selectionActions = getTrialAssigneeSelectionActions({
    value,
    allowClear,
    required,
  });
  const selectedLabel = value && selectedCandidate?.id === value
    ? formatTrialAssigneeCandidate(selectedCandidate)
    : value
      ? loading ? "正在加载负责人..." : "当前负责人信息暂不可用"
      : placeholder;
  const totalPages = result.pagination.totalPages;

  function choose(candidate: PlatformServiceTrialAssigneeCandidate) {
    const employeeId = selectTrialAssigneeCandidate(candidate);
    if (!employeeId) return;
    setSelectedCandidate(candidate);
    onChange(employeeId);
    setOpen(false);
  }

  function clear() {
    setSelectedCandidate(null);
    onChange(null);
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-label={ariaLabel}
          aria-expanded={open}
          aria-required={required}
          disabled={disabled}
          className="w-full justify-between font-normal"
        >
          <span className={cn("truncate", !value && "text-muted-foreground")}>
            {selectedLabel}
          </span>
          {loading ? (
            <Loader2 data-icon="inline-end" className="animate-spin opacity-60" />
          ) : (
            <ChevronsUpDown data-icon="inline-end" className="opacity-50" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[var(--radix-popover-trigger-width)] p-0"
        align="start"
      >
        <Command shouldFilter={false}>
          <CommandInput
            value={keyword}
            onValueChange={setKeyword}
            maxLength={80}
            placeholder={searchPlaceholder}
          />
          <CommandList>
            <CommandEmpty>
              {loading ? "加载中..." : error || "没有匹配的平台人员"}
            </CommandEmpty>
            <CommandGroup>
              {selectionActions.includes("clear") ? (
                <CommandItem value="__clear_assignee__" onSelect={clear}>
                  <Check className="opacity-0" />
                  取消当前分配
                </CommandItem>
              ) : null}
              {candidates.map((candidate) => (
                <CommandItem
                  key={candidate.id}
                  value={candidate.id}
                  disabled={!candidate.selectable}
                  onSelect={() => choose(candidate)}
                >
                  <Check className={cn("opacity-0", value === candidate.id && "opacity-100")} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">
                      {candidate.name?.trim() || "未命名平台人员"}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {formatTrialAssigneeCandidateMeta(candidate)}
                    </span>
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
            {error ? (
              <p className="px-3 py-2 text-xs text-destructive" role="alert">{error}</p>
            ) : null}
          </CommandList>
          {totalPages > 1 ? (
            <div className="flex items-center justify-between border-t px-2 py-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={loading || search.page <= 1}
                onClick={() => setSearch((current) => ({ ...current, page: current.page - 1 }))}
              >
                上一页
              </Button>
              <span className="text-xs text-muted-foreground">
                {search.page} / {totalPages}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={loading || search.page >= totalPages}
                onClick={() => setSearch((current) => ({ ...current, page: current.page + 1 }))}
              >
                下一页
              </Button>
            </div>
          ) : null}
        </Command>
      </PopoverContent>
    </Popover>
  );
}
