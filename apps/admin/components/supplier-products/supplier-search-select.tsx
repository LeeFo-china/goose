import { Search } from "lucide-react";

import { FormSelect } from "@/components/admin/form-select";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

import type { PageData } from "./supplier-product-types";

type SupplierOption = { id: string; code: string; name: string };

export function SupplierSearchSelect<T extends SupplierOption>({
  id,
  label,
  searchLabel,
  value,
  page,
  result,
  keyword,
  loading,
  onKeywordChange,
  onSearch,
  onPageChange,
  onChange,
}: {
  id: string;
  label: string;
  searchLabel: string;
  value: string;
  page: number;
  result: PageData<T>;
  keyword: string;
  loading: boolean;
  onKeywordChange: (value: string) => void;
  onSearch: () => void;
  onPageChange: (page: number) => void;
  onChange: (value: string) => void;
}) {
  const totalPages = Math.max(1, result.pagination.totalPages || 1);
  return (
    <div className="grid gap-3 rounded-lg border bg-card p-3 2xl:grid-cols-[minmax(28rem,0.9fr)_minmax(32rem,1.1fr)] 2xl:items-end">
      <div className="flex min-w-0 gap-2">
        <Input
          aria-label={searchLabel}
          className="min-w-0 flex-1"
          value={keyword}
          placeholder={`输入${label}名称或编码`}
          onChange={(event) => onKeywordChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") onSearch();
          }}
        />
        <Button
          type="button"
          variant="outline"
          className="shrink-0"
          disabled={loading}
          onClick={onSearch}
        >
          <Search data-icon="inline-start" />
          {searchLabel}
        </Button>
      </div>
      <Field className="min-w-0">
        <FieldLabel htmlFor={id}>{label}</FieldLabel>
        <div className="flex min-w-0 gap-2">
          <FormSelect
            id={id}
            value={value}
            triggerClassName="min-w-0 flex-1"
            placeholder={result.list.length ? `请选择${label}` : "没有匹配结果"}
            disabled={loading || result.list.length === 0}
            options={result.list.map((item) => ({
              value: item.id,
              label: `${item.name} · ${item.code}`,
            }))}
            onChange={onChange}
          />
          <Button
            type="button"
            variant="outline"
            className="shrink-0"
            aria-label={`${label}上一页`}
            disabled={loading || page <= 1}
            onClick={() => onPageChange(Math.max(1, page - 1))}
          >
            上一页
          </Button>
          <Button
            type="button"
            variant="outline"
            className="shrink-0"
            aria-label={`${label}下一页`}
            disabled={loading || page >= totalPages}
            onClick={() => onPageChange(page + 1)}
          >
            下一页
          </Button>
        </div>
      </Field>
    </div>
  );
}
