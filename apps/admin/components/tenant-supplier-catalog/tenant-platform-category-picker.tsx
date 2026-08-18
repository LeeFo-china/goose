"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";

import type { CatalogPage } from "@/components/supplier-catalog/supplier-catalog-types";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { requestBackendJson } from "@/lib/backend-client";

import { buildTenantPlatformCategoryOptionsPath } from "./tenant-catalog-requests";
import { canBrowseTenantCategoryChildren } from "./tenant-catalog-rules";
import type { TenantCatalogCategory } from "./tenant-catalog-types";

const PAGE_SIZE = 20;
type PlatformCategory = Pick<
  TenantCatalogCategory,
  "id" | "code" | "name" | "full_name" | "level" | "ownership_scope"
>;

export function TenantPlatformCategoryPicker({
  value,
  pinned,
  onChange,
}: {
  value: string;
  pinned: TenantCatalogCategory["mapped_platform_category"] | null;
  onChange: (value: string) => void;
}) {
  const [trail, setTrail] = useState<PlatformCategory[]>([]);
  const [searchText, setSearchText] = useState("");
  const [keyword, setKeyword] = useState("");
  const [page, setPage] = useState(1);
  const [retryToken, setRetryToken] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<PlatformCategory | null>(null);
  const [result, setResult] = useState<CatalogPage<PlatformCategory>>({
    list: [],
    pagination: { page: 1, pageSize: PAGE_SIZE, total: 0, totalPages: 0 },
  });
  const parentId = trail.at(-1)?.id ?? null;

  const loadPage = useCallback(async () => {
    const data = await requestBackendJson<CatalogPage<TenantCatalogCategory>>(
      buildTenantPlatformCategoryOptionsPath({
        page,
        pageSize: PAGE_SIZE,
        keyword,
        parentId,
      }),
      { fallbackMessage: "加载平台分类失败" },
    );
    return {
      ...data,
      list: data.list.map(({ id, code, name, full_name, level, ownership_scope }) => ({
          id,
          code,
          name,
          full_name,
          level,
          ownership_scope,
        })),
    };
  }, [keyword, page, parentId]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    void loadPage()
      .then((data) => {
        if (active) setResult(data);
      })
      .catch((caught) => {
        if (active) setError(caught instanceof Error ? caught.message : "加载平台分类失败");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [loadPage, retryToken]);

  const totalPages = Math.max(1, result.pagination.totalPages || 1);
  const current = selected?.id === value
    ? selected
    : value && pinned?.id === value
      ? pinned
      : null;
  function applySearch() {
    setKeyword(searchText.trim().slice(0, 80));
    setPage(1);
  }

  return (
    <div className="flex flex-col gap-3">
      {current ? (
        <div className="flex items-center justify-between gap-3 rounded-md border bg-muted/30 px-3 py-2 text-sm">
          <span><span className="text-muted-foreground">当前映射：</span>{current.full_name} · {current.code}</span>
          <Button type="button" size="sm" variant="ghost" onClick={() => { setSelected(null); onChange(""); }}>清除</Button>
        </div>
      ) : null}
      <nav aria-label="平台分类选择路径" className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
        <Button type="button" size="sm" variant={trail.length ? "ghost" : "secondary"} onClick={() => { setTrail([]); setPage(1); }}>根级</Button>
        {trail.map((item, index) => (
          <span key={item.id} className="flex items-center gap-1">
            <ChevronRight className="size-3.5" aria-hidden="true" />
            <Button type="button" size="sm" variant={index === trail.length - 1 ? "secondary" : "ghost"} onClick={() => { setTrail(trail.slice(0, index + 1)); setPage(1); }}>{item.name}</Button>
          </span>
        ))}
      </nav>
      <div className="flex gap-2">
        <Input
          aria-label="搜索平台分类"
          value={searchText}
          maxLength={80}
          placeholder="搜索当前层级编码或名称"
          onChange={(event) => setSearchText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== "Enter") return;
            event.preventDefault();
            event.stopPropagation();
            applySearch();
          }}
        />
        <Button type="button" variant="outline" onClick={applySearch}><Search data-icon="inline-start" />搜索</Button>
      </div>
      {error ? (
        <Alert variant="destructive"><AlertTitle>平台分类加载失败</AlertTitle><AlertDescription className="flex items-center justify-between gap-3"><span>{error}</span><Button type="button" size="sm" variant="outline" onClick={() => setRetryToken((current) => current + 1)}>重试</Button></AlertDescription></Alert>
      ) : loading ? (
        <div className="space-y-2"><Skeleton className="h-11 w-full" /><Skeleton className="h-11 w-full" /></div>
      ) : result.list.length ? (
        <div className="max-h-56 space-y-1 overflow-y-auto rounded-md border p-1">
          {result.list.map((category) => (
            <div key={category.id} className="flex items-center justify-between gap-2 rounded-sm px-2 py-1.5 hover:bg-muted/50">
              <button type="button" className="min-w-0 flex-1 text-left text-sm" onClick={() => { setSelected(category); onChange(category.id); }}>
                <span className="block truncate font-medium">{category.name}</span>
                <span className="block truncate text-xs text-muted-foreground">{category.full_name} · {category.code}</span>
              </button>
              {canBrowseTenantCategoryChildren(category.level) ? <Button type="button" size="sm" variant="ghost" onClick={() => { setTrail([...trail, category]); setPage(1); setKeyword(""); setSearchText(""); }}>查看下级<ChevronRight data-icon="inline-end" /></Button> : null}
            </div>
          ))}
        </div>
      ) : (
        <Empty className="border p-3"><EmptyHeader><EmptyTitle>当前层级没有平台分类</EmptyTitle><EmptyDescription>返回上级、调整关键词或翻页继续查找。</EmptyDescription></EmptyHeader></Empty>
      )}
      {!error && !loading ? (
        <div className="flex items-center justify-between gap-2">
          <Badge variant="outline" className="tabular-nums">第 {result.pagination.page} / {totalPages} 页</Badge>
          <div className="flex gap-2"><Button type="button" size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}><ChevronLeft data-icon="inline-start" />上一页</Button><Button type="button" size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage((current) => current + 1)}>下一页<ChevronRight data-icon="inline-end" /></Button></div>
        </div>
      ) : null}
    </div>
  );
}
