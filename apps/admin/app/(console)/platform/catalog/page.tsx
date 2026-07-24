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
import { SupplierCatalogFilters } from "@/components/supplier-catalog/supplier-catalog-filters";
import { SupplierCatalogLoadError } from "@/components/supplier-catalog/supplier-catalog-error";
import {
  buildCatalogListPath,
  catalogViewHref,
  categoryTrailHref,
  currentCategoryParent,
  decodeCategoryTrail,
  normalizeCatalogPage,
  parentCategoryHref,
} from "@/components/supplier-catalog/supplier-catalog-rules";
import { SupplierCatalogTable } from "@/components/supplier-catalog/supplier-catalog-table";
import type {
  CatalogBrand,
  CatalogCategory,
  CatalogPage,
  CatalogStatus,
  CatalogUnit,
  CatalogView,
  CategoryReturnState,
} from "@/components/supplier-catalog/supplier-catalog-types";
import { Button } from "@/components/ui/button";
import { CardTitle } from "@/components/ui/card";
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

function readView(value: string | undefined): CatalogView {
  if (value === "brands" || value === "units") return value;
  return "categories";
}

function readStatus(value: string | undefined): CatalogStatus | "" {
  return value === "active" || value === "inactive" ? value : "";
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
  const categoryTrail = view === "categories"
    ? decodeCategoryTrail(params.categoryPath)
    : [];
  const parentId = currentCategoryParent(categoryTrail);
  const parentName = categoryTrail.at(-1)?.name ?? "根级";
  const listPath = buildCatalogListPath({
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
        units = await getCatalogPage<CatalogUnit>(listPath);
      }
    } catch (caught) {
      error = caught instanceof Error ? caught.message : "供应标准目录加载失败";
    }
  }

  const currentPage = view === "categories"
    ? categories
    : view === "brands"
      ? brands
      : units;
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
            ? view === "categories"
              ? (
                  <CatalogCategoryDialogButton
                    parentId={parentId}
                    parentName={parentName}
                    parentLevel={categoryTrail.length}
                  />
                )
              : view === "brands"
                ? <CatalogBrandDialogButton />
                : <CatalogUnitDialogButton />
            : null}
          tabs={
            <div className="overflow-x-auto">
              <TabsList className={platformTabsListClassName}>
                <CatalogTab value="categories" label="标准类目" />
                <CatalogTab value="brands" label="品牌" />
                <CatalogTab value="units" label="单位" />
              </TabsList>
            </div>
          }
          listHeader={
            <div className="flex flex-col gap-2">
              <CardTitle>{view === "categories" ? "标准类目" : view === "brands" ? "品牌" : "单位"}</CardTitle>
              {view === "categories" ? (
                <CategoryLocation trail={categoryTrail} />
              ) : null}
            </div>
          }
          filters={<SupplierCatalogFilters keyword={keyword} status={status} />}
          pagination={currentPage.pagination}
          currentCount={currentPage.list.length}
          tableViewportTestId="supplier-catalog-table-viewport"
          unit={view === "categories" ? "个类目" : view === "brands" ? "个品牌" : "个单位"}
        >
          {error ? (
            <SupplierCatalogLoadError
              message={error}
              canRetry={canManage}
            />
          ) : (
            <SupplierCatalogTable
              view={view}
              categories={categories.list}
              brands={brands.list}
              units={units.list}
              categoryTrail={categoryTrail}
              categoryReturnState={categoryReturnState}
            />
          )}
        </PlatformListPageShell>
      </Tabs>
    </div>
  );
}
function CatalogTab({
  value,
  label,
}: {
  value: CatalogView;
  label: string;
}) {
  return (
    <TabsTrigger
      value={value}
      className={platformTabsTriggerClassName}
      asChild
    >
      <Link href={catalogViewHref(value)}>{label}</Link>
    </TabsTrigger>
  );
}

function CategoryLocation({
  trail,
}: {
  trail: ReturnType<typeof decodeCategoryTrail>;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      {trail.length ? (
        <Button type="button" size="sm" variant="outline" asChild>
          <Link href={parentCategoryHref(trail)}>返回上级</Link>
        </Button>
      ) : null}
      <nav
        aria-label="标准类目当前位置"
        className="flex flex-wrap items-center gap-1 text-muted-foreground"
      >
        <Link className="hover:text-foreground" href="/platform/catalog">
          根级
        </Link>
        {trail.map((item, index) => (
          <span key={item.id} className="flex items-center gap-1">
            <span aria-hidden="true">/</span>
            <Link
              className="hover:text-foreground"
              href={categoryTrailHref(trail.slice(0, index + 1))}
            >
              {item.name}
            </Link>
          </span>
        ))}
      </nav>
    </div>
  );
}
