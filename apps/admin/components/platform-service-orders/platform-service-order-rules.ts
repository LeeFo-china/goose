import type {
  PlatformServicePaymentStatus,
  PlatformServiceStatus,
} from "@gooes/domain";
import { PLATFORM_SERVICE_WORK_ORDER_ALLOWED_TRANSITIONS } from "@gooes/domain";

import type {
  PlatformServiceOrderListItem,
  PlatformServiceRefundRequestListItem,
  PlatformServiceWorkOrderListItem,
  ServiceTenantSummary,
} from "./platform-service-order-types";

export type PlatformServiceTab = "orders" | "workOrders" | "refunds";

export const platformServiceTabs: PlatformServiceTab[] = [
  "orders",
  "workOrders",
  "refunds",
];

export const platformServiceTabLabels: Record<PlatformServiceTab, string> = {
  orders: "服务订单",
  workOrders: "实施工单",
  refunds: "退款审核",
};

export const paymentStatusOptions: ReadonlyArray<{
  value: PlatformServicePaymentStatus;
  label: string;
}> = [
  { value: "pending", label: "待支付" },
  { value: "paid", label: "已支付" },
  { value: "refund_reviewing", label: "退款审核中" },
  { value: "refunding", label: "退款中" },
  { value: "partially_refunded", label: "部分退款" },
  { value: "refunded", label: "已退款" },
  { value: "closed", label: "已关闭" },
];

export const serviceStatusOptions: ReadonlyArray<{
  value: PlatformServiceStatus;
  label: string;
}> = [
  { value: "waiting_payment", label: "待支付" },
  { value: "waiting_assignment", label: "待分配" },
  { value: "configuring", label: "配置中" },
  { value: "deploying", label: "部署中" },
  { value: "training", label: "培训中" },
  { value: "awaiting_acceptance", label: "待验收" },
  { value: "rectifying", label: "整改中" },
  { value: "accepted", label: "已验收" },
  { value: "active", label: "服务中" },
  { value: "canceled", label: "已取消" },
];

export const refundStatusOptions = [
  { value: "reviewing", label: "待审核" },
  { value: "approved", label: "已通过" },
  { value: "rejected", label: "已驳回" },
  { value: "cancelled", label: "已取消" },
] as const;

export const workOrderTransitionOptions: ReadonlyArray<{
  value: Exclude<PlatformServiceStatus, "waiting_payment">;
  label: string;
}> = serviceStatusOptions.filter((item) => item.value !== "waiting_payment") as Array<{
  value: Exclude<PlatformServiceStatus, "waiting_payment">;
  label: string;
}>;

export function getWorkOrderNextStatusOptions(status: string) {
  const nextStatuses = new Set<string>(
    PLATFORM_SERVICE_WORK_ORDER_ALLOWED_TRANSITIONS
      .filter((transition) => transition.from === status)
      .map((transition) => transition.to),
  );
  return workOrderTransitionOptions.filter((option) =>
    nextStatuses.has(option.value)
  );
}

export const fulfillmentRecordTypeOptions = [
  { value: "environment_setup", label: "实施工单" },
  { value: "server_configuration", label: "服务器配置" },
  { value: "onsite_training", label: "上门培训" },
  { value: "remote_training", label: "远程培训" },
  { value: "annual_operation", label: "年度运维" },
  { value: "acceptance_preparation", label: "验收准备" },
  { value: "rectification", label: "整改记录" },
] as const;

export const paymentStatusMeta: Record<
  PlatformServicePaymentStatus,
  { label: string; variant: "secondary" | "success" | "warning" | "danger" }
> = {
  pending: { label: "待支付", variant: "warning" },
  paid: { label: "已支付", variant: "success" },
  refund_reviewing: { label: "退款审核中", variant: "warning" },
  refunding: { label: "退款中", variant: "warning" },
  partially_refunded: { label: "部分退款", variant: "warning" },
  refunded: { label: "已退款", variant: "secondary" },
  closed: { label: "已关闭", variant: "secondary" },
};

export const serviceStatusMeta: Record<
  PlatformServiceStatus,
  { label: string; variant: "secondary" | "success" | "warning" | "danger" }
> = {
  waiting_payment: { label: "待支付", variant: "warning" },
  waiting_assignment: { label: "待分配", variant: "warning" },
  configuring: { label: "配置中", variant: "warning" },
  deploying: { label: "部署中", variant: "warning" },
  training: { label: "培训中", variant: "warning" },
  awaiting_acceptance: { label: "待验收", variant: "warning" },
  rectifying: { label: "整改中", variant: "danger" },
  accepted: { label: "已验收", variant: "success" },
  active: { label: "服务中", variant: "success" },
  canceled: { label: "已取消", variant: "secondary" },
};

