"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { StatusAlert } from "@/components/admin/status-alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { SupplierProductDialog } from "@/components/supplier-products/supplier-product-dialog";
import { buildSupplierProductClearedScopeHref, buildSupplierProductScopeHref } from "@/components/supplier-products/supplier-product-drilldown";
import { SupplierProductList } from "@/components/supplier-products/supplier-product-list";
import { isSupplierResourceNotFound, loadPlatformSupplier, loadPlatformSuppliers, loadSupplierProducts } from "@/components/supplier-products/supplier-product-api";
import { SupplierSearchSelect } from "@/components/supplier-products/supplier-search-select";
import { createLatestRequestGate } from "@/components/supplier-products/supplier-request-gate";
import type { PageData, PlatformSupplierOption, SupplierProductPage } from "@/components/supplier-products/supplier-product-types";

import { platformSupplierProductScope } from "./platform-supplier-product-rules";

const emptySuppliers: PageData<PlatformSupplierOption> = {
  list: [],
  pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
};
const emptyProducts: SupplierProductPage = {
  list: [],
  pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
};

export function PlatformSupplierProductWorkspace() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [suppliers, setSuppliers] = useState(emptySuppliers);
  const [supplierId, setSupplierId] = useState("");
  const [supplierPage, setSupplierPage] = useState(1);
  const [supplierKeyword, setSupplierKeyword] = useState("");
  const [appliedSupplierKeyword, setAppliedSupplierKeyword] = useState("");
  const [products, setProducts] = useState(emptyProducts);
  const [productPage, setProductPage] = useState(1);
  const [productKeyword, setProductKeyword] = useState("");
  const [appliedProductKeyword, setAppliedProductKeyword] = useState("");
  const [supplierLoading, setSupplierLoading] = useState(true);
  const [productLoading, setProductLoading] = useState(false);
  const [skuWorkspaceVisible, setSkuWorkspaceVisible] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const supplierRequests = useRef(createLatestRequestGate());
  const productRequests = useRef(createLatestRequestGate());
  const requestedSupplierId = searchParams.get("supplierId");
  const search = searchParams.toString();

  const loadSuppliers = useCallback(async () => {
    const request = supplierRequests.current.begin();
    setSupplierLoading(true);
    setError(null);
    try {
      const [data, requestedSupplierResult] = await Promise.all([
        loadPlatformSuppliers(appliedSupplierKeyword, supplierPage),
        requestedSupplierId
          ? loadPlatformSupplier(requestedSupplierId)
            .then((value) => ({ value, unavailable: false }))
            .catch((detailError: unknown) => ({
              value: null,
              unavailable: isSupplierResourceNotFound(detailError),
              detailError,
            }))
          : Promise.resolve({ value: null, unavailable: false }),
      ]);
      if (!supplierRequests.current.isCurrent(request)) return;
      const requestedSupplier = requestedSupplierResult.value
        ?? data.list.find(({ id }) => id === requestedSupplierId)
        ?? null;
      if (
        "detailError" in requestedSupplierResult
        && !requestedSupplierResult.unavailable
        && !requestedSupplier
      ) throw requestedSupplierResult.detailError;
      const requestedSupplierUnavailable = Boolean(
        requestedSupplierId
        && requestedSupplierResult.unavailable
        && !requestedSupplier,
      );
      const supplierList = requestedSupplier
        && !data.list.some(({ id }) => id === requestedSupplier.id)
        ? [requestedSupplier, ...data.list]
        : data.list;
      setSuppliers({ ...data, list: supplierList });
      setSupplierId((current) => requestedSupplier?.id
        ?? (supplierList.some(({ id }) => id === current)
          ? current
          : supplierList[0]?.id ?? ""));
      if (requestedSupplierUnavailable) {
        setError("链接中的平台供应商不可用，已显示当前可用列表。");
        router.replace(
          buildSupplierProductClearedScopeHref(pathname, search, "platform"),
          { scroll: false },
        );
      }
    } catch (caught) {
      if (supplierRequests.current.isCurrent(request)) {
        setError(caught instanceof Error ? caught.message : "平台供应商加载失败");
      }
    } finally {
      if (supplierRequests.current.isCurrent(request)) setSupplierLoading(false);
    }
  }, [appliedSupplierKeyword, pathname, requestedSupplierId, router, search, supplierPage]);

  useEffect(() => {
    void loadSuppliers();
    return () => supplierRequests.current.invalidate();
  }, [loadSuppliers]);

  const scope = useMemo(() => supplierId
    ? platformSupplierProductScope(supplierId)
    : null, [supplierId]);

  useEffect(() => {
    setProductPage(1);
    setProducts(emptyProducts);
    setSkuWorkspaceVisible(false);
  }, [supplierId]);

  const loadProducts = useCallback(async () => {
    if (!scope) return;
    const request = productRequests.current.begin();
    setProductLoading(true);
    setError(null);
    try {
      const data = await loadSupplierProducts(scope, productPage, appliedProductKeyword);
      if (productRequests.current.isCurrent(request)) setProducts(data);
    } catch (caught) {
      if (productRequests.current.isCurrent(request)) {
        setError(caught instanceof Error ? caught.message : "平台共享商品加载失败");
      }
    } finally {
      if (productRequests.current.isCurrent(request)) setProductLoading(false);
    }
  }, [appliedProductKeyword, productPage, scope]);

  useEffect(() => {
    if (scope) void loadProducts();
    return () => productRequests.current.invalidate();
  }, [loadProducts, scope]);

  const totalPages = Math.max(1, products.pagination.totalPages || 1);
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5">
      <div><h1 className="text-xl font-semibold tracking-normal">平台共享商品</h1><p className="mt-1 text-sm text-muted-foreground">维护所有租户可见的平台供应商商品、结构化 SKU 与有向单位换算；本页不读取租户采购价。</p></div>
      <SupplierSearchSelect
        id="platform-supplier-product-supplier"
        label="平台供应商"
        searchLabel="搜索平台供应商"
        value={supplierId}
        page={supplierPage}
        result={suppliers}
        keyword={supplierKeyword}
        loading={supplierLoading}
        onKeywordChange={setSupplierKeyword}
        onSearch={() => {
          setSupplierPage(1);
          setAppliedSupplierKeyword(supplierKeyword.trim());
        }}
        onPageChange={setSupplierPage}
        onChange={(value) => {
          productRequests.current.invalidate();
          router.replace(
            buildSupplierProductScopeHref(
              pathname,
              search,
              { kind: "platform", supplierId: value },
            ),
            { scroll: false },
          );
        }}
      />
      {error ? <StatusAlert>{error}</StatusAlert> : null}
      {supplierLoading && suppliers.list.length === 0 ? <Skeleton className="min-h-80 w-full" /> : null}
      {!supplierLoading && !scope ? <StatusAlert>没有匹配的平台供应商，请调整关键词后重试。</StatusAlert> : null}
      {scope ? (
        <Card className="overflow-hidden shadow-none">
          {!skuWorkspaceVisible ? (
            <CardHeader className="border-b bg-muted/20 p-3">
              <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
                <div className="flex flex-1 gap-2">
                  <Input aria-label="搜索平台共享商品" className="md:max-w-sm" value={productKeyword} placeholder="搜索商品名称或编码" onChange={(event) => setProductKeyword(event.target.value)} />
                  <Button type="button" variant="outline" disabled={productLoading} onClick={() => {
                    setProductPage(1);
                    setAppliedProductKeyword(productKeyword.trim());
                  }}><Search data-icon="inline-start" />搜索商品</Button>
                </div>
                <SupplierProductDialog scope={scope} disabled={productLoading} onSaved={loadProducts} />
              </div>
            </CardHeader>
          ) : null}
          <CardContent className="p-0">
            <SupplierProductList key={supplierId} scope={scope} products={products} loading={productLoading} canManage onRefresh={loadProducts} onAvailableSkusChange={() => undefined} onSkuWorkspaceChange={setSkuWorkspaceVisible} />
            {!skuWorkspaceVisible ? (
              <div className="flex items-center justify-between gap-3 border-t px-4 py-3">
                <span className="text-sm text-muted-foreground">第 {products.pagination.page} / {totalPages} 页，共 {products.pagination.total} 个商品</span>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" disabled={productLoading || productPage <= 1} onClick={() => setProductPage((current) => Math.max(1, current - 1))}>上一页</Button>
                  <Button type="button" variant="outline" disabled={productLoading || productPage >= totalPages} onClick={() => setProductPage((current) => current + 1)}>下一页</Button>
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
