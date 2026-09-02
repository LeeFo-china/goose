"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PackageSearch, Search } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { StatusAlert } from "@/components/admin/status-alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { isSupplierResourceNotFound, loadSupplierProducts, loadSupplierRelationship, loadSupplierRelationships } from "./supplier-product-api";
import { buildSupplierProductClearedScopeHref, buildSupplierProductScopeHref } from "./supplier-product-drilldown";
import { SupplierProductDialog } from "./supplier-product-dialog";
import { SupplierProductList } from "./supplier-product-list";
import { canReadSupplierProductWorkspace, getPriceWriteState, getProductWriteState, relationshipReadOnlyMessage, shouldLoadPriceLists } from "./supplier-product-rules";
import { createLatestRequestGate } from "./supplier-request-gate";
import { SupplierPriceListPanel } from "./supplier-price-list-panel";
import { SupplierSearchSelect } from "./supplier-search-select";
import { canUseInlineSkuPrice } from "./supplier-sku-price-form";
import type { PageData, ProductApiScope, SupplierProductPage, SupplierSku, TenantSupplierRelationship } from "./supplier-product-types";

const page = <T,>(): PageData<T> => ({
  list: [],
  pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
});

export function SupplierProductWorkspace({
  canViewProducts,
  canManageProducts,
  canManageCatalog,
  canViewCostPrice,
  canManageCostPrice,
}: {
  canViewProducts: boolean;
  canManageProducts: boolean;
  canManageCatalog: boolean;
  canViewCostPrice: boolean;
  canManageCostPrice: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [relationships, setRelationships] = useState(page<TenantSupplierRelationship>());
  const [relationshipId, setRelationshipId] = useState("");
  const [relationshipPage, setRelationshipPage] = useState(1);
  const [relationshipKeyword, setRelationshipKeyword] = useState("");
  const [appliedRelationshipKeyword, setAppliedRelationshipKeyword] = useState("");
  const [products, setProducts] = useState(page<never>() as SupplierProductPage);
  const [availableSkus, setAvailableSkus] = useState<SupplierSku[]>([]);
  const [productPage, setProductPage] = useState(1);
  const [keyword, setKeyword] = useState("");
  const [appliedKeyword, setAppliedKeyword] = useState("");
  const [loadingRelationships, setLoadingRelationships] = useState(true);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [skuWorkspaceVisible, setSkuWorkspaceVisible] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const relationshipRequests = useRef(createLatestRequestGate());
  const productRequests = useRef(createLatestRequestGate());
  const requestedRelationshipId = searchParams.get("tenantSupplierId");
  const search = searchParams.toString();
  const canReadCostPrice = canViewCostPrice;
  const canReadWorkspace = canReadSupplierProductWorkspace({
    canViewProducts,
    canManageProducts,
    canViewCostPrice,
    canManageCostPrice,
  });

  const loadRelationships = useCallback(async () => {
    if (!canReadWorkspace) return;
    const request = relationshipRequests.current.begin();
    setLoadingRelationships(true);
    setError(null);
    try {
      const [data, requestedRelationshipResult] = await Promise.all([
        loadSupplierRelationships(appliedRelationshipKeyword, relationshipPage),
        requestedRelationshipId
          ? loadSupplierRelationship(requestedRelationshipId)
            .then((value) => ({ value, unavailable: false }))
            .catch((detailError: unknown) => ({
              value: null,
              unavailable: isSupplierResourceNotFound(detailError),
              detailError,
            }))
          : Promise.resolve({ value: null, unavailable: false }),
      ]);
      if (!relationshipRequests.current.isCurrent(request)) return;
      const requestedRelationship = requestedRelationshipResult.value
        ?? data.list.find(({ id }) => id === requestedRelationshipId)
        ?? null;
      if (
        "detailError" in requestedRelationshipResult
        && !requestedRelationshipResult.unavailable
        && !requestedRelationship
      ) throw requestedRelationshipResult.detailError;
      const requestedRelationshipUnavailable = Boolean(
        requestedRelationshipId
        && requestedRelationshipResult.unavailable
        && !requestedRelationship,
      );
      const relationshipList = requestedRelationship
        && !data.list.some(({ id }) => id === requestedRelationship.id)
        ? [requestedRelationship, ...data.list]
        : data.list;
      setRelationships({
        ...data,
        list: relationshipList.map((item) => ({
          ...item,
          name: item.supplier.name,
          code: item.supplier.code,
        })),
      } as PageData<TenantSupplierRelationship>);
      setRelationshipId((current) => requestedRelationship?.id
        ?? (relationshipList.some(({ id }) => id === current)
          ? current
          : relationshipList[0]?.id ?? ""));
      if (requestedRelationshipUnavailable) {
        setError("链接中的合作供应商不可用，已显示当前可用列表。");
        router.replace(
          buildSupplierProductClearedScopeHref(pathname, search, "tenant"),
          { scroll: false },
        );
      }
    } catch (caught) {
      if (relationshipRequests.current.isCurrent(request)) {
        setError(caught instanceof Error ? caught.message : "合作供应商加载失败");
      }
    } finally {
      if (relationshipRequests.current.isCurrent(request)) {
        setLoadingRelationships(false);
      }
    }
  }, [appliedRelationshipKeyword, canReadWorkspace, pathname, relationshipPage, requestedRelationshipId, router, search]);

  useEffect(() => {
    void loadRelationships();
    return () => relationshipRequests.current.invalidate();
  }, [loadRelationships]);

  const relationship = relationships.list.find(({ id }) => id === relationshipId) ?? null;
  const scope = useMemo<ProductApiScope | null>(() => relationshipId
    ? { kind: "tenant", tenantSupplierId: relationshipId }
    : null, [relationshipId]);
  const inlineSkuPriceEnabled = scope ? canUseInlineSkuPrice({
    scope,
    canManageProducts,
    canViewCostPrice,
    canManageCostPrice,
  }) : false;

  useEffect(() => {
    setProductPage(1);
    setProducts(page<never>() as SupplierProductPage);
    setAvailableSkus([]);
    setSkuWorkspaceVisible(false);
  }, [relationshipId]);

  const loadProducts = useCallback(async () => {
    if (!scope) return;
    const request = productRequests.current.begin();
    setLoadingProducts(true);
    setError(null);
    try {
      const data = await loadSupplierProducts(scope, productPage, appliedKeyword);
      if (productRequests.current.isCurrent(request)) setProducts(data);
    } catch (caught) {
      if (productRequests.current.isCurrent(request)) {
        setError(caught instanceof Error ? caught.message : "供应商商品加载失败");
      }
    } finally {
      if (productRequests.current.isCurrent(request)) setLoadingProducts(false);
    }
  }, [appliedKeyword, productPage, scope]);

  useEffect(() => {
    if (scope) void loadProducts();
    return () => productRequests.current.invalidate();
  }, [loadProducts, scope]);

  if (!canReadWorkspace) {
    return <StatusAlert>当前账号没有商品或采购价查看权限，无法进入供应商品工作区。</StatusAlert>;
  }

  const writeState = relationship
    ? getProductWriteState({ canManage: canManageProducts, relationship })
    : { writable: false, reason: null };
  const priceWriteState = relationship
    ? getPriceWriteState({ canManage: canManageCostPrice, relationship })
    : { writable: false, reason: null };
  const readOnlyMessage = relationship ? relationshipReadOnlyMessage(relationship) : null;
  const totalPages = Math.max(1, products.pagination.totalPages || 1);

  return (
    <div
      className="flex h-full min-h-0 flex-1 flex-col gap-5 overflow-y-auto pb-6 pr-1 [scrollbar-gutter:stable]"
      data-testid="supplier-product-workspace"
    >
      <PageHeading />
      <SupplierSearchSelect
        id="supplier-product-relationship"
        label="合作供应商"
        searchLabel="搜索合作供应商"
        value={relationshipId}
        page={relationshipPage}
        result={relationships as PageData<TenantSupplierRelationship & { name: string; code: string }>}
        keyword={relationshipKeyword}
        loading={loadingRelationships}
        onKeywordChange={setRelationshipKeyword}
        onSearch={() => {
          setRelationshipPage(1);
          setAppliedRelationshipKeyword(relationshipKeyword.trim());
        }}
        onPageChange={setRelationshipPage}
        onChange={(value) => {
          productRequests.current.invalidate();
          router.replace(
            buildSupplierProductScopeHref(
              pathname,
              search,
              { kind: "tenant", tenantSupplierId: value },
            ),
            { scroll: false },
          );
        }}
      />
      {error ? <StatusAlert>{error}</StatusAlert> : null}
      {!canViewProducts && !canManageProducts && canReadCostPrice ? (
        <StatusAlert>当前商品与 SKU 仅用于采购价维护，不开放商品写入。</StatusAlert>
      ) : null}
      {readOnlyMessage ? <StatusAlert>{readOnlyMessage}</StatusAlert> : null}
      {loadingRelationships && relationships.list.length === 0 ? (
        <Skeleton className="min-h-80 w-full" />
      ) : !scope || !relationship ? (
        <EmptySupplier />
      ) : (
        <Tabs defaultValue="products" className="flex min-h-0 flex-1 flex-col gap-4">
          <TabsList className="w-fit">
            <TabsTrigger value="products">商品与 SKU</TabsTrigger>
            {canReadCostPrice ? <TabsTrigger value="prices">基础供货价</TabsTrigger> : null}
          </TabsList>
          <TabsContent value="products" className="mt-0">
            <Card className="overflow-hidden shadow-none">
              {!skuWorkspaceVisible ? (
                <CardHeader className="border-b bg-muted/20 p-3">
                  <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
                    <div className="flex flex-1 gap-2">
                      <Input aria-label="搜索供应商商品" className="md:max-w-sm" value={keyword} placeholder="搜索商品名称或编码" onChange={(event) => setKeyword(event.target.value)} />
                      <Button type="button" variant="outline" disabled={loadingProducts} onClick={() => {
                        setProductPage(1);
                        setAppliedKeyword(keyword.trim());
                      }}><Search data-icon="inline-start" />搜索商品</Button>
                    </div>
                    {writeState.writable ? <SupplierProductDialog scope={scope} disabled={loadingProducts} onSaved={loadProducts} /> : null}
                  </div>
                </CardHeader>
              ) : null}
              <CardContent className="p-0">
                <SupplierProductList key={relationshipId} scope={scope} relationship={relationship} products={products} loading={loadingProducts} canManage={canManageProducts} canManageCatalog={canManageCatalog} inlinePriceEnabled={inlineSkuPriceEnabled} onRefresh={loadProducts} onAvailableSkusChange={setAvailableSkus} onSkuWorkspaceChange={setSkuWorkspaceVisible} />
                {!skuWorkspaceVisible ? <Paginator page={productPage} totalPages={totalPages} total={products.pagination.total} loading={loadingProducts} onPageChange={setProductPage} /> : null}
              </CardContent>
            </Card>
          </TabsContent>
          {shouldLoadPriceLists(canReadCostPrice, relationshipId) ? (
            <TabsContent value="prices" className="mt-0">
              <Card className="shadow-none"><CardContent className="p-5">
                <SupplierPriceListPanel key={relationshipId} scope={scope} canManage={priceWriteState.writable} availableSkus={availableSkus} />
              </CardContent></Card>
            </TabsContent>
          ) : null}
        </Tabs>
      )}
    </div>
  );
}

function Paginator({ page: current, totalPages, total, loading, onPageChange }: { page: number; totalPages: number; total: number; loading: boolean; onPageChange: (page: number) => void }) {
  return <div className="flex items-center justify-between gap-3 border-t px-4 py-3">
    <span className="text-sm text-muted-foreground">第 {current} / {totalPages} 页，共 {total} 个商品</span>
    <div className="flex gap-2">
      <Button type="button" variant="outline" disabled={current <= 1 || loading} onClick={() => onPageChange(Math.max(1, current - 1))}>上一页</Button>
      <Button type="button" variant="outline" disabled={current >= totalPages || loading} onClick={() => onPageChange(current + 1)}>下一页</Button>
    </div>
  </div>;
}

function EmptySupplier() {
  return <Card className="flex min-h-80 items-center justify-center shadow-none"><CardContent><Empty><EmptyHeader><EmptyMedia variant="icon"><PackageSearch /></EmptyMedia><EmptyTitle>没有匹配的合作供应商</EmptyTitle><EmptyDescription>可按名称或编码检索；暂停或终止合作仍可进入历史只读资料。</EmptyDescription></EmptyHeader></Empty></CardContent></Card>;
}

function PageHeading() {
  return <div><h1 className="text-xl font-semibold tracking-normal">商品与价格</h1><p className="mt-1 text-sm text-muted-foreground">维护租户私有商品、结构化规格、单位换算与默认基础供货价；平台共享商品保持只读。</p></div>;
}