export const refundStatusMeta: Record<
  string,
  { label: string; variant: "secondary" | "success" | "warning" | "danger" }
> = {
  reviewing: { label: "待审核", variant: "warning" },
  approved: { label: "已通过", variant: "success" },
  rejected: { label: "已驳回", variant: "danger" },
  cancelled: { label: "已取消", variant: "secondary" },
};

export function normalizePlatformServiceTab(value: string | undefined): PlatformServiceTab {
  return platformServiceTabs.includes(value as PlatformServiceTab)
    ? value as PlatformServiceTab
    : "orders";
}

export function cleanParam(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed || undefined;
}

export function readPositiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function pickParam<T extends string>(value: string | undefined, options: readonly T[]) {
  return options.includes(value as T) ? value as T : undefined;
}

export function buildQuery(input: Record<string, string | number | boolean | undefined>) {
  const query = new URLSearchParams();
  Object.entries(input).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      query.set(key, String(value));
    }
  });
  return query.toString();
}

export function buildServiceOrderQuery(input: {
  page: number;
  pageSize: number;
  keyword?: string;
  tenantKeyword?: string;
  paymentStatus?: string;
  serviceStatus?: string;
}) {
  const query = new URLSearchParams();
  query.set("page", String(input.page));
  query.set("pageSize", String(input.pageSize));
  if (input.keyword) query.set("keyword", input.keyword);
  if (input.tenantKeyword) query.set("tenantKeyword", input.tenantKeyword);
  if (input.paymentStatus) query.set("paymentStatus", input.paymentStatus);
  if (input.serviceStatus) query.set("serviceStatus", input.serviceStatus);
  return query.toString();
}

export function buildServiceWorkOrderQuery(input: {
  page: number;
  pageSize: number;
  keyword?: string;
  tenantKeyword?: string;
  status?: string;
  assigneeEmployeeId?: string;
}) {
  const query = new URLSearchParams();
  query.set("page", String(input.page));
  query.set("pageSize", String(input.pageSize));
  if (input.keyword) query.set("keyword", input.keyword);
  if (input.tenantKeyword) query.set("tenantKeyword", input.tenantKeyword);
  if (input.status) query.set("status", input.status);
  if (input.assigneeEmployeeId) {
    query.set("assigneeEmployeeId", input.assigneeEmployeeId);
  }
  return query.toString();
}

export function buildServiceRefundRequestQuery(input: {
  page: number;
  pageSize: number;
  keyword?: string;
  tenantKeyword?: string;
  status?: string;
}) {
  const query = new URLSearchParams();
  query.set("page", String(input.page));
  query.set("pageSize", String(input.pageSize));
  if (input.keyword) query.set("keyword", input.keyword);
  if (input.tenantKeyword) query.set("tenantKeyword", input.tenantKeyword);
  if (input.status) query.set("status", input.status);
  return query.toString();
}

export function getTenantName(
  source: PlatformServiceOrderListItem,
) {
  return getSingleTenant(source.tenant)?.name || source.tenant_id || "-";
}

export function getSingleTenant(
  tenant: ServiceTenantSummary | ServiceTenantSummary[] | null | undefined,
) {
  return Array.isArray(tenant) ? tenant[0] ?? null : tenant ?? null;
}

export function getOrderTenantName(
  source: PlatformServiceWorkOrderListItem | PlatformServiceRefundRequestListItem,
) {
  const tenant = getSingleTenant(source.order?.tenant);
  return tenant?.name || source.tenant_id || "-";
}

export function getOrderProductCode(
  source: PlatformServiceWorkOrderListItem | PlatformServiceRefundRequestListItem,
) {
  return source.order?.product_code || "-";
}

export function formatFen(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "-";
  return `¥${(Number(value) / 100).toLocaleString("zh-CN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function formatDateTime(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("zh-CN", { hour12: false });
}

export function getListCurrentCount(input: {
  list: readonly unknown[];
  pageSize: number;
  total: number;
}) {
  return input.list.length;
}

export function getPaymentStatusMeta(status: string) {
  return paymentStatusMeta[status as PlatformServicePaymentStatus] ?? {
    label: status,
    variant: "secondary" as const,
  };
}

export function getServiceStatusMeta(status: string) {
  return serviceStatusMeta[status as PlatformServiceStatus] ?? {
    label: status,
    variant: "secondary" as const,
  };
}

export function getRefundStatusMeta(status: string) {
  return refundStatusMeta[status] ?? {
    label: status,
    variant: "secondary" as const,
  };
}
