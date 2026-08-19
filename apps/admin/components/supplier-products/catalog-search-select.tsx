"use client";

import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { toast } from "sonner";

import { FormSelect } from "@/components/admin/form-select";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

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

  return (
    <Field data-disabled={loading}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <div className="flex gap-2">
        <Input
          aria-label={`搜索${label}`}
          value={keyword}
          placeholder={`名称或编码`}
          onChange={(event) => setKeyword(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              setPage(1);
              setAppliedKeyword(keyword.trim());
            }
          }}
        />
        <Button
          type="button"
          size="icon"
          variant="outline"
          aria-label={`检索${label}`}
          disabled={loading}
          onClick={() => {
            setPage(1);
            setAppliedKeyword(keyword.trim());
          }}
        >
          <Search />
        </Button>
      </div>
      <div className="flex gap-2">
        <FormSelect
          id={id}
          value={value}
          placeholder={`请选择${label}`}
          options={options}
          disabled={loading || options.length === 0}
          onChange={onChange}
        />
        <Button
          type="button"
          variant="outline"
          aria-label={`${label}上一页`}
          disabled={loading || page <= 1}
          onClick={() => setPage((current) => Math.max(1, current - 1))}
        >
          上一页
        </Button>
        <Button
          type="button"
          variant="outline"
          aria-label={`${label}下一页`}
          disabled={loading || page >= totalPages}
          onClick={() => setPage((current) => current + 1)}
        >
          下一页
        </Button>
      </div>
    </Field>
  );
}

function catalogOptionLabel(option: CatalogOption) {
  const name = option.full_name ?? option.name;
  const symbol = option.symbol ? `（${option.symbol}）` : "";
  const source = option.ownership_scope
    ? ` · ${option.ownership_scope === "tenant" ? "租户私有" : "平台标准"}`
    : "";
  return `${name}${symbol} · ${option.code}${source}`;
}
