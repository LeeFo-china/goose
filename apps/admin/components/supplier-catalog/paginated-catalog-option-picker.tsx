"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

import type { CatalogPage } from "./supplier-catalog-types";

const PAGE_SIZE = 20;

export type CatalogPickerOption = {
  id: string;
  code: string;
  name: string;
};

export function PaginatedCatalogOptionPicker<Option extends CatalogPickerOption>({
  value,
  pinned,
  loadPage,
  getLabel,
  searchLabel,
  selectLabel,
  emptyDescription,
  pageSize = PAGE_SIZE,
  onChange,
}: {
  value: string;
  pinned: Option | null;
  loadPage: (input: { page: number; pageSize: number; keyword: string }) => Promise<CatalogPage<Option>>;
  getLabel: (option: Option) => string;
  searchLabel: string;
  selectLabel: string;
  emptyDescription: string;
  pageSize?: number;
  onChange: (option: Option) => void;
}) {
  const [searchText, setSearchText] = useState("");
  const [keyword, setKeyword] = useState("");
  const [page, setPage] = useState(1);
  const [retryToken, setRetryToken] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Option | null>(pinned);
  const [result, setResult] = useState<CatalogPage<Option>>({
    list: [],
    pagination: { page: 1, pageSize: PAGE_SIZE, total: 0, totalPages: 0 },
  });

  useEffect(() => {
    if (pinned?.id === value) setSelected(pinned);
  }, [pinned, value]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    void loadPage({ page, pageSize, keyword })
      .then((data) => {
        if (active) setResult(data);
      })
      .catch((caught) => {
        if (active) {
          setError(caught instanceof Error ? caught.message : "候选数据加载失败");
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [keyword, loadPage, page, pageSize, retryToken]);

  const current = selected?.id === value ? selected : pinned?.id === value ? pinned : null;
  const options = useMemo(() => {
    if (!current || result.list.some(({ id }) => id === current.id)) {
      return result.list;
    }
    return [current, ...result.list];
  }, [current, result.list]);
  const totalPages = Math.max(1, result.pagination.totalPages || 1);

  function handleSearch() {
    setKeyword(searchText.trim().slice(0, 80));
    setPage(1);
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <Input
          aria-label={searchLabel}
          value={searchText}
          maxLength={80}
          placeholder={`${searchLabel}编码或名称`}
          onChange={(event) => setSearchText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== "Enter") return;
            event.preventDefault();
            event.stopPropagation();
            handleSearch();
          }}
        />
        <Button type="button" variant="outline" onClick={handleSearch}>
          <Search data-icon="inline-start" />
          搜索
        </Button>
      </div>
      {error ? (
        <Alert variant="destructive">
          <AlertTitle>候选数据加载失败</AlertTitle>
          <AlertDescription className="flex items-center justify-between gap-3">
            <span>{error}</span>
            <Button type="button" size="sm" variant="outline" onClick={() => setRetryToken((value) => value + 1)}>重试</Button>
          </AlertDescription>
        </Alert>
      ) : loading ? <Skeleton className="h-10 w-full" /> : options.length ? (
        <Select
          value={value || undefined}
          onValueChange={(id) => {
            const option = options.find((item) => item.id === id);
            if (!option) return;
            setSelected(option);
            onChange(option);
          }}
        >
          <SelectTrigger aria-label={selectLabel}><SelectValue placeholder={selectLabel} /></SelectTrigger>
          <SelectContent><SelectGroup>
            {options.map((option) => (
              <SelectItem key={option.id} value={option.id}>
                {getLabel(option)}{current?.id === option.id && !result.list.some(({ id }) => id === option.id) ? " · 当前选择" : ""}
              </SelectItem>
            ))}
          </SelectGroup></SelectContent>
        </Select>
      ) : (
        <Empty className="border p-3"><EmptyHeader><EmptyTitle>没有可选数据</EmptyTitle><EmptyDescription>{emptyDescription}</EmptyDescription></EmptyHeader></Empty>
      )}
      {!error && !loading ? (
        <div className="flex items-center justify-between gap-2">
          <Badge variant="outline" className="tabular-nums">第 {result.pagination.page} / {totalPages} 页</Badge>
          <div className="flex gap-2">
            <Button type="button" size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}><ChevronLeft data-icon="inline-start" />上一页</Button>
            <Button type="button" size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage((value) => value + 1)}>下一页<ChevronRight data-icon="inline-end" /></Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
