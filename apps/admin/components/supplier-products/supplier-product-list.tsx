"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { DataTable } from "@/components/admin/data-table";
import { CostCategoryRuleDialog } from "@/components/supplier-cost-category/cost-category-rule-dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

import { loadSupplierProduct, loadSupplierSkus } from "./supplier-product-api";
import { buildSupplierProductDrilldownHref } from "./supplier-product-drilldown";
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
  canManageCatalog,
  inlinePriceEnabled = false,
  onRefresh,
  onAvailableSkusChange,
  onSkuWorkspaceChange,
}: {
  scope: ProductApiScope;
  relationship?: TenantSupplierRelationship;
  products: SupplierProductPage;
  loading: boolean;
  canManage: boolean;
  canManageCatalog: boolean;
  inlinePriceEnabled?: boolean;
  onRefresh: () => void | Promise<void>;
  onAvailableSkusChange: (skus: SupplierSku[]) => void;
  onSkuWorkspaceChange?: (visible: boolean) => void;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [selected, setSelected] = useState<SupplierProduct | null>(null);
  const [skus, setSkus] = useState(emptySkus);
  const [skuPage, setSkuPage] = useState(1);
  const [skuLoading, setSkuLoading] = useState(false);
  const [productRestoring, setProductRestoring] = useState(false);
  const [mutation, setMutation] = useState<MutationTarget>(null);
  const skuRequests = useRef(createLatestRequestGate());
  const productRequests = useRef(createLatestRequestGate());
  const handledSearch = useRef<string | null>(null);
  const requestedProductId = searchParams.get("productId");
  const currentRequestedProductId = useRef(requestedProductId);
  currentRequestedProductId.current = requestedProductId;
  const search = searchParams.toString();

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

  const openSkuWorkspace = useCallback((product: SupplierProduct) => {
    productRequests.current.invalidate();
    setProductRestoring(false);
    setSelected(product);
    setSkuPage(1);
    router.push(
      buildSupplierProductDrilldownHref(pathname, search, product.id, scope),
      { scroll: false },
    );
    void loadSkus(product, 1);
  }, [loadSkus, pathname, router, scope, search]);

  const closeSkuWorkspace = useCallback(() => {
    productRequests.current.invalidate();
    skuRequests.current.invalidate();
    setProductRestoring(false);
    setSelected(null);
    router.push(
      buildSupplierProductDrilldownHref(pathname, search, null),
      { scroll: false },
    );
  }, [pathname, router, search]);

  const refreshSkuWorkspace = useCallback(async (
    product: SupplierProduct,
    requestedPage = skuPage,
  ) => {
    const request = productRequests.current.begin();
    setProductRestoring(true);
    try {
      const [latestProduct] = await Promise.all([
        loadSupplierProduct(scope, product.id),
        loadSkus(product, requestedPage),
        onRefresh(),
      ]);
      if (
        productRequests.current.isCurrent(request)
        && currentRequestedProductId.current === product.id
      ) setSelected(latestProduct);
    } catch (error) {
      if (
        productRequests.current.isCurrent(request)
        && currentRequestedProductId.current === product.id
      ) {
        toast.error(error instanceof Error ? error.message : "SKU 刷新失败");
      }
    } finally {
      if (
        productRequests.current.isCurrent(request)
        && currentRequestedProductId.current === product.id
      ) setProductRestoring(false);
    }
  }, [loadSkus, onRefresh, scope, skuPage]);

  useEffect(() => {
    if (handledSearch.current === search) return;
    productRequests.current.invalidate();
    setProductRestoring(false);
    if (!requestedProductId) {
      skuRequests.current.invalidate();
      setProductRestoring(false);
      handledSearch.current = search;
      setSelected(null);
      return;
    }

    handledSearch.current = search;
    const requested = products.list.find(({ id }) => id === requestedProductId);
    if (!requested) {
      const request = productRequests.current.begin();
      setProductRestoring(true);
      void loadSupplierProduct(scope, requestedProductId)
        .then((product) => {
          if (
            !productRequests.current.isCurrent(request)
            || currentRequestedProductId.current !== requestedProductId
          ) return;
          setSelected(product);
          setSkuPage(1);
          void loadSkus(product, 1);
        })
        .catch((error) => {
          if (
            !productRequests.current.isCurrent(request)
            || currentRequestedProductId.current !== requestedProductId
          ) return;
          toast.error(error instanceof Error ? error.message : "供应商商品加载失败");
          router.replace(
            buildSupplierProductDrilldownHref(pathname, search, null),
            { scroll: false },
          );
        })
        .finally(() => {
          if (
            productRequests.current.isCurrent(request)
            && currentRequestedProductId.current === requestedProductId
          ) setProductRestoring(false);
        });
      return;
    }
    if (selected?.id !== requested.id) {
      setSelected(requested);
      setSkuPage(1);
      void loadSkus(requested, 1);
    }
  }, [loadSkus, pathname, products.list, requestedProductId, router, scope, search, selected?.id]);

  useEffect(() => {
    if (!selected) {
      skuRequests.current.invalidate();
      setSkus(emptySkus);
      return;
    }
    const latest = products.list.find(({ id }) => id === selected.id);
    if (!latest) {
      if (requestedProductId !== selected.id) setSelected(null);
      return;
    }
    if (latest !== selected) setSelected(latest);
  }, [products.list, requestedProductId, selected]);

  useEffect(() => () => {
    skuRequests.current.invalidate();
    productRequests.current.invalidate();
    handledSearch.current = null;
  }, []);

  useEffect(() => {
    onSkuWorkspaceChange?.(Boolean(selected || requestedProductId));
  }, [onSkuWorkspaceChange, requestedProductId, selected]);

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
      id: "cost-category",
      header: "成本归类",
      cell: ({ row }) => (
        <div className="flex flex-col gap-1">
          <span>{row.original.default_cost_category_name ?? "未设置"}</span>
          {row.original.cost_category_source ? (
            <span className="text-xs text-muted-foreground">
              {costCategorySourceLabel(row.original.cost_category_source)}
            </span>
          ) : null}
        </div>
      ),
    },
    {
      id: "sku-count",
      header: "SKU",
      cell: ({ row }) => (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-auto min-w-20 flex-col items-start gap-0.5 px-2 py-1 text-left"
          onClick={() => openSkuWorkspace(row.original)}
        >
          <span className="tabular-nums">{row.original.sku_count} 个</span>
          <span className="text-xs font-normal text-muted-foreground">
            已启用 {row.original.active_sku_count}
          </span>
        </Button>
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
              onClick={() => openSkuWorkspace(row.original)}
            >
              查看 SKU
            </Button>
            {writable ? (
              <>
                <SupplierProductDialog scope={scope} product={row.original} onSaved={onRefresh} />
              </>
            ) : null}
            {scope.kind === "tenant" && canManageCatalog ? (
              <CostCategoryRuleDialog
                scope="product"
                targetId={row.original.id}
                targetName={row.original.name}
                onSaved={onRefresh}
              />
            ) : null}
            {writable ? (
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
            ) : null}
          </div>
        );
      },
    },
  ], [canManage, canManageCatalog, onRefresh, openSkuWorkspace, relationship, scope]);

  if (loading && products.list.length === 0) {
    return (
      <div className="flex flex-col gap-2 p-4">
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-full" />
      </div>
    );
  }

  if (requestedProductId && !selected) return (
    <div className="flex min-h-[28rem] flex-col gap-3 p-4">
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-14 w-full" />
      <Skeleton className="h-14 w-full" />
    </div>
  );

  const selectedWritable = selected
    ? productWritable(scope, canManage, relationship, selected)
    : false;

  if (selected) return (
    <div className="flex min-h-[28rem] flex-col">
      <div className="flex flex-col justify-between gap-3 border-b bg-muted/20 px-4 py-3 md:flex-row md:items-center">
        <div className="flex min-w-0 items-center gap-3">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                aria-label="返回商品列表"
                onClick={closeSkuWorkspace}
              >
                <ArrowLeft />
              </Button>
            </TooltipTrigger>
            <TooltipContent>返回商品列表</TooltipContent>
          </Tooltip>
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold">{selected.name} · SKU</h2>
            <p className="text-sm text-muted-foreground">
              共 <span className="tabular-nums">{selected.sku_count}</span> 个，已启用 <span className="tabular-nums">{selected.active_sku_count}</span> 个
            </p>
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={skuLoading || productRestoring}
            onClick={() => void refreshSkuWorkspace(selected)}
          >
            <RefreshCw data-icon="inline-start" />
            刷新
          </Button>
          {selectedWritable ? (
            <SupplierSkuDialog
              scope={scope}
              product={selected}
              inlinePriceEnabled={inlinePriceEnabled}
              disabled={skuLoading || selected.status === "inactive"}
              onSaved={async () => {
                await refreshSkuWorkspace(selected, 1);
              }}
            />
          ) : null}
        </div>
      </div>
      <SupplierSkuTable
        scope={scope}
        product={selected}
        skus={skus}
        loading={skuLoading}
        canManage={selectedWritable}
        inlinePriceEnabled={inlinePriceEnabled}
        onMutate={setMutation}
        onRefresh={() => loadSkus(selected)}
        onPageChange={(nextPage) => loadSkus(selected, nextPage)}
      />
      <SupplierStatusDialog
        target={mutation}
        scope={scope}
        onOpenChange={(open) => {
          if (!open) setMutation(null);
        }}
        onChanged={async () => {
          await refreshSkuWorkspace(selected);
        }}
      />
    </div>
  );

  return (
    <div className="flex flex-col gap-5">
      <DataTable data={products.list} columns={columns} emptyText="当前供应商还没有商品" minWidth="min-w-[1080px]" />
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

function costCategorySourceLabel(source: SupplierProduct["cost_category_source"]) {
  if (source === "product") return "商品指定";
  if (source === "category") return "分类默认";
  if (source === "ancestor") return "上级分类";
  return null;
}
