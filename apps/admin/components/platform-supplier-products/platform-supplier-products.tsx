"use client";

import { useEffect, useState } from "react";
import { PackageSearch } from "lucide-react";

import { StatusAlert } from "@/components/admin/status-alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

import type { SupplierProduct } from "@/components/supplier-products/supplier-product-types";
import { loadPlatformSupplierProducts } from "./platform-supplier-products-api";

export function PlatformSupplierProducts() {
  const [supplierId, setSupplierId] = useState("");
  const [appliedSupplierId, setAppliedSupplierId] = useState("");
  const [products, setProducts] = useState<SupplierProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!appliedSupplierId) {
      setProducts([]);
      return;
    }
    let active = true;
    setLoading(true);
    setError(null);
    loadPlatformSupplierProducts(appliedSupplierId, 1, 100).then((page) => {
      if (active) setProducts(page.list);
    }).catch((caught) => {
      if (active) {
        setError(caught instanceof Error ? caught.message : "加载失败");
      }
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [appliedSupplierId]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5">
      <div>
        <h1 className="text-xl font-semibold tracking-normal">平台共享商品</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          按平台供应商查看平台共享商品资料，不维护租户成交价。
        </p>
      </div>
      <div className="flex gap-2">
        <Input
          aria-label="平台供应商 ID"
          placeholder="输入平台供应商 ID"
          value={supplierId}
          onChange={(event) => setSupplierId(event.target.value)}
        />
        <Button
          type="button"
          onClick={() => setAppliedSupplierId(supplierId.trim())}
        >
          查询
        </Button>
      </div>
      <Card className="min-h-80">
        <CardHeader className="shrink-0 border-b bg-muted/20 p-3">
          <div className="text-sm font-medium">商品列表</div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-4">
              <Skeleton className="h-16 w-full" />
            </div>
          ) : error ? (
            <StatusAlert>{error}</StatusAlert>
          ) : products.length === 0 ? (
            <div className="flex min-h-64 items-center justify-center p-6 text-sm text-muted-foreground">
              <PackageSearch className="mr-2 size-4" aria-hidden="true" />
              未查询到商品
            </div>
          ) : (
            <ul className="divide-y text-sm">
              {products.map((product) => (
                <li key={product.id} className="p-3">
                  <div className="font-medium">{product.name}</div>
                  <div className="text-muted-foreground">
                    {product.product_code} · {product.category.name} ·{" "}
                    {product.brand.name}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
