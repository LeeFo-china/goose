'use client';
import type { InventoryPagination } from './inventory-types';
import { Button } from '@/components/ui/button';
export function InventoryDocumentPager({
  pagination,
  label = '库存单据分页',
  onPage,
}: {
  pagination?: InventoryPagination;
  label?: string;
  onPage: (page: number) => void;
}) {
  return (
    <div
      role="navigation"
      aria-label={label}
      className="flex flex-wrap items-center justify-between gap-3 py-3"
    >
      <span className="text-xs text-muted-foreground">
        共 {pagination?.total ?? 0} 条 · 第 {pagination?.page ?? 1} /{' '}
        {Math.max(1, pagination?.totalPages ?? 1)} 页
      </span>
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={!pagination || pagination.page <= 1}
          onClick={() => onPage((pagination?.page ?? 1) - 1)}
        >
          上一页
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={!pagination || pagination.page >= pagination.totalPages}
          onClick={() => onPage((pagination?.page ?? 1) + 1)}
        >
          下一页
        </Button>
      </div>
    </div>
  );
}
