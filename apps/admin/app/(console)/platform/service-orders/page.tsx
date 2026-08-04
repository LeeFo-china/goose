import Link from "next/link";
import { redirect } from "next/navigation";
import { BriefcaseBusiness } from "lucide-react";

import { PlatformListPageShell } from "@/components/platform/platform-list-shell";
import { normalizePlatformListPageSize } from "@/components/platform/platform-list-page-size";
import {
  platformTabsListClassName,
  platformTabsTriggerClassName,
} from "@/components/platform/platform-tabs";
import { PlatformServiceOrderFilters } from "@/components/platform-service-orders/platform-service-order-filters";
import {
  buildQuery,
  buildServiceOrderQuery,
  buildServiceRefundRequestQuery,
  buildServiceWorkOrderQuery,
  cleanParam,
  getListCurrentCount,
  normalizePlatformServiceTab,
  paymentStatusOptions,
  pickParam,
  readPositiveInteger,
  refundStatusOptions,
  serviceStatusOptions,
} from "@/components/platform-service-orders/platform-service-order-rules";
import { PlatformServiceOrderTable } from "@/components/platform-service-orders/platform-service-order-table";
import { PlatformServiceRefundRequestTable } from "@/components/platform-service-orders/platform-service-refund-request-table";
import type {
  PageData,
  PlatformServiceOrderListItem,
  PlatformServiceRefundRequestListItem,
  PlatformServiceWorkOrderListItem,
} from "@/components/platform-service-orders/platform-service-order-types";
import { PlatformServiceWorkOrderTable } from "@/components/platform-service-orders/platform-service-work-order-table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getAdminSession, getAdminToken } from "@/lib/auth";
import { buildBackendUrl, parseBackendJson } from "@/lib/backend";
import { isPlatformOnlySession } from "@/lib/session-mode";

const READ_PERMISSION = "platform.service_order.read";
const WORK_ORDER_MANAGE_PERMISSION = "platform.service_work_order.manage";
const REFUND_REVIEW_PERMISSION = "platform.service_refund.review";

type SearchParams = Promise<{
  tab?: string;
  page?: string;
  pageSize?: string;
  workOrderPage?: string;
  workOrderPageSize?: string;
  refundPage?: string;
  refundPageSize?: string;
  keyword?: string;
  tenantKeyword?: string;
  status?: string;
  paymentStatus?: string;
  serviceStatus?: string;
  assigneeEmployeeId?: string;
}>;

function emptyPage<RecordType>(page: number, pageSize: number): PageData<RecordType> {
  return {
    list: [],
    pagination: { page, pageSize, total: 0, totalPages: 0 },
  };
}

