import { redirect } from "next/navigation";
import { BadgeCheck } from "lucide-react";

import { StatusAlert } from "@/components/admin/status-alert";
import { PlatformBrandingAdminTabs } from "@/components/branding-addon/platform-branding-admin-tabs";
import { PlatformBrandingEntitlementOrders } from "@/components/branding-addon/platform-branding-entitlement-orders";
import type {
  PlatformBrandingAddonProductResult,
  PlatformBrandingEntitlementOrder,
  PlatformBrandingPaymentReadiness,
  PlatformBrandingPageData,
  PlatformBrandingVirtualRefund,
} from "@/components/branding-addon/platform-branding-addon-product-types";
import { PlatformBrandingVirtualProductForm } from "@/components/branding-addon/platform-branding-virtual-product-form";
import { PlatformBrandingVirtualRefunds } from "@/components/branding-addon/platform-branding-virtual-refunds";
import { normalizePlatformListPageSize } from "@/components/platform/platform-list-page-size";
import { TabsContent } from "@/components/ui/tabs";
import { getAdminSession, getAdminToken } from "@/lib/auth";
import { buildBackendUrl, parseBackendJson } from "@/lib/backend";
import { isPlatformOnlySession } from "@/lib/session-mode";

const MANAGE_PERMISSION = "platform.branding_product.manage";
const ORDER_READ_PERMISSION = "platform.branding_order.read";
const REFUND_MANAGE_PERMISSION = "platform.branding_virtual_refund.manage";
const PAYMENT_CONFIG_READ_PERMISSION = "platform.payment.config.read";
const PAYMENT_CONFIG_MANAGE_PERMISSION = "platform.payment.config.manage";

const PAYMENT_CHANNELS = ["legacy_direct", "wechat_virtual"] as const;
const PAYMENT_STATUSES = ["pending", "succeeded", "closed", "failed"] as const;
const FULFILLMENT_STATUSES = ["pending", "granted", "grant_failed"] as const;
const REFUND_STATUSES = [
  "none", "reviewing", "submitted", "external_required", "succeeded",
  "failed", "rejected",
] as const;
const REFUND_LIST_STATUSES = REFUND_STATUSES.filter((status) => status !== "none");

type BrandingView = "product" | "orders" | "refunds";
type PlatformPaymentReadinessResult = {
  product?: { version?: number };
  readiness?: PlatformBrandingPaymentReadiness;
};
type SearchParams = Promise<{
  view?: string;
  page?: string;
  pageSize?: string;
  keyword?: string;
  payment_channel?: string;
  payment_status?: string;
  fulfillment_status?: string;
  refund_status?: string;
}>;

function emptyPage<RecordType>(page: number, pageSize: number): PlatformBrandingPageData<RecordType> {
  return {
    list: [],
    pagination: { page, pageSize, total: 0, totalPages: 0 },
  };
}

function readEnum<Value extends string>(value: string | undefined, values: readonly Value[]) {
  return values.includes(value as Value) ? value as Value : "";
}

function normalizePage(value: string | undefined) {
  const page = Number(value || 1);
  return Number.isSafeInteger(page) && page > 0 ? page : 1;
}

