"use client";

import { useMemo } from "react";
import type { ColumnDef } from "@tanstack/react-table";

import { DataTable } from "@/components/admin/data-table";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

import { nextSkuAction } from "./supplier-product-rules";
import { SupplierSkuDialog } from "./supplier-sku-dialog";
import type { MutationTarget } from "./supplier-status-dialog";
import type {
  ProductApiScope,
  SupplierProduct,
  SupplierSku,
  SupplierSkuPage,
} from "./supplier-product-types";
import { SupplierUnitConversionDialog } from "./supplier-unit-conversion-dialog";

export function SupplierSkuTable({
  scope,
  product,
  skus,
  loading,
  canManage,
  onMutate,
  onRefresh,
  onPageChange,
}: {
  scope: ProductApiScope;
  product: SupplierProduct;
  skus: SupplierSkuPage;
  loading: boolean;
  canManage: boolean;
  onMutate: (target: MutationTarget) => void;
  onRefresh: () => void | Promise<void>;
  onPageChange: (page: number) => void | Promise<void>;
}) {
  const columns = useMemo<ColumnDef<SupplierSku>[]>(() => [
    {
      accessorKey: "name",
      header: "SKU",
      cell: ({ row }) => (
        <div className="flex flex-col gap-1">
          <span className="font-medium">{row.original.name}</span>
          {scope.kind === "platform" ? (
            <span className="text-xs text-muted-foreground">{row.original.sku_code}</span>
          ) : null}
        </div>
      ),
    },
    {
      id: "spec",
      header: "结构化规格",
      cell: ({ row }) => specSummary(row.original),
    },
    {
      id: "unit",
      header: "采购单位",
      cell: ({ row }) => `${row.original.purchase_unit.name}（${row.original.purchase_unit.symbol}）`,
    },
    { accessorKey: "status", header: "状态", cell: ({ row }) => statusLabel(row.original.status) },
    {
      id: "actions",
      header: "操作",
      cell: ({ row }) => {
        const writable = canManage && (scope.kind === "platform" || row.original.ownership_scope === "tenant");
        return (
          <div className="flex flex-wrap gap-1">
            {writable ? (
              <SupplierSkuDialog scope={scope} product={product} sku={row.original} onSaved={onRefresh} />
            ) : null}
            <SupplierUnitConversionDialog
              scope={scope}
              productId={product.id}
              sku={row.original}
              readOnly={!writable}
              onSaved={onRefresh}
            />
            {writable ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => onMutate({
                  kind: "sku",
                  id: row.original.id,
                  supplierProductId: row.original.supplier_product_id,
                  name: row.original.name,
                  action: nextSkuAction(row.original),
                  version: row.original.version,
                })}
              >
                {row.original.status === "active" ? "停用 SKU" : "启用 SKU"}
              </Button>
            ) : null}
          </div>
        );
      },
    },
  ], [canManage, onMutate, onRefresh, product, scope]);

  if (loading) return <Skeleton className="h-32 w-full" />;
  const totalPages = Math.max(1, skus.pagination.totalPages || 1);
  return (
    <div className="flex flex-col gap-3">
      <DataTable data={skus.list} columns={columns} emptyText="该商品还没有 SKU" minWidth="min-w-[820px]" />
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <span className="text-sm text-muted-foreground">
          SKU 第 {skus.pagination.page} / {totalPages} 页，共 {skus.pagination.total} 个
        </span>
        <div className="flex gap-2">
          <Button type="button" size="sm" variant="outline" disabled={skus.pagination.page <= 1} onClick={() => void onPageChange(skus.pagination.page - 1)}>上一页</Button>
          <Button type="button" size="sm" variant="outline" disabled={skus.pagination.page >= totalPages} onClick={() => void onPageChange(skus.pagination.page + 1)}>下一页</Button>
        </div>
      </div>
    </div>
  );
}

function specSummary(sku: SupplierSku) {
  const values = Object.values(sku.spec_values ?? {}).flatMap((value) =>
    Array.isArray(value) ? value : [String(value)]);
  return values.length > 0 ? values.join(" / ") : sku.specification || "-";
}

function statusLabel(status: string) {
  if (status === "active") return "已启用";
  if (status === "draft") return "草稿";
  return "已停用";
}
