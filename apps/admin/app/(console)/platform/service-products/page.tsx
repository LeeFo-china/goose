import { redirect } from "next/navigation";
import { BriefcaseBusiness } from "lucide-react";

import { PlatformListPageShell } from "@/components/platform/platform-list-shell";
import { normalizePlatformListPageSize } from "@/components/platform/platform-list-page-size";
import {
  buildPlatformServiceProductQuery,
  getListCurrentCount,
} from "@/components/platform-service-products/platform-service-product-rules";
import { PlatformServiceProductFormButton } from "@/components/platform-service-products/platform-service-product-form";
import { PlatformServiceProductTable } from "@/components/platform-service-products/platform-service-product-table";
import type {
  PageData,
  PlatformServiceProductListItem,
} from "@/components/platform-service-products/platform-service-product-types";
import { getAdminSession, getAdminToken } from "@/lib/auth";
import { buildBackendUrl, parseBackendJson } from "@/lib/backend";
import { isPlatformOnlySession } from "@/lib/session-mode";

const MANAGE_PERMISSION = "platform.service_product.manage";

type SearchParams = Promise<{
  page?: string;
  pageSize?: string;
}>;

function emptyPage(page: number, pageSize: number): PageData<PlatformServiceProductListItem> {
  return {
    list: [],
    pagination: { page, pageSize, total: 0, totalPages: 0 },
  };
}

function normalizePage(value: string | undefined) {
  const page = Number(value || 1);
  return Number.isSafeInteger(page) && page > 0 ? page : 1;
}

async function getPlatformServiceProductsPage(query: string) {
  const token = await getAdminToken();
  if (!token) throw new Error("缺少登录凭证");
  const response = await fetch(
    buildBackendUrl(`/platform/billing/service-products?${query}`),
    {
      headers: { authorization: `Bearer ${token}` },
      cache: "no-store",
    },
  );
  const payload =
    await parseBackendJson<PageData<PlatformServiceProductListItem>>(response);
  if (!payload.data) throw new Error("接口未返回平台技术服务套餐列表");
  return payload.data;
}

export default async function PlatformServiceProductsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const session = await getAdminSession();
  if (!session) redirect("/login");

  const permissions = new Set(session.permissions.map((item) => item.code));
  const isPlatformAdmin = isPlatformOnlySession(session);
  const canManage = isPlatformAdmin && permissions.has(MANAGE_PERMISSION);
  const params = await searchParams;
  const page = normalizePage(params.page);
  const pageSize = normalizePlatformListPageSize(params.pageSize);

  let products = emptyPage(page, pageSize);
  let error: string | null = null;

  if (!canManage) {
    error = "当前账号缺少平台技术服务套餐管理权限";
  } else {
    try {
      const query = buildPlatformServiceProductQuery({ page, pageSize });
      products = await getPlatformServiceProductsPage(query);
    } catch (caught) {
      error = caught instanceof Error ? caught.message : "平台技术服务套餐列表加载失败";
    }
  }

  return (
    <div className="flex h-[calc(100vh-6.5625rem)] min-h-0 flex-col gap-5 overflow-hidden">
      <PlatformListPageShell
        title="技术服务套餐"
        description="管理平台技术服务 1年 / 2年 / 3年套餐的价格、折扣、服务范围和发布版本。"
        leading={
          <span className="flex size-10 shrink-0 items-center justify-center rounded-md border bg-card text-muted-foreground">
            <BriefcaseBusiness className="size-4" aria-hidden="true" />
          </span>
        }
        action={canManage ? <PlatformServiceProductFormButton /> : null}
        error={error}
        listHeader={
          <div className="text-sm text-muted-foreground">
            修改草稿后需点击“发布套餐”，小程序端才会读取新的购买版本。
          </div>
        }
        pagination={products.pagination}
        currentCount={getListCurrentCount({
          products: products.list,
          pageSize,
          total: products.pagination.total,
        })}
        tableViewportTestId="platform-service-products-table-viewport"
        unit="个"
      >
        <PlatformServiceProductTable products={products.list} canManage={canManage} />
      </PlatformListPageShell>
    </div>
  );
}