async function getBackendData<Result>(path: string): Promise<Result> {
  const token = await getAdminToken();
  if (!token) throw new Error("缺少登录凭证");
  const response = await fetch(buildBackendUrl(path), {
    headers: { authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  const payload = await parseBackendJson<Result>(response);
  if (!payload.data) throw new Error("接口未返回管理数据");
  return payload.data;
}

export default async function PlatformBrandingAddonPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const session = await getAdminSession();
  if (!session) redirect("/login");

  const isPlatformAdmin = isPlatformOnlySession(session);
  const permissions = new Set(session.permissions.map((permission) => permission.code));
  const canManage = isPlatformAdmin && permissions.has(MANAGE_PERMISSION);
  const canReadOrders = isPlatformAdmin && permissions.has(ORDER_READ_PERMISSION);
  const canManageRefunds = isPlatformAdmin && permissions.has(REFUND_MANAGE_PERMISSION);
  const canReadPaymentConfig = isPlatformAdmin && (
    permissions.has(PAYMENT_CONFIG_READ_PERMISSION) ||
    permissions.has(PAYMENT_CONFIG_MANAGE_PERMISSION)
  );
  const allowedViews: BrandingView[] = [
    ...(canManage ? ["product" as const] : []),
    ...(canReadOrders ? ["orders" as const] : []),
    ...(canManageRefunds ? ["refunds" as const] : []),
  ];
  const params = await searchParams;
  const requestedView = params.view === "orders" || params.view === "refunds"
    ? params.view
    : "product";
  const view = allowedViews.includes(requestedView)
    ? requestedView
    : allowedViews[0] ?? "product";
  const page = normalizePage(params.page);
  const pageSize = normalizePlatformListPageSize(params.pageSize);
  const keyword = (params.keyword ?? "").trim().slice(0, 120);
  const paymentChannel = readEnum(params.payment_channel, PAYMENT_CHANNELS);
  const paymentStatus = readEnum(params.payment_status, PAYMENT_STATUSES);
  const fulfillmentStatus = readEnum(params.fulfillment_status, FULFILLMENT_STATUSES);
  const refundStatus = readEnum(params.refund_status, REFUND_STATUSES);
  const refundListStatus = readEnum(params.refund_status, REFUND_LIST_STATUSES);

  let productResult: PlatformBrandingAddonProductResult | null = null;
  let paymentReadiness: PlatformBrandingPaymentReadiness | null = null;
  let orders = emptyPage<PlatformBrandingEntitlementOrder>(page, pageSize);
  let refunds = emptyPage<PlatformBrandingVirtualRefund>(page, pageSize);
  let error: string | null = allowedViews.length ? null : "当前账号没有品牌权益管理权限";

  try {
    if (view === "product" && canManage) {
      const paymentSnapshotRequest = canReadPaymentConfig
        ? getBackendData<PlatformPaymentReadinessResult>(
          "/platform/payment/wechat-virtual/branding-entitlement",
        ).catch(() => null)
        : Promise.resolve(null);
      let paymentSnapshot: PlatformPaymentReadinessResult | null;
      [productResult, paymentSnapshot] = await Promise.all([
        getBackendData<PlatformBrandingAddonProductResult>(
          "/platform/branding/entitlement-product",
        ),
        paymentSnapshotRequest,
      ]);
      paymentReadiness = paymentSnapshot &&
          paymentSnapshot.product?.version === productResult.product.version
        ? paymentSnapshot.readiness ?? null
        : null;
    }
    if (view === "orders" && canReadOrders) {
      orders = await getBackendData<PlatformBrandingPageData<PlatformBrandingEntitlementOrder>>(
        `/platform/branding/entitlement-orders?${buildOrderQuery({
          page,
          pageSize,
          keyword,
          paymentChannel,
          paymentStatus,
          fulfillmentStatus,
          refundStatus,
        })}`,
      );
    }
    if (view === "refunds" && canManageRefunds) {
      refunds = await getBackendData<PlatformBrandingPageData<PlatformBrandingVirtualRefund>>(
        `/platform/branding/virtual-payment/refunds?${buildRefundQuery({
          page,
          pageSize,
          status: refundListStatus,
        })}`,
      );
    }
  } catch (caught) {
    error = caught instanceof Error ? caught.message : "品牌权益管理数据加载失败";
  }

  const orderPageHrefs = buildPageHrefs(view, orders.pagination, params);
  const refundPageHrefs = buildPageHrefs(view, refunds.pagination, params);

  return (
    <div className="flex h-[calc(100vh-6.5625rem)] min-h-0 flex-col gap-5 overflow-hidden">
      <div className="flex min-w-0 shrink-0 items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-md border bg-card text-muted-foreground">
          <BadgeCheck className="size-4" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-normal">品牌权益商品</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            管理数字权益商品、统一售价、支付订单和退款权益冲销。
          </p>
        </div>
      </div>

      {error ? <StatusAlert>{error}</StatusAlert> : null}

      {allowedViews.length ? (
        <PlatformBrandingAdminTabs
          value={view}
          canManage={canManage}
          canReadOrders={canReadOrders}
          canManageRefunds={canManageRefunds}
        >
          {view === "product" && productResult ? (
            <TabsContent value="product" className="mt-3 flex min-h-0 flex-1 flex-col">
              <PlatformBrandingVirtualProductForm
                key={`${productResult.product.version}-${productResult.virtual_products?.map((item) => item.mapping?.version ?? 0).join("-")}`}
                initialProduct={productResult.product}
                paymentSummaries={productResult.virtual_products ?? []}
                paymentReadiness={paymentReadiness}
              />
            </TabsContent>
          ) : null}
          {view === "orders" ? (
            <TabsContent value="orders" className="mt-3 flex min-h-0 flex-1 flex-col">
              <PlatformBrandingEntitlementOrders
                data={orders}
                filters={{ keyword, paymentChannel, paymentStatus, fulfillmentStatus, refundStatus }}
                previousHref={orderPageHrefs.previous}
                nextHref={orderPageHrefs.next}
                canRefund={canManageRefunds}
              />
            </TabsContent>
          ) : null}
          {view === "refunds" ? (
            <TabsContent value="refunds" className="mt-3 flex min-h-0 flex-1 flex-col">
              <PlatformBrandingVirtualRefunds
                data={refunds}
                status={refundListStatus}
                previousHref={refundPageHrefs.previous}
                nextHref={refundPageHrefs.next}
              />
            </TabsContent>
          ) : null}
        </PlatformBrandingAdminTabs>
      ) : null}
    </div>
  );
}

function buildOrderQuery(input: {
  page: number;
  pageSize: number;
  keyword: string;
  paymentChannel: string;
  paymentStatus: string;
  fulfillmentStatus: string;
  refundStatus: string;
}) {
  const query = new URLSearchParams({ page: String(input.page), pageSize: String(input.pageSize) });
  if (input.keyword) query.set("keyword", input.keyword);
  if (input.paymentChannel) query.set("payment_channel", input.paymentChannel);
  if (input.paymentStatus) query.set("payment_status", input.paymentStatus);
  if (input.fulfillmentStatus) query.set("fulfillment_status", input.fulfillmentStatus);
  if (input.refundStatus) query.set("refund_status", input.refundStatus);
  return query.toString();
}

function buildRefundQuery(input: { page: number; pageSize: number; status: string }) {
  const query = new URLSearchParams({ page: String(input.page), pageSize: String(input.pageSize) });
  if (input.status) query.set("status", input.status);
  return query.toString();
}

function buildPageHrefs(
  view: BrandingView,
  pagination: PlatformBrandingPageData<unknown>["pagination"],
  params: Awaited<SearchParams>,
) {
  const build = (nextPage: number) => {
    const query = new URLSearchParams();
    query.set("view", view);
    query.set("page", String(nextPage));
    query.set("pageSize", String(pagination.pageSize));
    for (const key of ["keyword", "payment_channel", "payment_status", "fulfillment_status", "refund_status"] as const) {
      const value = params[key];
      if (value && value !== "all") query.set(key, value);
    }
    return `/platform/branding-addon?${query.toString()}`;
  };
  return {
    previous: pagination.page > 1 ? build(pagination.page - 1) : null,
    next: pagination.page < pagination.totalPages ? build(pagination.page + 1) : null,
  };
}
