"use client";

import { StatusAlert } from "@/components/admin/status-alert";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatPurchaseMoney } from "./purchase-order-rules";
import type {
  PurchaseOrderItem,
  PurchaseOrderItemPage,
} from "./purchase-order-types";

export function PurchaseOrderItemTable(
  { items, pagination, loading, error, onLoadMore }: {
    items: PurchaseOrderItem[];
    pagination: PurchaseOrderItemPage["pagination"];
    loading: boolean;
    error: string | null;
    onLoadMore: () => void;
  },
) {
  return (
    <div className="min-w-0 max-w-full rounded-md border">
      <Table containerClassName="min-w-0 max-w-full overflow-x-auto">
        <TableHeader>
          <TableRow>
            <TableHead>商品 / SKU</TableHead>
            <TableHead>单位</TableHead>
            <TableHead className="text-right">数量</TableHead>
            <TableHead className="text-right">单价</TableHead>
            <TableHead className="text-right">含税金额</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => (
            <TableRow key={item.id}>
              <TableCell>
                <div className="font-medium">{item.product_name_snapshot}</div>
                <div className="text-xs text-muted-foreground">
                  {item.sku_name_snapshot} · {item.sku_code_snapshot}
                </div>
              </TableCell>
              <TableCell>{item.purchase_unit_symbol_snapshot}</TableCell>
              <TableCell className="text-right font-mono tabular-nums">
                {item.quantity}
              </TableCell>
              <TableCell className="text-right font-mono tabular-nums">
                {formatPurchaseMoney(item.unit_price)}
              </TableCell>
              <TableCell className="text-right font-mono tabular-nums">
                {formatPurchaseMoney(item.total_amount)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t p-3">
        <span className="text-xs text-muted-foreground">
          已显示 {items.length} 条，共 {pagination.total} 条
        </span>
        {pagination.page < pagination.totalPages && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={loading}
            onClick={onLoadMore}
          >
            {loading ? "正在加载明细…" : "加载更多明细"}
          </Button>
        )}
      </div>
      {error && <StatusAlert>{error}</StatusAlert>}
    </div>
  );
}