async function fetchBackend<T>(path: string, fallback: T) {
  const token = await getAdminToken();
  if (!token) return { data: fallback, error: "缺少登录凭证" };

  try {
    const response = await fetch(buildBackendUrl(path), {
      headers: { authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    const payload = await parseBackendJson<T>(response);
    return { data: payload.data || fallback, error: null };
  } catch (caught) {
    return {
      data: fallback,
      error: caught instanceof Error ? caught.message : "平台技术服务数据加载失败",
    };
  }
}

export default async function PlatformServiceOrdersPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const session = await getAdminSession();
  if (!session) redirect("/login");

  const permissions = new Set(session.permissions.map((item) => item.code));
  const isPlatformAdmin = isPlatformOnlySession(session);
  const canRead = isPlatformAdmin && permissions.has(READ_PERMISSION);
  const canManageWorkOrder = isPlatformAdmin && permissions.has(WORK_ORDER_MANAGE_PERMISSION);
  const canReviewRefund = isPlatformAdmin && permissions.has(REFUND_REVIEW_PERMISSION);
  const params = await searchParams;
  const activeTab = normalizePlatformServiceTab(params.tab);
  const page = readPositiveInteger(params.page, 1);
  const pageSize = normalizePlatformListPageSize(params.pageSize);
  const workOrderPage = readPositiveInteger(params.workOrderPage, 1);
  const workOrderPageSize = normalizePlatformListPageSize(params.workOrderPageSize);
  const refundPage = readPositiveInteger(params.refundPage, 1);
  const refundPageSize = normalizePlatformListPageSize(params.refundPageSize);
  const keyword = cleanParam(params.keyword);
  const tenantKeyword = cleanParam(params.tenantKeyword);
  const paymentStatus = pickParam(
    params.paymentStatus,
    paymentStatusOptions.map((item) => item.value),
  );
  const serviceStatus = pickParam(
    params.serviceStatus,
    serviceStatusOptions.map((item) => item.value),
  );
  const workOrderStatus = pickParam(
    params.status,
    serviceStatusOptions
      .filter((item) => item.value !== "waiting_payment")
      .map((item) => item.value),
  );
  const refundStatus = pickParam(
    params.status,
    refundStatusOptions.map((item) => item.value),
  );
  const assigneeEmployeeId = cleanParam(params.assigneeEmployeeId);

  let orders = emptyPage<PlatformServiceOrderListItem>(page, pageSize);
  let workOrders = emptyPage<PlatformServiceWorkOrderListItem>(
    workOrderPage,
    workOrderPageSize,
  );
  let refunds = emptyPage<PlatformServiceRefundRequestListItem>(
    refundPage,
    refundPageSize,
  );
  let error: string | null = null;
  const permissionError = activeTab === "orders"
    ? canRead
      ? null
      : "当前账号缺少平台技术服务查看权限"
    : activeTab === "workOrders"
      ? canManageWorkOrder
        ? null
        : "当前账号缺少平台技术服务工单管理权限"
      : canReviewRefund
        ? null
        : "当前账号缺少平台技术服务退款审核权限";

  if (permissionError) {
    error = permissionError;
  } else if (activeTab === "orders") {
    const result = await fetchBackend<PageData<PlatformServiceOrderListItem>>(
      `/platform/billing/service-orders?${buildServiceOrderQuery({
        page,
        pageSize,
        keyword,
        tenantKeyword,
        paymentStatus,
        serviceStatus,
      })}`,
      orders,
    );
    orders = result.data;
    error = result.error;
  } else if (activeTab === "workOrders") {
    const result = await fetchBackend<PageData<PlatformServiceWorkOrderListItem>>(
      `/platform/billing/service-work-orders?${buildServiceWorkOrderQuery({
        page: workOrderPage,
        pageSize: workOrderPageSize,
        keyword,
        tenantKeyword,
        status: workOrderStatus,
        assigneeEmployeeId,
      })}`,
      workOrders,
    );
    workOrders = result.data;
    error = result.error;
  } else {
    const result = await fetchBackend<PageData<PlatformServiceRefundRequestListItem>>(
      `/platform/billing/service-refund-requests?${buildServiceRefundRequestQuery({
        page: refundPage,
        pageSize: refundPageSize,
        keyword,
        tenantKeyword,
        status: refundStatus,
      })}`,
      refunds,
    );
    refunds = result.data;
    error = result.error;
  }

  const activePagination = activeTab === "orders"
    ? orders.pagination
    : activeTab === "workOrders"
      ? workOrders.pagination
      : refunds.pagination;
  const activeList = activeTab === "orders"
    ? orders.list
    : activeTab === "workOrders"
      ? workOrders.list
      : refunds.list;
  const activePageSize = activeTab === "orders"
    ? pageSize
    : activeTab === "workOrders"
      ? workOrderPageSize
      : refundPageSize;
  const pageKey = activeTab === "orders"
    ? "page"
    : activeTab === "workOrders"
      ? "workOrderPage"
      : "refundPage";
  const pageSizeKey = activeTab === "orders"
    ? "pageSize"
    : activeTab === "workOrders"
      ? "workOrderPageSize"
      : "refundPageSize";

  return (
    <div className="flex h-[calc(100vh-6.5625rem)] min-h-0 flex-col gap-5 overflow-hidden">
      <Tabs defaultValue={activeTab} className="contents">
        <PlatformListPageShell
          title="平台技术服务"
          description="跟踪年度技术服务订单、实施工单、履约记录和退款审核，保证支付、交付、验收关系清晰。"
          leading={
            <span className="flex size-10 shrink-0 items-center justify-center rounded-md border bg-card text-muted-foreground">
              <BriefcaseBusiness aria-hidden="true" />
            </span>
          }
          error={error}
          tabs={
            <TabsList className={platformTabsListClassName}>
              <TabsTrigger value="orders" asChild className={platformTabsTriggerClassName}>
                <Link href={`/platform/service-orders?${buildQuery({ tab: "orders", pageSize })}`}>
                  服务订单
                </Link>
              </TabsTrigger>
              <TabsTrigger value="workOrders" asChild className={platformTabsTriggerClassName}>
                <Link
                  href={`/platform/service-orders?${buildQuery({
                    tab: "workOrders",
                    workOrderPageSize,
                  })}`}
                >
                  实施工单
                </Link>
              </TabsTrigger>
              <TabsTrigger value="refunds" asChild className={platformTabsTriggerClassName}>
                <Link
                  href={`/platform/service-orders?${buildQuery({
                    tab: "refunds",
                    refundPageSize,
                  })}`}
                >
                  退款审核
                </Link>
              </TabsTrigger>
            </TabsList>
          }
          filters={
            <PlatformServiceOrderFilters
              activeTab={activeTab}
              keyword={keyword}
              tenantKeyword={tenantKeyword}
              status={activeTab === "workOrders" ? workOrderStatus : refundStatus}
              paymentStatus={paymentStatus}
              serviceStatus={serviceStatus}
              assigneeEmployeeId={assigneeEmployeeId}
            />
          }
          pagination={activePagination}
          currentCount={getListCurrentCount({
            list: activeList,
            pageSize: activePageSize,
            total: activePagination.total,
          })}
          pageKey={pageKey}
          pageSizeKey={pageSizeKey}
          tableViewportTestId="platform-service-orders-table-viewport"
          unit={activeTab === "orders" ? "笔订单" : activeTab === "workOrders" ? "张工单" : "条退款"}
        >
          {activeTab === "orders" ? (
            <PlatformServiceOrderTable
              orders={orders.list}
              canRetryShipping={canManageWorkOrder}
            />
          ) : activeTab === "workOrders" ? (
            <PlatformServiceWorkOrderTable
              workOrders={workOrders.list}
              canManage={canManageWorkOrder}
            />
          ) : (
            <PlatformServiceRefundRequestTable
              requests={refunds.list}
              canReview={canReviewRefund}
            />
          )}
        </PlatformListPageShell>
      </Tabs>
    </div>
  );
}
