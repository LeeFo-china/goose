"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { PackageSearch, Search } from "lucide-react";

import { FormSelect } from "@/components/admin/form-select";
import { StatusAlert } from "@/components/admin/status-alert";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import {
  loadSupplierProducts,
  loadSupplierRelationships,
} from "./supplier-product-api";
import { relationshipStatusMeta } from "@/components/suppliers/supplier-types";
import { SupplierProductDialog } from "./supplier-product-dialog";
import { SupplierProductList } from "./supplier-product-list";
import { shouldLoadPriceLists } from "./supplier-product-rules";
import { SupplierPriceListPanel } from "./supplier-price-list-panel";
import type {
  SupplierProductPage,
  SupplierSku,
  TenantSupplierRelationship,
} from "./supplier-product-types";

const emptyProducts: SupplierProductPage = {
  list: [],
  pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
};

export function SupplierProductWorkspace({
  canViewProducts,
  canManageProducts,
  canViewCostPrice,
  canManageCostPrice,
}: {
  canViewProducts: boolean;
  canManageProducts: boolean;
  canViewCostPrice: boolean;
  canManageCostPrice: boolean;
}) {
  const [relationships, setRelationships] = useState<
    TenantSupplierRelationship[]
  >([]);
  const [tenantSupplierId, setTenantSupplierId] = useState<string | null>(null);
  const [products, setProducts] = useState(emptyProducts);
  const [availableSkus, setAvailableSkus] = useState<SupplierSku[]>([]);
  const [page, setPage] = useState(1);
  const [keyword, setKeyword] = useState("");
  const [appliedKeyword, setAppliedKeyword] = useState("");
  const [loadingRelationships, setLoadingRelationships] = useState(true);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!canViewProducts) {
      setLoadingRelationships(false);
      return;
    }
    let active = true;
    void loadSupplierRelationships().then((data) => {
      if (!active) return;
      setRelationships(data.list);
      setTenantSupplierId((current) => current ?? data.list[0]?.id ?? null);
    }).catch((caught) => {
      if (active) {
        setError(caught instanceof Error ? caught.message : "合作供应商加载失败");
      }
    }).finally(() => {
      if (active) setLoadingRelationships(false);
    });
    return () => {
      active = false;
    };
  }, [canViewProducts]);

  const loadProducts = useCallback(async () => {
    if (!tenantSupplierId) return;
    setLoadingProducts(true);
    setError(null);
    try {
      setProducts(
        await loadSupplierProducts(tenantSupplierId, page, appliedKeyword),
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "供应商商品加载失败");
    } finally {
      setLoadingProducts(false);
    }
  }, [appliedKeyword, page, tenantSupplierId]);

  useEffect(() => {
    void loadProducts();
  }, [loadProducts]);

  const relationshipOptions = useMemo(
    () => relationships.map((relationship) => ({
      value: relationship.id,
      label: `${relationship.supplier.name} · ${relationship.supplier.code} · ${relationshipStatusMeta[relationship.relationship_status].label}`,
    })),
    [relationships],
  );

  const selectedRelationship = relationships.find(
    (relationship) => relationship.id === tenantSupplierId,
  ) ?? null;
  const isActive = selectedRelationship?.relationship_status === "active";
  const canWrite = canManageProducts && isActive;

  if (!canViewProducts) {
    return (
      <StatusAlert>
        当前账号没有 supplier.product.view 权限，无法查看供应商品。
      </StatusAlert>
    );
  }

  if (loadingRelationships) {
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-4">
        <Skeleton className="h-14 w-full" />
        <Skeleton className="min-h-80 flex-1 rounded-lg" />
      </div>
    );
  }

  if (!tenantSupplierId) {
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-5">
        <PageHeading />
        {error ? <StatusAlert>{error}</StatusAlert> : null}
        <Card className="flex min-h-80 flex-1 items-center justify-center shadow-none">
          <CardContent>
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <PackageSearch />
                </EmptyMedia>
                <EmptyTitle>没有可维护的合作供应商</EmptyTitle>
                <EmptyDescription>
                  仅“合作中”的供应商可代录商品与基础供货价，请先在合作供应商页面完成启用。
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          </CardContent>
        </Card>
      </div>
    );
  }

  const totalPages = Math.max(1, products.pagination.totalPages || 1);
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5">
      <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-end">
        <PageHeading />
        <div className="w-full lg:max-w-md">
          <FormSelect
            id="supplier-product-relationship"
            value={tenantSupplierId}
            options={relationshipOptions}
            onChange={(value) => {
              setTenantSupplierId(value);
              setPage(1);
              setProducts(emptyProducts);
              setAvailableSkus([]);
            }}
          />
        </div>
      </div>
      {error ? <StatusAlert>{error}</StatusAlert> : null}
      {selectedRelationship && !isActive ? (
        <Alert>
          <AlertTitle>当前合作关系已非合作中</AlertTitle>
          <AlertDescription>
            状态：{relationshipStatusMeta[selectedRelationship.relationship_status].label}。
            商品与基础供货价仅供历史查看，不能新增或编辑。
          </AlertDescription>
        </Alert>
      ) : null}
      <Tabs defaultValue="products" className="flex min-h-0 flex-1 flex-col gap-4">
        <TabsList className="w-fit">
          <TabsTrigger value="products">商品与 SKU</TabsTrigger>
          {canViewCostPrice ? (
            <TabsTrigger value="prices">基础供货价</TabsTrigger>
          ) : null}
        </TabsList>
        <TabsContent value="products" className="mt-0">
          <Card className="overflow-hidden shadow-none">
            <CardHeader className="border-b bg-muted/20 p-3">
              <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
                <div className="flex flex-1 gap-2">
                  <Input
                    className="md:max-w-sm"
                    aria-label="搜索供应商商品"
                    value={keyword}
                    placeholder="搜索商品名称或编码"
                    onChange={(event) => setKeyword(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        setPage(1);
                        setAppliedKeyword(keyword.trim());
                      }
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    disabled={loadingProducts}
                    onClick={() => {
                      setPage(1);
                      setAppliedKeyword(keyword.trim());
                    }}
                  >
                    <Search data-icon="inline-start" />
                    搜索
                  </Button>
                </div>
                {canWrite ? (
                  <SupplierProductDialog
                    tenantSupplierId={tenantSupplierId}
                    disabled={loadingProducts}
                    onCreated={loadProducts}
                  />
                ) : null}
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <SupplierProductList
                tenantSupplierId={tenantSupplierId}
                products={products}
                loading={loadingProducts}
                canManage={canWrite}
                onRefresh={loadProducts}
                onAvailableSkusChange={setAvailableSkus}
              />
              <div className="flex flex-col gap-3 border-t px-4 py-3 md:flex-row md:items-center md:justify-between">
                <span className="text-sm text-muted-foreground">
                  第 {products.pagination.page} / {totalPages} 页，共{" "}
                  {products.pagination.total} 个商品
                </span>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={page <= 1 || loadingProducts}
                    onClick={() => setPage((current) => Math.max(1, current - 1))}
                  >
                    上一页
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={page >= totalPages || loadingProducts}
                    onClick={() => setPage((current) => current + 1)}
                  >
                    下一页
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        {shouldLoadPriceLists(canViewCostPrice, tenantSupplierId) ? (
          <TabsContent value="prices" className="mt-0">
            <Card className="shadow-none">
              <CardContent className="p-5">
                <SupplierPriceListPanel
                  tenantSupplierId={tenantSupplierId}
                  canManage={canManageCostPrice && isActive}
                  availableSkus={availableSkus}
                />
              </CardContent>
            </Card>
          </TabsContent>
        ) : null}
      </Tabs>
    </div>
  );
}

function PageHeading() {
  return (
    <div>
      <h1 className="text-xl font-semibold tracking-normal">商品与价格</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        按合作供应商维护 SPU、SKU 和默认基础供货价；所有写入均记录租户代录审计。
      </p>
    </div>
  );
}
