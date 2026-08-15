"use client";

import { useEffect, useState } from "react";
import { PackageSearch } from "lucide-react";

import { StatusAlert } from "@/components/admin/status-alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
} from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { requestBackendJson } from "@/lib/backend-client";

import {
  catalogSourceLabel,
  type TenantCatalogBrand,
  type TenantCatalogCategory,
  type TenantCatalogPage,
  type TenantCatalogUnit,
  type TenantCatalogView,
} from "./tenant-supplier-catalog-types";

export function TenantCatalogWorkspace({
  canManage,
}: {
  canManage: boolean;
}) {
  const [view, setView] = useState<TenantCatalogView>("categories");
  const [categories, setCategories] = useState<
    TenantCatalogPage<TenantCatalogCategory>
  >(emptyPage());
  const [brands, setBrands] = useState<TenantCatalogPage<TenantCatalogBrand>>(
    emptyPage(),
  );
  const [units, setUnits] = useState<TenantCatalogPage<TenantCatalogUnit>>(
    emptyPage(),
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    Promise.all([
      requestBackendJson<TenantCatalogPage<TenantCatalogCategory>>(
        "/catalog/categories?page=1&pageSize=100",
        { fallbackMessage: "目录分类加载失败" },
      ),
      requestBackendJson<TenantCatalogPage<TenantCatalogBrand>>(
        "/catalog/brands?page=1&pageSize=100",
        { fallbackMessage: "目录品牌加载失败" },
      ),
      requestBackendJson<TenantCatalogPage<TenantCatalogUnit>>(
        "/catalog/units?page=1&pageSize=100",
        { fallbackMessage: "目录单位加载失败" },
      ),
    ]).then(([categoryPage, brandPage, unitPage]) => {
      if (!active) return;
      setCategories(categoryPage);
      setBrands(brandPage);
      setUnits(unitPage);
    }).catch((caught) => {
      if (active) {
        setError(caught instanceof Error ? caught.message : "目录加载失败");
      }
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => {
      active = false;
    };
  }, []);

  if (loading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="min-h-80 w-full rounded-lg" />
      </div>
    );
  }

  if (error) {
    return <StatusAlert>{error}</StatusAlert>;
  }

  const current = view === "categories"
    ? categories
    : view === "brands"
      ? brands
      : units;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5">
      <div>
        <h1 className="text-xl font-semibold tracking-normal">供应商目录</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          平台共享目录与当前租户私有目录合并展示。
        </p>
      </div>
      <Tabs
        value={view}
        onValueChange={(value) => setView(value as TenantCatalogView)}
        className="contents"
      >
        <TabsList>
          <TabsTrigger value="categories">分类</TabsTrigger>
          <TabsTrigger value="brands">品牌</TabsTrigger>
          <TabsTrigger value="units">单位</TabsTrigger>
        </TabsList>
        <Card className="min-h-80">
          <CardHeader className="shrink-0 border-b bg-muted/20 p-3">
            <div className="text-sm font-medium">
              共 {current.pagination.total} 条记录
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {current.list.length === 0 ? (
              <Empty>
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <PackageSearch />
                  </EmptyMedia>
                  <EmptyTitle>暂无目录数据</EmptyTitle>
                  <EmptyDescription>
                    当前视图下没有可展示的目录记录。
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b bg-muted/40 text-left text-muted-foreground">
                    <tr>
                      <th className="p-3 font-medium">名称</th>
                      <th className="p-3 font-medium">编码</th>
                      <th className="p-3 font-medium">来源</th>
                      <th className="p-3 font-medium">平台映射</th>
                    </tr>
                  </thead>
                  <tbody>
                    {view === "categories"
                      ? categories.list.map((category) => (
                          <CategoryRow key={category.id} category={category} />
                        ))
                      : view === "brands"
                        ? brands.list.map((brand) => (
                            <BrandRow key={brand.id} brand={brand} />
                          ))
                        : units.list.map((unit) => (
                            <UnitRow key={unit.id} unit={unit} />
                          ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
        {canManage ? (
          <div className="text-xs text-muted-foreground">
            目录维护请使用平台共享或租户私有目录管理能力。
          </div>
        ) : null}
      </Tabs>
    </div>
  );
}

function CategoryRow({ category }: { category: TenantCatalogCategory }) {
  return (
    <tr className="border-b">
      <td className="p-3">{category.full_name ?? category.name}</td>
      <td className="p-3">{category.code}</td>
      <td className="p-3">
        <SourceBadge source={category.ownership_scope} />
      </td>
      <td className="p-3">{category.mapped_platform_category_id ?? "-"}</td>
    </tr>
  );
}

function BrandRow({ brand }: { brand: TenantCatalogBrand }) {
  return (
    <tr className="border-b">
      <td className="p-3">{brand.name}</td>
      <td className="p-3">{brand.code}</td>
      <td className="p-3">
        <SourceBadge source={brand.ownership_scope} />
      </td>
      <td className="p-3">{brand.mapped_platform_brand_id ?? "-"}</td>
    </tr>
  );
}

function UnitRow({ unit }: { unit: TenantCatalogUnit }) {
  return (
    <tr className="border-b">
      <td className="p-3">{unit.name}</td>
      <td className="p-3">{unit.code}</td>
      <td className="p-3">-</td>
      <td className="p-3">-</td>
    </tr>
  );
}

function SourceBadge({ source }: { source: "platform" | "tenant" }) {
  return (
    <span
      data-source={source}
      className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs"
    >
      {catalogSourceLabel(source)}
    </span>
  );
}

function emptyPage<RecordType>(): TenantCatalogPage<RecordType> {
  return {
    list: [],
    pagination: { page: 1, pageSize: 100, total: 0, totalPages: 0 },
  };
}
