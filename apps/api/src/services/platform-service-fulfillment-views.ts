import type {
  OrderShippingReportRecord,
} from "@/repositories/platform-service-order-shipping-reports";
import type {
  AcceptancePreparationRecord,
  OrderRecord,
  WorkOrderRecord,
} from "@/repositories/platform-service-order-records";
import { serializeTenantServiceOrder } from "@/services/platform-service-order-views";

export function serializePlatformOrder(
  order: OrderRecord,
  now: Date,
  shippingReport?: OrderShippingReportRecord | null,
) {
  const serialized = serializeTenantServiceOrder(order, now);
  const wechatShippingReport = serializeWechatShippingReport(shippingReport);
  return {
    ...serialized,
    tenant_id: order.tenant_id ?? null,
    wechat_shipping_report: wechatShippingReport,
    available_actions: {
      ...serialized.available_actions,
      wechat_shipping_retry: getWechatShippingRetryAction(
        order,
        wechatShippingReport.status,
      ),
    },
  };
}

export function serializeWechatShippingReport(
  report: OrderShippingReportRecord | null | undefined,
) {
  if (!report) {
    return {
      id: null,
      status: "not_started",
      attempt_count: 0,
      wechat_errcode: null,
      wechat_errmsg: null,
      provider_request_id: null,
      last_attempt_at: null,
      succeeded_at: null,
      updated_at: null,
      source: null,
    };
  }
  return {
    id: report.id,
    status: report.status,
    attempt_count: report.attempt_count,
    wechat_errcode: report.wechat_errcode,
    wechat_errmsg: report.wechat_errmsg,
    provider_request_id: report.provider_request_id,
    last_attempt_at: report.last_attempt_at,
    succeeded_at: report.succeeded_at,
    updated_at: report.updated_at,
    source: report.source,
  };
}

export function latestShippingReportByOrderId(
  reports: OrderShippingReportRecord[],
) {
  const reportByOrderId = new Map<string, OrderShippingReportRecord>();
  for (const report of reports) {
    const current = reportByOrderId.get(report.service_order_id);
    if (
      !current ||
      new Date(report.updated_at).getTime() > new Date(current.updated_at).getTime()
    ) {
      reportByOrderId.set(report.service_order_id, report);
    }
  }
  return reportByOrderId;
}

export function serializePlatformWorkOrder(
  workOrder: WorkOrderRecord,
  now = new Date(),
) {
  const acceptancePreparation = normalizeMaybeSingleRelation(
    workOrder.acceptance_preparation,
  );
  return {
    id: workOrder.id,
    tenant_id: workOrder.tenant_id,
    service_order_id: workOrder.service_order_id,
    order_no: workOrder.order_no,
    status: workOrder.status,
    assignee_employee_id: workOrder.assignee_employee_id,
    created_by_employee_id: workOrder.created_by_employee_id,
    assigned_at: workOrder.assigned_at ?? null,
    version: workOrder.version ?? 1,
    available_actions: getWorkOrderActions(
      workOrder.status,
      acceptancePreparation,
      now,
    ),
    order: normalizeMaybeSingleRelation(workOrder.order),
    acceptance_preparation: acceptancePreparation
      ? serializePlatformAcceptancePreparation(acceptancePreparation, now)
      : null,
    created_at: workOrder.created_at,
    updated_at: workOrder.updated_at,
  };
}

function normalizeMaybeSingleRelation<T>(value: T | T[] | null | undefined) {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

function getWechatShippingRetryAction(
  order: OrderRecord,
  reportStatus: string,
) {
  if (order.payment_status !== "paid") {
    return {
      enabled: false,
      label: "重新上报微信履约",
      disabled_reason: "订单未支付，不能上报微信履约",
    };
  }
  if (order.service_status !== "accepted") {
    return {
      enabled: false,
      label: "重新上报微信履约",
      disabled_reason: "客户未确认验收，不能上报微信履约",
    };
  }
  if (reportStatus === "succeeded") {
    return {
      enabled: false,
      label: "重新上报微信履约",
      disabled_reason: "微信履约已上报成功",
    };
  }
  if (reportStatus === "pending") {
    return {
      enabled: false,
      label: "重新上报微信履约",
      disabled_reason: "微信履约上报处理中，请稍后刷新",
    };
  }
  return {
    enabled: true,
    label: "重新上报微信履约",
    disabled_reason: null,
  };
}

export function serializePlatformAcceptancePreparation(
  acceptancePreparation: AcceptancePreparationRecord,
  now: Date,
) {
  const dueAt = acceptancePreparation.acceptance_due_at;
  const remainingSeconds = getRemainingSeconds(dueAt, now);
  return {
    ...acceptancePreparation,
    acceptance_overdue: dueAt ? remainingSeconds === 0 : false,
    acceptance_remaining_seconds: remainingSeconds,
  };
}

function getWorkOrderActions(
  status: string,
  acceptancePreparation: WorkOrderRecord["acceptance_preparation"],
  now: Date,
) {
  const canCancel = [
    "waiting_assignment",
    "configuring",
    "deploying",
    "training",
    "awaiting_acceptance",
    "rectifying",
  ].includes(status);
  const normalizedAcceptancePreparation = normalizeMaybeSingleRelation(
    acceptancePreparation,
  );
  const isOverdueAcceptance = Boolean(
    status === "awaiting_acceptance" &&
      normalizedAcceptancePreparation?.status === "submitted" &&
      isPastDue(normalizedAcceptancePreparation.acceptance_due_at, now),
  );
  return {
    assign: {
      enabled: !["active", "canceled"].includes(status),
      label: "分配负责人",
      disabled_reason: ["active", "canceled"].includes(status)
        ? "终态工单不能重新分配"
        : null,
    },
    transition: {
      enabled: status !== "active" && status !== "canceled",
      label: "推进状态",
      disabled_reason: status === "active" || status === "canceled"
        ? "终态工单不能继续流转"
        : null,
    },
    cancel: {
      enabled: canCancel,
      label: "取消工单",
      disabled_reason: canCancel ? null : "当前状态不能取消",
    },
    confirm_overdue_acceptance: {
      enabled: isOverdueAcceptance,
      label: "平台确认验收",
      disabled_reason: isOverdueAcceptance
        ? null
        : "客户验收未逾期，不能由平台确认验收",
    },
  };
}

function isPastDue(dueAt: string | null | undefined, now: Date) {
  if (!dueAt) return false;
  const dueTime = new Date(dueAt).getTime();
  return Number.isFinite(dueTime) && dueTime <= now.getTime();
}

function getRemainingSeconds(dueAt: string | null, now: Date) {
  if (!dueAt) return null;
  const dueTime = new Date(dueAt).getTime();
  if (!Number.isFinite(dueTime)) return null;
  return Math.max(0, Math.floor((dueTime - now.getTime()) / 1000));
}
