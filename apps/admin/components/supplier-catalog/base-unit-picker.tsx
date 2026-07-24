"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

import { loadBaseUnitPage } from "./supplier-catalog-api";
import { handleBaseUnitSearchKeyDown } from "./supplier-catalog-requests";
import { mergePinnedBaseUnit } from "./supplier-catalog-rules";
import type {
  CatalogBaseUnit,
  CatalogPage,
} from "./supplier-catalog-types";

const PAGE_SIZE = 20;

export function BaseUnitPicker({
  value,
  pinned,
  onChange,
}: {
  value: string;
  pinned: CatalogBaseUnit | null;
  onChange: (value: string) => void;
}) {
  const [searchText, setSearchText] = useState("");
  const [keyword, setKeyword] = useState("");
  const [page, setPage] = useState(1);
  const [retryToken, setRetryToken] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CatalogPage<CatalogBaseUnit>>({
    list: [],
    pagination: {
      page: 1,
      pageSize: PAGE_SIZE,
      total: 0,
      totalPages: 0,
    },
  });

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    void loadBaseUnitPage({ page, pageSize: PAGE_SIZE, keyword })
      .then((data) => {
        if (!active) return;
        setResult(data);
      })
      .catch((caught) => {
        if (!active) return;
        setError(
          caught instanceof Error ? caught.message : "加载基准单位失败",
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [keyword, page, retryToken]);

  const options = useMemo(
    () => mergePinnedBaseUnit(result.list, pinned),
    [pinned, result.list],
  );
  const totalPages = Math.max(1, result.pagination.totalPages || 1);

  function handleSearch() {
    setKeyword(searchText.trim().slice(0, 80));
    setPage(1);
  }

  return (
    <div className="flex flex-col gap-2">
      {pinned && value === pinned.id ? (
        <p className="text-sm text-muted-foreground">
          当前关联：{pinned.name}（{pinned.symbol}） · {pinned.code}
        </p>
      ) : null}
      <div className="flex gap-2">
        <Input
          aria-label="搜索基准单位"
          value={searchText}
          maxLength={80}
          placeholder="搜索基准单位编码或名称"
          onChange={(event) => setSearchText(event.target.value)}
          onKeyDown={(event) =>
            handleBaseUnitSearchKeyDown(event, handleSearch)}
        />
        <Button type="button" variant="outline" onClick={handleSearch}>
          <Search data-icon="inline-start" />
          搜索
        </Button>
      </div>

      {error ? (
        <Alert variant="destructive">
          <AlertTitle>基准单位加载失败</AlertTitle>
          <AlertDescription className="flex items-center justify-between gap-3">
            <span>{error}</span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setRetryToken((current) => current + 1)}
            >
              重试加载
            </Button>
          </AlertDescription>
        </Alert>
      ) : loading ? (
        <Skeleton className="h-10 w-full" />
      ) : options.length ? (
        <Select value={value} onValueChange={onChange}>
          <SelectTrigger aria-label="选择基准单位">
            <SelectValue placeholder="选择基准单位" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {options.map((unit) => (
                <SelectItem key={unit.id} value={unit.id}>
                  {unit.name}（{unit.symbol}） · {unit.code}
                  {pinned?.id === unit.id &&
                  !result.list.some((item) => item.id === unit.id)
                    ? " · 当前关联"
                    : ""}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      ) : (
        <Empty className="border p-3">
          <EmptyHeader>
            <EmptyTitle>没有可选基准单位</EmptyTitle>
            <EmptyDescription>
              调整关键词，或先创建并启用一个基准单位。
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}

      {!error && !loading ? (
        <div className="flex items-center justify-between gap-2">
          <Badge variant="outline" className="tabular-nums">
            第 {result.pagination.page} / {totalPages} 页
          </Badge>
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={page <= 1}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
            >
              <ChevronLeft data-icon="inline-start" />
              上一页
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={page >= totalPages}
              onClick={() => setPage((current) => current + 1)}
            >
              下一页
              <ChevronRight data-icon="inline-end" />
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
