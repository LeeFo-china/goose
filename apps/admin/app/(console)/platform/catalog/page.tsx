import Link from "next/link";
import { redirect } from "next/navigation";
import { PackageSearch } from "lucide-react";

import { PlatformListPageShell } from "@/components/platform/platform-list-shell";
import { normalizePlatformListPageSize } from "@/components/platform/platform-list-page-size";
import {
  platformTabsListClassName,
  platformTabsTriggerClassName,
} from "@/components/platform/platform-tabs";
import {
  CatalogBrandDialogButton,
  CatalogCategoryDialogButton,
  CatalogUnitDialogButton,
} from "@/components/supplier-catalog/supplier-catalog-dialogs";
import { CATALOG_CATEGORY_MAX_DEPTH } from "@/components/supplier-catalog/catalog-category-depth";
import { SupplierCatalogFilters } from "@/components/supplier-catalog/supplier-catalog-filters";
import { SupplierCatalogLoadError } from "@/components/supplier-catalog/supplier-catalog-error";
import { PlatformSuggestionFilters } from "@/components/supplier-catalog/platform-suggestion-filters";
import { PlatformUnitSuggestionTable } from "@/components/supplier-catalog/platform-unit-suggestions";
import { buildPlatformSuggestionListPath } from "@/components/supplier-catalog/supplier-catalog-v2-requests";
import {
  buildCatalogListPath,
  catalogViewHref,
  currentCategoryParent,
  decodeCategoryTrail,
  normalizeCatalogPage,
} from "@/components/supplier-catalog/supplier-catalog-rules";
import { SupplierCatalogTable } from "@/components/supplier-catalog/supplier-catalog-table";
import type {
  CatalogBrand,
  CatalogCategory,
  CatalogPage,
  CatalogStatus,
  CatalogUnit,
  CatalogUnitSuggestion,
  CatalogView,
  CategoryReturnState,
} from "@/components/supplier-catalog/supplier-catalog-types";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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

type PlatformCatalogView = CatalogView | "unit-suggestions";
type SuggestionStatus = "submitted" | "approved" | "rejected";

function readView(value: string | undefined): PlatformCatalogView {
  if (value === "brands" || value === "units" || value === "unit-suggestions") return value;
  return "categories";
}

function readStatus(value: string | undefined): CatalogStatus | "" {
  return value === "active" || value === "inactive" ? value : "";
}

function readSuggestionStatus(value: string | undefined): SuggestionStatus | "" {
  return value === "submitted" || value === "approved" || value === "rejected"
    ? value
    : "";
}

