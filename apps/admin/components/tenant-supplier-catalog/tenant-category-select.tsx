"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { toast } from "sonner";

import type { CatalogPage } from "@/components/supplier-catalog/supplier-catalog-types";
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
import { requestBackendJson } from "@/lib/backend-client";
import { cn } from "@/lib/utils";

import { buildTenantCategoryOptionListPath } from "./tenant-catalog-requests";
import type { TenantCatalogCategory } from "./tenant-catalog-types";

const PAGE_SIZE = 20;
const emptyPage: CatalogPage<TenantCatalogCategory> = {
  list: [],
  pagination: { page: 1, pageSize: PAGE_SIZE, total: 0, totalPages: 0 },
};
type TenantCategoryOption = Pick<TenantCatalogCategory, "id" | "code" | "name"> & {
  full_name?: string;
  status?: "active" | "inactive";
};

export function TenantCategorySelect({
  id,
  value,
  selectedCategory,
  onChange,
}: {
  id: string;
  value: string;
  selectedCategory?: TenantCategoryOption | null;
  onChange: (value: string) => void;
}) {
  const [result, setResult] = useState(emptyPage);
  const [keyword, setKeyword] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    void requestBackendJson<CatalogPage<TenantCatalogCategory>>(
      buildTenantCategoryOptionListPath({ page, pageSize: PAGE_SIZE, keyword }),
      { fallbackMessage: "分类加载失败" },
    )
      .then((data) => {
        if (active) setResult(data);
      })
      .catch((error) => {
        if (active) {
          toast.error(error instanceof Error ? error.message : "分类加载失败");
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [keyword, page]);

  const options = useMemo(() => {
    const selected = selectedCategory && !result.list.some(({ id: optionId }) =>
      optionId === selectedCategory.id
    )
      ? [selectedCategory, ...result.list]
      : result.list;
    return selected.map((category) => ({
      value: category.id,
      label: category.full_name ?? category.name,
    }));
  }, [result.list, selectedCategory]);
  const selected = options.find((option) => option.value === value);
  const totalPages = Math.max(1, result.pagination.totalPages || 1);

  return (
    <Field data-disabled={loading}>
      <FieldLabel htmlFor={id}>所属分类</FieldLabel>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            disabled={loading && options.length === 0}
            className="w-full justify-between"
          >
            <span className="truncate">
              {selected?.label ?? (loading ? "分类加载中..." : "请选择所属分类")}
            </span>
            <ChevronsUpDown data-icon="inline-end" className="opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
          <Command shouldFilter={false}>
            <CommandInput
              value={keyword}
              placeholder="搜索分类名称"
              onValueChange={(nextKeyword) => {
                setKeyword(nextKeyword.trim());
                setPage(1);
              }}
            />
            <CommandList>
              <CommandEmpty>{loading ? "分类加载中..." : "暂无分类"}</CommandEmpty>
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
                      className={cn(value === option.value ? "opacity-100" : "opacity-0")}
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
                <span className="text-xs text-muted-foreground">{page} / {totalPages}</span>
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
