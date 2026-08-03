import { redirect } from "next/navigation";
import { PackageOpen } from "lucide-react";
import type { VirtualBenefitType, VirtualProductStatus } from "@gooes/domain";

import { PlatformListPageShell } from "@/components/platform/platform-list-shell";
import { normalizePlatformListPageSize } from "@/components/platform/platform-list-page-size";
import { PlatformVirtualProductFilters } from "@/components/platform-virtual-products/platform-virtual-product-filters";
import { PlatformVirtualProductFormButton } from "@/components/platform-virtual-products/platform-virtual-product-form";
import {
  buildVirtualProductQuery,
  getListCurrentCount,
} from "@/components/platform-virtual-products/platform-virtual-product-rules";
import { PlatformVirtualProductTable } from "@/components/platform-virtual-products/platform-virtual-product-table";
import type {
  PageData,
  PlatformVirtualProductListItem,
} from "@/components/platform-virtual-products/platform-virtual-product-types";
import { getAdminSession, getAdminToken } from "@/lib/auth";
import { buildBackendUrl, parseBackendJson } from "@/lib/backend";
import { isPlatformOnlySession } from "@/lib/session-mode";

const PRODUCT_TYPES = ["duration", "count", "points", "quota"] as const;
const PRODUCT_STATUSES = ["draft", "active", "suspended", "archived"] as const;
const READ_PERMISSION = "platform.virtual_product.read";
const MANAGE_PERMISSION = "platform.virtual_product.manage";
const PUBLISH_PERMISSION = "platform.virtual_product.publish";

type SearchParams = Promise<{
  page?: string;
  pageSize?: string;
  keyword?: string;
  product_type?: string;
  status?: string;
}>;

function emptyPage(page: number, pageSize: number): PageData<PlatformVirtualProductListItem> {
  return {
    list: [],
    pagination: { page, pageSize, total: 0, totalPages: 0 },
  };
}

function readEnum<Value extends string>(
  value: string | undefined,
  values: readonly Value[],
) {
  return values.includes(value as Value) ? (value as Value) : "";
}

function normalizePage(value: string | undefined) {
  const page = Number(value || 1);
  return Number.isSafeInteger(page) && page > 0 ? page : 1;
}

async function getVirtualProductsPage(query: string) {
  const token = await getAdminToken();
  if (!token) throw new Error("缺少登录凭证");
  const response = await fetch(buildBackendUrl(`/platform/virtual-products?${query}`), {
    headers: { authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  const payload = await parseBackendJson<PageData<PlatformVirtualProductListItem>>(response);
  if (!payload.data) throw new Error("接口未返回虚拟商品列表");
  return payload.data;
}

export default async function PlatformVirtualProductsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const session = await getAdminSession();
  if (!session) redirect("/login");

  const permissions = new Set(session.permissions.map((item) => item.code));
  const isPlatformAdmin = isPlatformOnlySession(session);
  const canRead = isPlatformAdmin && permissions.has(READ_PERMISSION);
  const canManage = isPlatformAdmin && permissions.has(MANAGE_PERMISSION);
  const canPublish = isPlatformAdmin && permissions.has(PUBLISH_PERMISSION);
  const params = await searchParams;
  const page = normalizePage(params.page);
  const pageSize = normalizePlatformListPageSize(params.pageSize);
  const keyword = (params.keyword || "").trim().slice(0, 120);
  const productType = readEnum(params.product_type, PRODUCT_TYPES);
  const status = readEnum(params.status, PRODUCT_STATUSES);

  let products = emptyPage(page, pageSize);
  let error: string | null = null;

  if (!canRead) {
    error = "当前账号缺少虚拟商品查看权限";
  } else {
    try {
      const query = buildVirtualProductQuery({
        page,
        pageSize,
        keyword,
        productType: productType as VirtualBenefitType | "",
        status: status as VirtualProductStatus | "",
      });
      products = await getVirtualProductsPage(query);
    } catch (caught) {
      error = caught instanceof Error ? caught.message : "虚拟商品列表加载失败";
    }
  }

  return (
    <div className="flex h-[calc(100vh-6.5625rem)] min-h-0 flex-col gap-5 overflow-hidden">
      <PlatformListPageShell
        title="虚拟商品"
        description="统一管理平台数字权益商品，系统自动生成渠道商品 ID，并承接微信虚拟商品上传、发布和校验。"
        leading={
          <span className="flex size-10 shrink-0 items-center justify-center rounded-md border bg-card text-muted-foreground">
            <PackageOpen className="size-4" aria-hidden="true" />
          </span>
        }
        action={canRead && canManage ? <PlatformVirtualProductFormButton /> : null}
        error={error}
        filters={
          <PlatformVirtualProductFilters
            keyword={keyword}
            productType={productType}
            status={status}
          />
        }
        pagination={products.pagination}
        currentCount={getListCurrentCount({
          products: products.list,
          pageSize,
          total: products.pagination.total,
        })}
        tableViewportTestId="platform-virtual-products-table-viewport"
        unit="个"
      >
        <PlatformVirtualProductTable
          products={products.list}
          canManage={canManage}
          canPublish={canPublish}
        />
      </PlatformListPageShell>
    </div>
  );
}
