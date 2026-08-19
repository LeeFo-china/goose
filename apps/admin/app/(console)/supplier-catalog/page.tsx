import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft, ChevronRight, PackageSearch } from "lucide-react";

import { PlatformListPageShell } from "@/components/platform/platform-list-shell";
import { normalizePlatformListPageSize } from "@/components/platform/platform-list-page-size";
import { SupplierCatalogFilters } from "@/components/supplier-catalog/supplier-catalog-filters";
import { SupplierCatalogLoadError } from "@/components/supplier-catalog/supplier-catalog-error";
import { normalizeCatalogPage } from "@/components/supplier-catalog/supplier-catalog-rules";
import type {
  CatalogPage,
  CatalogStatus,
  CatalogUnitSuggestion,
} from "@/components/supplier-catalog/supplier-catalog-types";
import { TenantBrandDialogButton } from "@/components/tenant-supplier-catalog/tenant-brand-dialog";
import { TenantBrandTable } from "@/components/tenant-supplier-catalog/tenant-brand-table";
import { TenantCategoryDialogButton } from "@/components/tenant-supplier-catalog/tenant-category-dialog";
import { TenantCategoryTable } from "@/components/tenant-supplier-catalog/tenant-category-table";
import { buildTenantCatalogListPath } from "@/components/tenant-supplier-catalog/tenant-catalog-requests";
import {
  canCreateTenantCategoryAtTrail,
  currentTenantCategoryParent,
  decodeTenantCategoryTrail,
  tenantCategoryTrailHref,
  tenantParentCategoryHref,
} from "@/components/tenant-supplier-catalog/tenant-catalog-rules";
import type {
  TenantCatalogBrand,
  TenantCatalogCategory,
  TenantCatalogUnit,
  TenantCatalogView,
  UnitSuggestionStatus,
} from "@/components/tenant-supplier-catalog/tenant-catalog-types";
import {
  TenantUnitSuggestionDialogButton,
  TenantUnitSuggestionTable,
} from "@/components/tenant-supplier-catalog/tenant-unit-suggestions";
import { TenantUnitTable } from "@/components/tenant-supplier-catalog/tenant-unit-table";
import { UnitSuggestionFilters } from "@/components/tenant-supplier-catalog/unit-suggestion-filters";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { getAdminSession, getAdminToken } from "@/lib/auth";
import { buildBackendUrl, parseBackendJson } from "@/lib/backend";

type SearchParams = Promise<{
  view?: string;
  page?: string;
  pageSize?: string;
  keyword?: string;
  status?: string;
  categoryPath?: string;
}>;

function readView(value: string | undefined): TenantCatalogView {
  if (value === "brands" || value === "units" || value === "unit-suggestions") {
    return value;
  }
  return "categories";
}

function readCatalogStatus(value: string | undefined): CatalogStatus | "" {
  return value === "active" || value === "inactive" ? value : "";
}

function readSuggestionStatus(value: string | undefined): UnitSuggestionStatus | "" {
  return value === "submitted" || value === "approved" || value === "rejected"
    ? value
    : "";
}

function emptyPage<RecordType>(page: number, pageSize: number): CatalogPage<RecordType> {
  return { list: [], pagination: { page, pageSize, total: 0, totalPages: 0 } };
}

