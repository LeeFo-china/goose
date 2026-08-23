"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Field, FieldLabel } from "@/components/ui/field";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

import { loadCatalogOptions } from "./supplier-product-api";
import type {
  CatalogOption,
  PageData,
  ProductApiScope,
} from "./supplier-product-types";

const emptyPage: PageData<CatalogOption> = {
  list: [],
  pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
};

const labels = {
  categories: "分类",
  brands: "品牌",
  units: "单位",
} as const;

export function CatalogSearchSelect({
  id,
  kind,
  scope,
  value,
  label: customLabel,
  selectedOption,
  onChange,
}: {
  id: string;
  kind: keyof typeof labels;
  scope: ProductApiScope;
  value: string;
  label?: string;
  selectedOption?: CatalogOption | null;
  onChange: (value: string) => void;
}) {
  const [result, setResult] = useState(emptyPage);
  const [page, setPage] = useState(1);
  const [keyword, setKeyword] = useState("");
  const [appliedKeyword, setAppliedKeyword] = useState("");
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const label = customLabel ?? labels[kind];

  useEffect(() => {
    let active = true;
    setLoading(true);
    void loadCatalogOptions(kind, scope, page, appliedKeyword)
      .then((data) => {
        if (active) setResult(data);
      })
      .catch((error) => {
        if (active) {
          toast.error(error instanceof Error ? error.message : `${label}加载失败`);
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [appliedKeyword, kind, label, page, scope]);

  const options = useMemo(() => {
    const list = selectedOption && !result.list.some(({ id }) => id === selectedOption.id)
      ? [selectedOption, ...result.list]
      : result.list;
    return list.map((option) => ({
      value: option.id,
      label: catalogOptionLabel(option),
    }));
  }, [result.list, selectedOption]);
  const totalPages = Math.max(1, result.pagination.totalPages || 1);
  const selected = options.find((option) => option.value === value);
  const isTriggerDisabled = loading && options.length === 0;
  const triggerText = selected?.label
    ?? (loading ? `${label}加载中...` : `请选择${label}`);

  return (
    <Field data-disabled={loading}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            disabled={isTriggerDisabled}
            className="w-full justify-between"
          >
            <span className="truncate">{triggerText}</span>
            <ChevronsUpDown data-icon="inline-end" className="opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
          <Command shouldFilter={false}>
            <CommandInput
              value={keyword}
              placeholder={`搜索${label}名称或编码`}
              onValueChange={(nextKeyword) => {
                setKeyword(nextKeyword);
                setPage(1);
                setAppliedKeyword(nextKeyword.trim());
              }}
            />
            <CommandList>
              <CommandEmpty>
                {loading ? `${label}加载中...` : `暂无${label}`}
              </CommandEmpty>
              <CommandGroup>
                {options.map((option) => (
                  <CommandItem
                    key={option.value}
                    disabled={loading}
                    value={option.label}
                    onSelect={() => {
                      if (loading) return;
                      onChange(option.value);
                      setOpen(false);
                    }}
                  >
                    <Check
                      data-icon="inline-start"
                      className={cn(
                        value === option.value ? "opacity-100" : "opacity-0",
                      )}
                    />
                    <span className="truncate">{option.label}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
            {totalPages > 1 ? (
              <div className="flex items-center justify-between border-t p-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={loading || page <= 1}
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                >
                  上一页
                </Button>
                <span className="text-xs text-muted-foreground">
                  {page} / {totalPages}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={loading || page >= totalPages}
                  onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                >
                  下一页
                </Button>
              </div>
            ) : null}
          </Command>
        </PopoverContent>
      </Popover>
    </Field>
  );
}

export function catalogOptionLabel(option: CatalogOption): string {
  const name = option.full_name ?? option.name;
  const symbol = option.symbol ? `（${option.symbol}）` : "";
  const source = option.ownership_scope
    ? ` · ${option.ownership_scope === "tenant" ? "租户私有" : "平台标准"}`
    : "";
  return `${name}${symbol} · ${option.code}${source}`;
}
