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
import {
  loadCategorySpecDefinitions,
  type TenantCatalogSpecDefinition,
} from "./tenant-supplier-catalog-api";
import { specValueTypeLabel } from "./tenant-supplier-catalog-rules";
import { UnitSuggestionForm } from "./unit-suggestion-form";
import {
  TenantBrandDialog,
  TenantCategoryDialog,
} from "./tenant-catalog-dialogs";

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
  const [specs, setSpecs] = useState<TenantCatalogSpecDefinition[]>([]);
  const [specsLoading, setSpecsLoading] = useState(false);
  const [categoryDialog, setCategoryDialog] = useState<
    { category?: TenantCatalogCategory; parentId?: string | null } | null
  >(null);
  const [brandDialog, setBrandDialog] = useState<
    { brand?: TenantCatalogBrand } | null
  >(null);
  const [reload, setReload] = useState(0);
  const [categoryParentId, setCategoryParentId] = useState<string | null>(null);
  const [breadcrumb, setBreadcrumb] = useState<{ id: string; name: string }[]>(
    [],
  );
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  function navigateInto(category: TenantCatalogCategory) {
    setCategoryParentId(category.id);
    setBreadcrumb((current) => [
      ...current,
      { id: category.id, name: category.full_name ?? category.name },
    ]);
    setPage(1);
  }

  function navigateBack(index: number) {
    const nextParentId = index >= 0 ? breadcrumb[index]?.id ?? null : null;
    setCategoryParentId(nextParentId);
    setBreadcrumb((current) => current.slice(0, index + 1));
    setPage(1);
  }

  useEffect(() => {
    if (!categoryParentId) {
      setSpecs([]);
      return;
    }
    let active = true;
    setSpecsLoading(true);
    loadCategorySpecDefinitions(categoryParentId).then((page) => {
      if (active) setSpecs(page.list);
    }).catch(() => {
      if (active) setSpecs([]);
    }).finally(() => {
      if (active) setSpecsLoading(false);
    });
    return () => {
      active = false;
    };
  }, [categoryParentId]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    const categoryQuery = new URLSearchParams({
      page: String(page),
      pageSize: String(pageSize),
    });
    if (categoryParentId) categoryQuery.set("parent_id", categoryParentId);
    Promise.all([
      requestBackendJson<TenantCatalogPage<TenantCatalogCategory>>(
        `/catalog/categories?${categoryQuery}`,
        { fallbackMessage: "目录分类加载失败" },
      ),
      requestBackendJson<TenantCatalogPage<TenantCatalogBrand>>(
        `/catalog/brands?page=${page}&pageSize=${pageSize}`,
        { fallbackMessage: "目录品牌加载失败" },
      ),
      requestBackendJson<TenantCatalogPage<TenantCatalogUnit>>(
        `/catalog/units?page=${page}&pageSize=${pageSize}`,
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
  }, [reload, categoryParentId, page, pageSize]);

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
        {view === "categories" && breadcrumb.length > 0 ? (
          <div className="flex flex-wrap items-center gap-1 text-sm">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => navigateBack(-1)}
            >
              根级
            </Button>
            {breadcrumb.map((item, index) => (
              <span key={item.id} className="flex items-center gap-1">
                <span className="text-muted-foreground">/</span>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => navigateBack(index)}
                >
                  {item.name}
                </Button>
              </span>
            ))}
          </div>
        ) : null}
        <Card className="min-h-80">
          <CardHeader className="shrink-0 border-b bg-muted/20 p-3">
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium">
                共 {current.pagination.total} 条记录
              </div>
              {canManage && view !== "units" ? (
                <Button
                  type="button"
                  size="sm"
                  onClick={() =>
                    view === "categories"
                      ? setCategoryDialog({ parentId: categoryParentId })
                      : setBrandDialog({})
                  }
                >
                  新增{view === "categories" ? "分类" : "品牌"}
                </Button>
              ) : null}
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
                      <th className="p-3 font-medium">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {view === "categories"
                      ? categories.list.map((category) => (
                          <CategoryRow
                            key={category.id}
                            category={category}
                            onOpen={() => navigateInto(category)}
                            onEdit={() =>
                              setCategoryDialog({ category })
                            }
                          />
                        ))
                      : view === "brands"
                        ? brands.list.map((brand) => (
                            <BrandRow
                              key={brand.id}
                              brand={brand}
                              onEdit={() => setBrandDialog({ brand })}
                            />
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
        {current.pagination.totalPages > 1 ? (
          <div className="flex items-center justify-between text-sm">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={page <= 1}
              onClick={() => setPage((currentPage) => currentPage - 1)}
            >
              上一页
            </Button>
            <span className="text-muted-foreground">
              第 {page} / {current.pagination.totalPages} 页
            </span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={page >= current.pagination.totalPages}
              onClick={() => setPage((currentPage) => currentPage + 1)}
            >
              下一页
            </Button>
          </div>
        ) : null}
        {canManage ? (
          <div className="text-xs text-muted-foreground">
            目录维护请使用平台共享或租户私有目录管理能力。
          </div>
        ) : null}
        {view === "units" && canManage ? (
          <UnitSuggestionForm onSubmitted={() => undefined} />
        ) : null}
        {view === "categories" && categoryParentId ? (
          <Card>
            <CardHeader className="p-4 text-sm font-medium">规格模板</CardHeader>
            <CardContent className="p-0">
              {specsLoading ? (
                <div className="p-4 text-sm text-muted-foreground">加载中...</div>
              ) : specs.length === 0 ? (
                <div className="p-4 text-sm text-muted-foreground">
                  该分类暂无规格模板
                </div>
              ) : (
                <ul className="divide-y text-sm">
                  {specs.map((spec) => (
                    <li key={spec.id} className="flex items-center gap-3 p-3">
                      <span>{spec.name}</span>
                      <span className="text-muted-foreground">
                        {specValueTypeLabel(spec.value_type)}
                      </span>
                      {spec.required ? <span>必填</span> : null}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        ) : null}
        {categoryDialog ? (
          <TenantCategoryDialog
            category={categoryDialog.category}
            parentId={categoryDialog.parentId}
            onClose={() => setCategoryDialog(null)}
            onSaved={() => setReload((current) => current + 1)}
          />
        ) : null}
        {brandDialog ? (
          <TenantBrandDialog
            brand={brandDialog.brand}
            onClose={() => setBrandDialog(null)}
            onSaved={() => setReload((current) => current + 1)}
          />
        ) : null}
      </Tabs>
    </div>
  );
}

function CategoryRow({
  category,
  onOpen,
  onEdit,
}: {
  category: TenantCatalogCategory;
  onOpen: () => void;
  onEdit: () => void;
}) {
  return (
    <tr
      className="cursor-pointer border-b hover:bg-muted/30"
      onClick={onOpen}
    >
      <td className="p-3">
        <span className="font-medium">{category.full_name ?? category.name}</span>
        {!category.is_leaf ? (
          <span className="ml-2 text-xs text-muted-foreground">含子分类</span>
        ) : null}
      </td>
      <td className="p-3">{category.code}</td>
      <td className="p-3">
        <SourceBadge source={category.ownership_scope} />
      </td>
      <td className="p-3">{category.mapped_platform_category_id ?? "-"}</td>
      <td className="p-3">
        {category.ownership_scope === "tenant" ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={(event) => {
              event.stopPropagation();
              onEdit();
            }}
          >
            编辑
          </Button>
        ) : (
          <span className="text-xs text-muted-foreground">只读</span>
        )}
      </td>
    </tr>
  );
}

function BrandRow({
  brand,
  onEdit,
}: {
  brand: TenantCatalogBrand;
  onEdit: () => void;
}) {
  return (
    <tr className="border-b">
      <td className="p-3">{brand.name}</td>
      <td className="p-3">{brand.code}</td>
      <td className="p-3">
        <SourceBadge source={brand.ownership_scope} />
      </td>
      <td className="p-3">{brand.mapped_platform_brand_id ?? "-"}</td>
      <td className="p-3">
        {brand.ownership_scope === "tenant" ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={onEdit}
          >
            编辑
          </Button>
        ) : (
          <span className="text-xs text-muted-foreground">只读</span>
        )}
      </td>
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
