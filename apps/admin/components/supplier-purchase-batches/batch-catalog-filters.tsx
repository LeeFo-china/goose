"use client";

import { Button } from "@/components/ui/button";

import {
  loadBatchCatalogCategories,
  loadBatchCatalogSuppliers,
} from "./batch-api";
import { BatchOptionPicker } from "./batch-option-picker";
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
    <div className="grid gap-3 md:grid-cols-2">
      <div className="min-w-0 space-y-1.5">
        <BatchOptionPicker
          id="batch-catalog-category"
          label="商品分类"
          value={value.category}
          load={loadBatchCatalogCategories}
          disabled={disabled}
          onChange={(category) => onChange({ ...value, category })}
        />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={disabled || value.category === null}
          onClick={() => onChange({ ...value, category: null })}
        >
          全部分类
        </Button>
      </div>
      <div className="min-w-0 space-y-1.5">
        <BatchOptionPicker
          id="batch-catalog-supplier"
          label="供应商"
          value={value.supplier}
          load={loadBatchCatalogSuppliers}
          disabled={disabled}
          onChange={(supplier) => onChange({ ...value, supplier })}
        />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={disabled || value.supplier === null}
          onClick={() => onChange({ ...value, supplier: null })}
        >
          全部供应商
        </Button>
      </div>
    </div>
  );
}