async function getCatalogPage<RecordType>(path: string) {
  const token = await getAdminToken();
  if (!token) throw new Error("缺少登录凭证");
  const response = await fetch(buildBackendUrl(path), {
    headers: { authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  const payload = await parseBackendJson<CatalogPage<RecordType>>(response);
  if (!payload.data) throw new Error("接口未返回目录列表数据");
  return payload.data;
}

export default async function TenantSupplierCatalogPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const session = await getAdminSession();
  if (!session) redirect("/login");
  const canManage = session.tenant !== null && session.permissions.some(
    ({ code }) => code === "supplier.catalog.manage",
  );
  const params = await searchParams;
  const view = readView(params.view);
  const page = normalizeCatalogPage(params.page);
  const pageSize = normalizePlatformListPageSize(params.pageSize);
  const keyword = (params.keyword ?? "").trim().slice(0, 80);
  const catalogStatus = readCatalogStatus(params.status);
  const suggestionStatus = readSuggestionStatus(params.status);
  const categoryTrail = view === "categories"
    ? decodeTenantCategoryTrail(params.categoryPath)
    : [];
  const parentId = currentTenantCategoryParent(categoryTrail);
  let categories = emptyPage<TenantCatalogCategory>(page, pageSize);
  let brands = emptyPage<TenantCatalogBrand>(page, pageSize);
  let units = emptyPage<TenantCatalogUnit>(page, pageSize);
  let suggestions = emptyPage<CatalogUnitSuggestion>(page, pageSize);
  let error: string | null = canManage ? null : "当前账号缺少供应商目录管理权限";

  if (canManage) {
    try {
      const path = buildTenantCatalogListPath({
        view,
        page,
        pageSize,
        keyword,
        status: view === "unit-suggestions" ? suggestionStatus : catalogStatus,
        parentId,
      });
      if (view === "categories") categories = await getCatalogPage(path);
      else if (view === "brands") brands = await getCatalogPage(path);
      else if (view === "units") units = await getCatalogPage(path);
      else suggestions = await getCatalogPage(path);
    } catch (caught) {
      error = caught instanceof Error ? caught.message : "供应商目录加载失败";
    }
  }

  const currentPage = view === "categories"
    ? categories
    : view === "brands"
      ? brands
      : view === "units"
        ? units
        : suggestions;
  const categoryReturnState = { page, pageSize, keyword, status: catalogStatus };
  const canCreateCategory = canCreateTenantCategoryAtTrail(categoryTrail);

  return (
    <div className="flex h-[calc(100vh-6.5625rem)] min-h-0 flex-col gap-5 overflow-hidden">
      <Tabs value={view} className="contents">
        <PlatformListPageShell
          title="供应商目录"
          description="组合使用平台标准资料与本租户永久私有的分类、品牌和规格。"
          leading={<span className="flex size-10 shrink-0 items-center justify-center rounded-md border bg-card text-muted-foreground"><PackageSearch aria-hidden="true" /></span>}
          action={canManage
            ? view === "categories"
              ? canCreateCategory
                ? <TenantCategoryDialogButton parentId={parentId} />
                : null
              : view === "brands"
                ? <TenantBrandDialogButton />
                : view === "unit-suggestions"
                  ? <TenantUnitSuggestionDialogButton />
                  : null
            : null}
          tabs={
            <TabsList className="h-auto w-full flex-wrap justify-start gap-2 bg-transparent p-0">
              <CatalogTab value="categories" label="分类" pageSize={pageSize} />
              <CatalogTab value="brands" label="品牌" pageSize={pageSize} />
              <CatalogTab value="units" label="单位" pageSize={pageSize} />
              <CatalogTab value="unit-suggestions" label="单位建议" pageSize={pageSize} />
            </TabsList>
          }
          filters={view === "unit-suggestions"
            ? <UnitSuggestionFilters status={suggestionStatus} />
            : <SupplierCatalogFilters keyword={keyword} status={catalogStatus} />}
          listHeader={view === "categories" && categoryTrail.length ? (
            <nav aria-label="分类路径" className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
              <Button type="button" size="sm" variant="ghost" asChild>
                <Link href={tenantParentCategoryHref(categoryTrail)}><ChevronLeft data-icon="inline-start" />返回上级</Link>
              </Button>
              <Button type="button" size="sm" variant="ghost" asChild>
                <Link href="/supplier-catalog">根级</Link>
              </Button>
              {categoryTrail.map((item, index) => (
                <span key={item.id} className="flex items-center gap-1">
                  <ChevronRight className="size-3.5" aria-hidden="true" />
                  <Button type="button" size="sm" variant={index === categoryTrail.length - 1 ? "secondary" : "ghost"} asChild>
                    <Link href={tenantCategoryTrailHref(categoryTrail.slice(0, index + 1))}>{item.name}</Link>
                  </Button>
                </span>
              ))}
            </nav>
          ) : null}
          pagination={currentPage.pagination}
          currentCount={currentPage.list.length}
          tableViewportTestId="tenant-supplier-catalog-table-viewport"
          unit={view === "categories" ? "个分类" : view === "brands" ? "个品牌" : view === "units" ? "个单位" : "条建议"}
        >
          {error ? <SupplierCatalogLoadError message={error} canRetry={canManage} /> : view === "categories"
            ? <TenantCategoryTable
                records={categories.list}
                categoryTrail={categoryTrail}
                categoryReturnState={categoryReturnState}
              />
            : view === "brands"
              ? <TenantBrandTable records={brands.list} />
              : view === "units"
                ? <TenantUnitTable records={units.list} />
                : <TenantUnitSuggestionTable records={suggestions.list} />}
        </PlatformListPageShell>
      </Tabs>
    </div>
  );
}

function CatalogTab({ value, label, pageSize }: { value: TenantCatalogView; label: string; pageSize: number }) {
  const query = new URLSearchParams({ pageSize: String(pageSize) });
  if (value !== "categories") query.set("view", value);
  return <TabsTrigger value={value} asChild><Link href={`/supplier-catalog?${query}`}>{label}</Link></TabsTrigger>;
}
