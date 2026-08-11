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
import { PlatformServiceTrialFilters } from "@/components/platform-service-trials/platform-service-trial-filters";
import {
  buildServiceTrialQuery,
  trialSourceOptions,
  trialStatusOptions,
  trialTypeOptions,
} from "@/components/platform-service-trials/platform-service-trial-rules";
import { PlatformServiceTrialGrantDialog } from "@/components/platform-service-trials/platform-service-trial-action-dialog";
import { PlatformServiceTrialPolicyDialog } from "@/components/platform-service-trials/platform-service-trial-policy-dialog";
import { PlatformServiceTrialTable } from "@/components/platform-service-trials/platform-service-trial-table";
import type {
  PlatformServiceTrialListData,
  PlatformServiceTrialListItem,
  PlatformServiceTrialSummary,
} from "@/components/platform-service-trials/platform-service-trial-types";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getAdminSession, getAdminToken } from "@/lib/auth";
import { buildBackendUrl, parseBackendJson } from "@/lib/backend";
import { isPlatformOnlySession } from "@/lib/session-mode";

const READ_PERMISSION = "platform.service_order.read";
const WORK_ORDER_MANAGE_PERMISSION = "platform.service_work_order.manage";
const REFUND_REVIEW_PERMISSION = "platform.service_refund.review";
const TRIAL_READ_PERMISSION = "platform.service_trial.read";
const TRIAL_MANAGE_PERMISSION = "platform.service_trial.manage";
const TRIAL_OVERRIDE_PERMISSION = "platform.service_trial.override";

type SearchParams = Promise<{
  tab?: string;
  page?: string;
  pageSize?: string;
  workOrderPage?: string;
  workOrderPageSize?: string;
  refundPage?: string;
  refundPageSize?: string;
  trialPage?: string;
  trialPageSize?: string;
  keyword?: string;
  tenantKeyword?: string;
  status?: string;
  paymentStatus?: string;
  serviceStatus?: string;
  assigneeEmployeeId?: string;
  trialKeyword?: string;
  trialStatus?: string;
  trialSource?: string;
  trialType?: string;
  trialAssigneeEmployeeId?: string;
  trialAppliedFrom?: string;
  trialAppliedTo?: string;
  trialExpiresFrom?: string;
  trialExpiresTo?: string;
}>;

function emptyPage<RecordType>(page: number, pageSize: number): PageData<RecordType> {
  return {
    list: [],
    pagination: { page, pageSize, total: 0, totalPages: 0 },
  };
}

