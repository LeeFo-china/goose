'use client';

import { Button } from '@/components/ui/button';
import { FormSelect } from '@/components/admin/form-select';
import { Field, FieldLabel } from '@/components/ui/field';
import { formatInventoryDecimal } from '@/components/inventory/inventory-rules';
import type { InventoryPagination } from '@/components/inventory/inventory-types';

export const materialMoney = (value: string | null) =>
  value === null ? '待确认' : formatInventoryDecimal(value);
export function MaterialPager({
  pagination,
  disabled,
  onPage,
  onSize,
}: {
  pagination?: InventoryPagination;
  disabled?: boolean;
  onPage: (page: number) => void;
  onSize?: (size: number) => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 py-3">
      <span className="text-xs text-muted-foreground">
        共 {pagination?.total ?? 0} 条 · 第 {pagination?.page ?? 1} /{' '}
        {Math.max(1, pagination?.totalPages ?? 1)} 页
      </span>
      <div className="flex flex-wrap items-center gap-2">
        {onSize && (
          <Field orientation="horizontal">
            <FieldLabel htmlFor="materials-page-size">每页</FieldLabel>
            <FormSelect
              id="materials-page-size"
              value={String(pagination?.pageSize ?? 20)}
              options={[20, 50, 100].map((size) => ({
                value: String(size),
                label: String(size),
              }))}
              onChange={(value) => onSize(Number(value))}
              disabled={disabled}
            />
          </Field>
        )}
        <Button
          size="sm"
          variant="outline"
          disabled={disabled || !pagination || pagination.page <= 1}
          onClick={() => onPage((pagination?.page ?? 1) - 1)}
        >
          上一页
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={
            disabled || !pagination || pagination.page >= pagination.totalPages
          }
          onClick={() => onPage((pagination?.page ?? 1) + 1)}
        >
          下一页
        </Button>
      </div>
    </div>
  );
}
