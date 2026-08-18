"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { DataTable } from "@/components/admin/data-table";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

import { loadSupplierSkus } from "./supplier-product-api";
import { SupplierProductDialog } from "./supplier-product-dialog";
import {
  getProductWriteState,
  nextProductAction,
  supplierProductSource,
} from "./supplier-product-rules";
import { SupplierProductSourceBadge } from "./supplier-product-source-badge";
import { createLatestRequestGate } from "./supplier-request-gate";
import { SupplierSkuDialog } from "./supplier-sku-dialog";
import { SupplierSkuTable } from "./supplier-sku-table";
import { SupplierStatusDialog, type MutationTarget } from "./supplier-status-dialog";
import type {
  ProductApiScope,
  SupplierProduct,
  SupplierProductPage,
  SupplierSku,
  SupplierSkuPage,
  TenantSupplierRelationship,
} from "./supplier-product-types";

const emptySkus: SupplierSkuPage = {
  list: [],
  pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
};

export function SupplierProductList({
  scope,
  relationship,
  products,
  loading,
  canManage,
  onRefresh,
  onAvailableSkusChange,
}: {
  scope: ProductApiScope;
  relationship?: TenantSupplierRelationship;
  products: SupplierProductPage;
  loading: boolean;
  canManage: boolean;
  onRefresh: () => void | Promise<void>;
  onAvailableSkusChange: (skus: SupplierSku[]) => void;
}) {
  const [selected, setSelected] = useState<SupplierProduct | null>(null);
  const [skus, setSkus] = useState(emptySkus);
  const [skuPage, setSkuPage] = useState(1);
  const [skuLoading, setSkuLoading] = useState(false);
  const [mutation, setMutation] = useState<MutationTarget>(null);
  const skuRequests = useRef(createLatestRequestGate());

  const loadSkus = useCallback(async (
    product: SupplierProduct,
    requestedPage = skuPage,
  ) => {
    const request = skuRequests.current.begin();
    setSkuLoading(true);
    try {
      const result = await loadSupplierSkus(scope, product.id, requestedPage);
      if (!skuRequests.current.isCurrent(request)) return;
      setSkus(result);
      setSkuPage(requestedPage);
      onAvailableSkusChange(result.list);
    } catch (error) {
      if (skuRequests.current.isCurrent(request)) {
        toast.error(error instanceof Error ? error.message : "SKU 加载失败");
      }
    } finally {
      if (skuRequests.current.isCurrent(request)) setSkuLoading(false);
    }
  }, [onAvailableSkusChange, scope, skuPage]);

  useEffect(() => {
    if (!selected) {
      skuRequests.current.invalidate();
      setSkus(emptySkus);
      onAvailableSkusChange([]);
      return;
    }
    const latest = products.list.find(({ id }) => id === selected.id);
    if (!latest) setSelected(null);
    else if (latest !== selected) setSelected(latest);
  }, [onAvailableSkusChange, products.list, selected]);

  useEffect(() => () => skuRequests.current.invalidate(), []);

  const columns = useMemo<ColumnDef<SupplierProduct>[]>(() => [
    {
      accessorKey: "name",
      header: "商品",
      cell: ({ row }) => (
        <div className="flex flex-col gap-1">
          <span className="font-medium">{row.original.name}</span>
          <span className="text-xs text-muted-foreground">{row.original.product_code}</span>
        </div>
      ),
    },
    {
      id: "source",
      header: "来源",
      cell: ({ row }) => (
        <SupplierProductSourceBadge source={supplierProductSource(row.original)} />
      ),
    },
    {
      id: "catalog",
      header: "分类 / 品牌",
      cell: ({ row }) => (
        <div className="flex flex-col gap-1">
          <span>{row.original.category.name}</span>
          <span className="text-xs text-muted-foreground">{row.original.brand.name}</span>
        </div>
      ),
    },
    {
      accessorKey: "status",
      header: "状态",
      cell: ({ row }) => statusLabel(row.original.status),
    },
    {
      id: "actions",
      header: "操作",
      cell: ({ row }) => {
        const writable = productWritable(scope, canManage, relationship, row.original);
        return (
          <div className="flex flex-wrap gap-1">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                setSelected(row.original);
                setSkuPage(1);
                void loadSkus(row.original, 1);
              }}
            >
              查看 SKU
            </Button>
            {writable ? (
              <>
                <SupplierProductDialog scope={scope} product={row.original} onSaved={onRefresh} />
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => setMutation({
                    kind: "product",
                    id: row.original.id,
                    name: row.original.name,
                    action: nextProductAction(row.original),
                    version: row.original.version,
                  })}
                >
                  {row.original.status === "active" ? "停用商品" : "启用商品"}
                </Button>
              </>
            ) : null}
          </div>
        );
      },
    },
  ], [canManage, loadSkus, onRefresh, relationship, scope]);

  if (loading && products.list.length === 0) {
    return (
      <div className="flex flex-col gap-2 p-4">
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-full" />
      </div>
    );
  }

  const selectedWritable = selected
    ? productWritable(scope, canManage, relationship, selected)
    : false;
  return (
    <div className="flex flex-col gap-5">
      <DataTable data={products.list} columns={columns} emptyText="当前供应商还没有商品" minWidth="min-w-[840px]" />
      {selected ? (
        <div className="flex flex-col gap-3 border-t px-5 py-4">
          <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
            <div>
              <h2 className="text-base font-semibold">{selected.name} · SKU</h2>
              <p className="text-sm text-muted-foreground">
                结构化规格与单位换算会进入后续采购快照。
              </p>
            </div>
            <div className="flex gap-2">
              <Button type="button" size="sm" variant="ghost" disabled={skuLoading} onClick={() => void loadSkus(selected)}>
                <RefreshCw data-icon="inline-start" />
                刷新
              </Button>
              {selectedWritable ? (
                <SupplierSkuDialog scope={scope} product={selected} disabled={skuLoading || selected.status === "inactive"} onSaved={() => loadSkus(selected, 1)} />
              ) : null}
            </div>
          </div>
          <SupplierSkuTable
            scope={scope}
            product={selected}
            skus={skus}
            loading={skuLoading}
            canManage={selectedWritable}
            onMutate={setMutation}
            onRefresh={() => loadSkus(selected)}
            onPageChange={(nextPage) => loadSkus(selected, nextPage)}
          />
        </div>
      ) : null}
      <SupplierStatusDialog
        target={mutation}
        scope={scope}
        onOpenChange={(open) => {
          if (!open) setMutation(null);
        }}
        onChanged={async () => {
          await onRefresh();
          if (selected) await loadSkus(selected);
        }}
      />
    </div>
  );
}

function productWritable(
  scope: ProductApiScope,
  canManage: boolean,
  relationship: TenantSupplierRelationship | undefined,
  product: SupplierProduct,
) {
  if (scope.kind === "platform") return canManage;
  if (!relationship) return false;
  return getProductWriteState({ canManage, relationship, product }).writable;
}

function statusLabel(status: string) {
  if (status === "active") return "已启用";
  if (status === "draft") return "草稿";
  return "已停用";
}