function emptyTrialSummary(): PlatformServiceTrialSummary {
  return {
    pending_review_count: 0,
    scheduled_count: 0,
    current_active_count: 0,
    expiring_within_7_days_count: 0,
    month_new_count: 0,
    month_approved_count: 0,
    month_converted_count: 0,
    application_approval_rate: 0,
    activated_cohort_conversion_rate: 0,
    server_time: new Date(0).toISOString(),
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
  const canReadTrials = isPlatformAdmin && permissions.has(TRIAL_READ_PERMISSION);
  const canGrantTrial = canReadTrials && permissions.has(TRIAL_MANAGE_PERMISSION);
  const canUpdateTrialPolicy = canGrantTrial && permissions.has(TRIAL_OVERRIDE_PERMISSION);
  const params = await searchParams;
  const activeTab = normalizePlatformServiceTab(params.tab);
  const page = readPositiveInteger(params.page, 1);
  const pageSize = normalizePlatformListPageSize(params.pageSize);
  const workOrderPage = readPositiveInteger(params.workOrderPage, 1);
  const workOrderPageSize = normalizePlatformListPageSize(params.workOrderPageSize);
  const refundPage = readPositiveInteger(params.refundPage, 1);
  const refundPageSize = normalizePlatformListPageSize(params.refundPageSize);
  const trialPage = readPositiveInteger(params.trialPage, 1);
  const trialPageSize = normalizePlatformListPageSize(params.trialPageSize);
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
  const trialKeyword = cleanParam(params.trialKeyword);
  const trialStatus = pickParam(
    params.trialStatus,
    trialStatusOptions.map((item) => item.value),
  );
  const trialSource = pickParam(
    params.trialSource,
    trialSourceOptions.map((item) => item.value),
  );
  const trialType = pickParam(
    params.trialType,
    trialTypeOptions.map((item) => item.value),
  );
  const trialAssigneeEmployeeId = cleanParam(params.trialAssigneeEmployeeId);
  const trialAppliedFrom = cleanParam(params.trialAppliedFrom);
  const trialAppliedTo = cleanParam(params.trialAppliedTo);
  const trialExpiresFrom = cleanParam(params.trialExpiresFrom);
  const trialExpiresTo = cleanParam(params.trialExpiresTo);

  let orders = emptyPage<PlatformServiceOrderListItem>(page, pageSize);
  let workOrders = emptyPage<PlatformServiceWorkOrderListItem>(
    workOrderPage,
    workOrderPageSize,
  );
  let refunds = emptyPage<PlatformServiceRefundRequestListItem>(
    refundPage,
    refundPageSize,
  );
  let trials: PlatformServiceTrialListData = {
    ...emptyPage<PlatformServiceTrialListItem>(trialPage, trialPageSize),
    server_time: new Date().toISOString(),
  };
  let trialSummary = emptyTrialSummary();
  let error: string | null = null;
  const permissionError = activeTab === "orders"
    ? canRead
      ? null
      : "当前账号缺少平台技术服务查看权限"
    : activeTab === "workOrders"
      ? canManageWorkOrder
        ? null
        : "当前账号缺少平台技术服务工单管理权限"
      : activeTab === "refunds"
        ? canReviewRefund
          ? null
          : "当前账号缺少平台技术服务退款审核权限"
        : canReadTrials
          ? null
          : "当前账号缺少平台技术服务试用查看权限";

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
  } else if (activeTab === "refunds") {
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
  } else {
    const [listResult, summaryResult] = await Promise.all([
      fetchBackend<PlatformServiceTrialListData>(
        `/platform/billing/service-trials?${buildServiceTrialQuery({
          page: trialPage,
          pageSize: trialPageSize,
          keyword: trialKeyword,
          status: trialStatus,
          source: trialSource,
          trialType,
          assigneeEmployeeId: trialAssigneeEmployeeId,
          appliedFrom: trialAppliedFrom,
          appliedTo: trialAppliedTo,
          expiresFrom: trialExpiresFrom,
          expiresTo: trialExpiresTo,
        })}`,
        trials,
      ),
      fetchBackend<PlatformServiceTrialSummary>(
        "/platform/billing/service-trials/summary",
        trialSummary,
      ),
    ]);
    trials = listResult.data;
    trialSummary = summaryResult.data;
    error = listResult.error || summaryResult.error;
  }

  const activePagination = activeTab === "orders"
    ? orders.pagination
    : activeTab === "workOrders"
      ? workOrders.pagination
      : activeTab === "refunds"
        ? refunds.pagination
        : trials.pagination;
  const activeList = activeTab === "orders"
    ? orders.list
    : activeTab === "workOrders"
      ? workOrders.list
      : activeTab === "refunds"
        ? refunds.list
        : trials.list;
  const activePageSize = activeTab === "orders"
    ? pageSize
    : activeTab === "workOrders"
      ? workOrderPageSize
      : activeTab === "refunds"
        ? refundPageSize
        : trialPageSize;
  const pageKey = activeTab === "orders"
    ? "page"
    : activeTab === "workOrders"
      ? "workOrderPage"
      : activeTab === "refunds"
        ? "refundPage"
        : "trialPage";
  const pageSizeKey = activeTab === "orders"
    ? "pageSize"
    : activeTab === "workOrders"
      ? "workOrderPageSize"
      : activeTab === "refunds"
        ? "refundPageSize"
        : "trialPageSize";
  const grantTrialDisabledReason = canGrantTrial
    ? undefined
    : "当前账号缺少平台技术服务试用管理权限";
  const policyDisabledReason = canUpdateTrialPolicy
    ? undefined
    : "当前账号缺少平台技术服务试用规则修改权限";

  return (
    <div className="flex h-[calc(100vh-6.5625rem)] min-h-0 flex-col gap-5 overflow-hidden">
      <Tabs defaultValue={activeTab} className="contents">
        <PlatformListPageShell
          title="平台技术服务"
          description="跟踪试用、订单、实施和退款进度，保证企业资格、服务范围与后续动作清晰。"
          leading={
            <span className="flex size-10 shrink-0 items-center justify-center rounded-md border bg-card text-muted-foreground">
              <BriefcaseBusiness aria-hidden="true" />
            </span>
          }
          error={error}
          action={activeTab === "trials" && canReadTrials ? (
            <div className="flex flex-wrap gap-2">
              <PlatformServiceTrialPolicyDialog disabledReason={policyDisabledReason} />
              <PlatformServiceTrialGrantDialog disabledReason={grantTrialDisabledReason} />
            </div>
          ) : null}
          summary={activeTab === "trials" && canReadTrials ? (
            <div
              className="grid shrink-0 grid-cols-2 overflow-hidden rounded-md border bg-card lg:grid-cols-4 lg:divide-x"
              aria-label="技术服务试用概览"
            >
              <TrialMetric label="待审核" value={trialSummary.pending_review_count} />
              <TrialMetric label="试用中" value={trialSummary.current_active_count} />
              <TrialMetric label="7 天内到期" value={trialSummary.expiring_within_7_days_count} />
              <TrialMetric label="本月转正式" value={trialSummary.month_converted_count} />
            </div>
          ) : null}
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
              <TabsTrigger value="trials" asChild className={platformTabsTriggerClassName}>
                <Link
                  href={`/platform/service-orders?${buildQuery({
                    tab: "trials",
                    trialPageSize,
                  })}`}
                >
                  试用管理
                </Link>
              </TabsTrigger>
            </TabsList>
          }
          filters={activeTab === "trials" ? (
            <PlatformServiceTrialFilters
              values={{
                keyword: trialKeyword,
                status: trialStatus,
                source: trialSource,
                trialType,
                assigneeEmployeeId: trialAssigneeEmployeeId,
                appliedFrom: trialAppliedFrom,
                appliedTo: trialAppliedTo,
                expiresFrom: trialExpiresFrom,
                expiresTo: trialExpiresTo,
              }}
              pageSize={trialPageSize}
            />
          ) : (
            <PlatformServiceOrderFilters
              activeTab={activeTab}
              keyword={keyword}
              tenantKeyword={tenantKeyword}
              status={activeTab === "workOrders" ? workOrderStatus : refundStatus}
              paymentStatus={paymentStatus}
              serviceStatus={serviceStatus}
              assigneeEmployeeId={assigneeEmployeeId}
            />
          )}
          pagination={activePagination}
          currentCount={getListCurrentCount({
            list: activeList,
            pageSize: activePageSize,
            total: activePagination.total,
          })}
          pageKey={pageKey}
          pageSizeKey={pageSizeKey}
          tableViewportTestId="platform-service-orders-table-viewport"
          unit={activeTab === "orders"
            ? "笔订单"
            : activeTab === "workOrders"
              ? "张工单"
              : activeTab === "refunds" ? "条退款" : "条试用"}
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
          ) : activeTab === "refunds" ? (
            <PlatformServiceRefundRequestTable
              requests={refunds.list}
              canReview={canReviewRefund}
            />
          ) : (
            <PlatformServiceTrialTable
              trials={trials.list}
              serverTime={trials.server_time}
            />
          )}
        </PlatformListPageShell>
      </Tabs>
    </div>
  );
}

function TrialMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex min-w-0 items-baseline justify-between gap-3 border-b px-4 py-3 last:border-b-0 lg:border-b-0">
      <span className="truncate text-sm text-muted-foreground">{label}</span>
      <strong className="text-xl font-semibold tabular-nums">{value}</strong>
    </div>
  );
}
