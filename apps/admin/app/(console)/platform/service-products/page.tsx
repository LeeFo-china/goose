import Link from "next/link";
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
import { PlatformServicePromotionFormButton } from "@/components/platform-service-promotions/platform-service-promotion-form";
import { PlatformServicePromotionTable } from "@/components/platform-service-promotions/platform-service-promotion-table";
import type { PlatformServicePromotionPage } from "@/components/platform-service-promotions/platform-service-promotion-types";
import { platformTabsListClassName, platformTabsTriggerClassName } from "@/components/platform/platform-tabs";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getAdminSession, getAdminToken } from "@/lib/auth";
import { buildBackendUrl, parseBackendJson } from "@/lib/backend";
import { isPlatformOnlySession } from "@/lib/session-mode";

const MANAGE_PERMISSION = "platform.service_product.manage";

type SearchParams = Promise<{
  tab?: string;
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

async function getPlatformServicePage<T>(path: string) {
  const token = await getAdminToken();
  if (!token) throw new Error("缺少登录凭证");
  const response = await fetch(
    buildBackendUrl(path),
    {
      headers: { authorization: `Bearer ${token}` },
      cache: "no-store",
    },
  );
  const payload =
    await parseBackendJson<T>(response);
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
  const activeTab = params.tab === "promotions" ? "promotions" : "products";
  const page = normalizePage(params.page);
  const pageSize = normalizePlatformListPageSize(params.pageSize);

  let products = emptyPage(page, pageSize);
  let promotions: PlatformServicePromotionPage = { ...emptyPage(page, pageSize), list: [], server_time: "" };
  let error: string | null = null;

  if (!canManage) {
    error = "当前账号缺少平台技术服务套餐管理权限";
  } else {
    try {
      const query = buildPlatformServiceProductQuery({ page, pageSize });
      if (activeTab === "promotions") {
        promotions = await getPlatformServicePage<PlatformServicePromotionPage>(`/platform/billing/service-promotions?${query}`);
      } else {
        products = await getPlatformServicePage<PageData<PlatformServiceProductListItem>>(`/platform/billing/service-products?${query}`);
      }
    } catch (caught) {
      error = caught instanceof Error ? caught.message : "平台技术服务套餐列表加载失败";
    }
  }

  const isPromotions = activeTab === "promotions";
  const pagination = isPromotions ? promotions.pagination : products.pagination;

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
        action={canManage ? (isPromotions ? <PlatformServicePromotionFormButton /> : <PlatformServiceProductFormButton />) : null}
        error={error}
        tabs={
          <Tabs value={activeTab}>
            <TabsList className={platformTabsListClassName}>
              <TabsTrigger value="products" asChild className={platformTabsTriggerClassName}>
                <Link href={`/platform/service-products?tab=products&page=1&pageSize=${pageSize}`}>套餐</Link>
              </TabsTrigger>
              <TabsTrigger value="promotions" asChild className={platformTabsTriggerClassName}>
                <Link href={`/platform/service-products?tab=promotions&page=1&pageSize=${pageSize}`}>限时活动</Link>
              </TabsTrigger>
            </TabsList>
          </Tabs>
        }
        listHeader={
          <div className="text-sm text-muted-foreground">
            {isPromotions ? "限时活动统一覆盖三档套餐，保存草稿后需确认价格并发布。" : "修改草稿后需点击“发布套餐”，小程序端才会读取新的购买版本。"}
          </div>
        }
        pagination={pagination}
        currentCount={isPromotions ? promotions.list.length : getListCurrentCount({
          products: products.list,
          pageSize,
          total: products.pagination.total,
        })}
        tableViewportTestId="platform-service-products-table-viewport"
        unit="个"
      >
        {isPromotions ? (
          <PlatformServicePromotionTable promotions={promotions.list} canManage={canManage} serverTime={promotions.server_time} />
        ) : (
          <PlatformServiceProductTable products={products.list} canManage={canManage} />
        )}
      </PlatformListPageShell>
    </div>
  );
}
