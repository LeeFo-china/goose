"use client";

import { useEffect, useState } from "react";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { batchError } from "./batch-rules";
import { BatchPager } from "./batch-page-parts";
import type { NamedOption, PageData } from "./batch-types";

export type BatchOptionLoader = (
  page: number,
  keyword: string,
  signal?: AbortSignal,
) => Promise<PageData<NamedOption>>;
export function BatchOptionPicker({
  id,
  label,
  value,
  load,
  onChange,
  disabled = false,
}: {
  id: string;
  label: string;
  value: NamedOption | null;
  load: BatchOptionLoader;
  onChange: (value: NamedOption) => void;
  disabled?: boolean;
}) {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [keyword, setKeyword] = useState("");
  const [result, setResult] = useState<PageData<NamedOption> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    load(page, keyword, controller.signal).then((next) => {
      if (controller.signal.aborted) return;
      if (page > Math.max(1, next.pagination.totalPages)) {
        setPage(Math.max(1, next.pagination.totalPages));
        return;
      }
      setResult(next);
    }).catch((caught: unknown) => {
      if (!controller.signal.aborted) setError(batchError(caught));
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [load, page, keyword, retry]);
  const options = loading || error ? [] : result?.list ?? [];
  const allOptions = value && !options.some((option) => option.id === value.id)
    ? [value, ...options]
    : options;
  return (
    <Field className="min-w-0">
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <div className="flex gap-2">
        <Input
          aria-label={`搜索${label}`}
          value={search}
          disabled={disabled}
          maxLength={80}
          placeholder={`搜索${label}`}
          onChange={(event) => setSearch(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              setPage(1);
              setKeyword(search);
            }
          }}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          onClick={() => {
            setPage(1);
            setKeyword(search);
          }}
        >
          搜索
        </Button>
      </div>
      <Select
        value={value?.id ?? ""}
        disabled={disabled || loading}
        onValueChange={(nextId) => {
          const next = allOptions.find((option) => option.id === nextId);
          if (next) onChange(next);
        }}
      >
        <SelectTrigger id={id}>
          <SelectValue placeholder={loading ? "正在加载…" : `请选择${label}`} />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {allOptions.map((option) => (
              <SelectItem key={option.id} value={option.id}>
                {option.name}
                {option.status === "inactive" ? "（已停用）" : ""}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
      {error
        ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
            <Button
              type="button"
              variant="link"
              size="sm"
              onClick={() => setRetry((value) => value + 1)}
            >
              重试
            </Button>
          </p>
        )
        : !loading && !options.length
        ? <p className="text-sm text-muted-foreground">暂无可选{label}</p>
        : null}
      <BatchPager
        pagination={result?.pagination}
        loading={loading || disabled}
        onPage={setPage}
      />
    </Field>
  );
}
