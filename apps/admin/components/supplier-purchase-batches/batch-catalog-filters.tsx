"use client";

import { useId, useState } from "react";
import { ChevronDown, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

import {
  loadBatchCatalogCategories,
  loadBatchCatalogSuppliers,
} from "./batch-api";
import {
  type BatchOptionLoader,
  BatchOptionPicker,
} from "./batch-option-picker";
import type { NamedOption } from "./batch-types";

export type BatchCatalogFilterState = {
  category: NamedOption | null;
  supplier: NamedOption | null;
};

export function BatchCatalogFilters({
  value,
  disabled,
  onChange,
}: {
  value: BatchCatalogFilterState;
  disabled: boolean;
  onChange: (value: BatchCatalogFilterState) => void;
}) {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      <CatalogFilterPicker
        label="商品分类"
        emptyLabel="全部分类"
        value={value.category}
        load={loadBatchCatalogCategories}
        disabled={disabled}
        onChange={(category) => onChange({ ...value, category })}
        onClear={() => onChange({ ...value, category: null })}
      />
      <CatalogFilterPicker
        label="供应商"
        emptyLabel="全部供应商"
        value={value.supplier}
        load={loadBatchCatalogSuppliers}
        disabled={disabled}
        onChange={(supplier) => onChange({ ...value, supplier })}
        onClear={() => onChange({ ...value, supplier: null })}
      />
    </div>
  );
}

function CatalogFilterPicker({
  label,
  emptyLabel,
  value,
  load,
  disabled,
  onChange,
  onClear,
}: {
  label: string;
  emptyLabel: string;
  value: NamedOption | null;
  load: BatchOptionLoader;
  disabled: boolean;
  onChange: (value: NamedOption) => void;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(false);
  const pickerId = `${useId()}-catalog-filter`;
  const currentLabel = value?.name ?? emptyLabel;
  return (
    <div className="flex min-w-0 max-w-full items-center">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled}
            aria-label={`${label}：${currentLabel}`}
            className="min-h-11 min-w-0 max-w-52 justify-between gap-1.5 rounded-r-none md:min-h-9"
          >
            <span className="truncate">{currentLabel}</span>
            <ChevronDown className="size-4 shrink-0" aria-hidden="true" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          role="dialog"
          aria-label={`筛选${label}`}
          align="start"
          collisionPadding={12}
          className="w-[min(24rem,calc(100vw-2rem))] p-4"
        >
          <BatchOptionPicker
            id={pickerId}
            label={label}
            value={value}
            load={load}
            disabled={disabled}
            onChange={(next) => {
              onChange(next);
              setOpen(false);
            }}
          />
        </PopoverContent>
      </Popover>
      <Button
        type="button"
        variant="outline"
        size="icon"
        disabled={disabled || !value}
        aria-label={`清除${label}筛选`}
        className="min-h-11 min-w-11 rounded-l-none border-l-0 md:min-h-9 md:min-w-9"
        onClick={onClear}
      >
        <X className="size-4" aria-hidden="true" />
      </Button>
    </div>
  );
}