function emptyPage<RecordType>(
  page: number,
  pageSize: number,
): CatalogPage<RecordType> {
  return {
    list: [],
    pagination: { page, pageSize, total: 0, totalPages: 0 },
  };
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

export default async function PlatformCatalogPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const session = await getAdminSession();
  if (!session) redirect("/login");

  const params = await searchParams;
  const permissions = new Set(session.permissions.map((item) => item.code));
  const canManage = session.roles.includes("platform_admin") &&
    permissions.has("platform.catalog.manage");
  const view = readView(params.view);
  const page = normalizeCatalogPage(params.page);
  const pageSize = normalizePlatformListPageSize(params.pageSize);
  const keyword = (params.keyword || "").trim().slice(0, 80);
  const status = readStatus(params.status);
  const suggestionStatus = readSuggestionStatus(params.status);
  const categoryTrail = view === "categories"
    ? decodeCategoryTrail(params.categoryPath)
    : [];
  const parentId = currentCategoryParent(categoryTrail);
  const parentName = categoryTrail.at(-1)?.name ?? "根级";
  const listPath = view === "unit-suggestions"
    ? buildPlatformSuggestionListPath({
        page,
        pageSize,
        status: suggestionStatus,
        tenantId: "",
      })
    : buildCatalogListPath({
        view,
        page,
        pageSize,
        keyword,
        status,
        parentId,
      });

  let categories = emptyPage<CatalogCategory>(page, pageSize);
  let brands = emptyPage<CatalogBrand>(page, pageSize);
  let units = emptyPage<CatalogUnit>(page, pageSize);
  let suggestions = emptyPage<CatalogUnitSuggestion>(page, pageSize);
  let error: string | null = null;

  if (!canManage) {
    error = "当前账号缺少供应标准目录管理权限";
  } else {
    try {
      if (view === "categories") {
        categories = await getCatalogPage<CatalogCategory>(listPath);
      } else if (view === "brands") {
        brands = await getCatalogPage<CatalogBrand>(listPath);
      } else {
        if (view === "units") {
          units = await getCatalogPage<CatalogUnit>(listPath);
        } else suggestions = await getCatalogPage<CatalogUnitSuggestion>(listPath);
      }
    } catch (caught) {
      error = caught instanceof Error ? caught.message : "供应标准目录加载失败";
    }
  }

  const currentPage = view === "categories"
    ? categories
    : view === "brands"
      ? brands
      : view === "units"
        ? units
        : suggestions;
  const categoryReturnState: CategoryReturnState = {
    page,
    pageSize,
    keyword,
    status,
  };

  return (
    <div className="flex h-[calc(100vh-6.5625rem)] min-h-0 flex-col gap-5 overflow-hidden">
      <Tabs value={view} className="contents">
        <PlatformListPageShell
          title="供应标准目录"
          description="统一维护供应商商品使用的标准类目、品牌和计量单位。"
          leading={
            <span className="flex size-10 shrink-0 items-center justify-center rounded-md border bg-card text-muted-foreground">
              <PackageSearch className="size-4" aria-hidden="true" />
            </span>
          }
          action={canManage
            ? view === "categories" &&
                categoryTrail.length < CATALOG_CATEGORY_MAX_DEPTH
              ? (
                  <CatalogCategoryDialogButton
                    parentId={parentId}
                    parentName={parentName}
                    parentLevel={categoryTrail.length}
                  />
                )
              : view === "brands"
                ? <CatalogBrandDialogButton />
                : view === "units"
                  ? <CatalogUnitDialogButton />
                  : null
            : null}
          tabs={
            <div>
              <TabsList className={`${platformTabsListClassName} flex-wrap overflow-visible`}>
                <CatalogTab value="categories" label="标准类目" pageSize={pageSize} />
                <CatalogTab value="brands" label="品牌" pageSize={pageSize} />
                <CatalogTab value="units" label="单位" pageSize={pageSize} />
                <CatalogTab value="unit-suggestions" label="单位建议" pageSize={pageSize} />
              </TabsList>
            </div>
          }
          filters={view === "unit-suggestions"
            ? <PlatformSuggestionFilters status={suggestionStatus} />
            : <SupplierCatalogFilters keyword={keyword} status={status} />}
          pagination={currentPage.pagination}
          currentCount={currentPage.list.length}
          tableViewportTestId="supplier-catalog-table-viewport"
          unit={view === "categories" ? "个类目" : view === "brands" ? "个品牌" : view === "units" ? "个单位" : "条建议"}
        >
          {error ? (
            <SupplierCatalogLoadError
              message={error}
              canRetry={canManage}
            />
          ) : (
            view === "unit-suggestions" ? (
              <PlatformUnitSuggestionTable records={suggestions.list} />
            ) : (
              <SupplierCatalogTable
                view={view}
                categories={categories.list}
                brands={brands.list}
                units={units.list}
                categoryTrail={categoryTrail}
                categoryReturnState={categoryReturnState}
              />
            )
          )}
        </PlatformListPageShell>
      </Tabs>
    </div>
  );
}
function CatalogTab({
  value,
  label,
  pageSize,
}: {
  value: PlatformCatalogView;
  label: string;
  pageSize: number;
}) {
  const href = new URL(
    value === "unit-suggestions"
      ? "/platform/catalog?view=unit-suggestions"
      : catalogViewHref(value),
    "http://admin.local",
  );
  href.searchParams.set("pageSize", String(pageSize));

  return (
    <TabsTrigger
      value={value}
      className={platformTabsTriggerClassName}
      asChild
    >
      <Link href={`${href.pathname}${href.search}`}>{label}</Link>
    </TabsTrigger>
  );
}
