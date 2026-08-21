import {
  CustomerOriginConfig,
  CustomerSourceConfig,
  CustomerStatusConfig,
  isCustomerOrigin,
  isCustomerSource,
  isCustomerStatus,
} from "@gooes/domain";
import type {
  BadgeVariant,
  CustomerSourceRecord,
  DouyinCustomerSourceMetadata,
} from "@/components/customers/customer-mutation-types";

export type CustomerDetailMeta = {
  label: string;
  variant: BadgeVariant;
};

const customerSourceDetailLabels: Record<string, string> = {
  ...Object.fromEntries(
    Object.entries(CustomerSourceConfig).map(([value, config]) => [
      value,
      config.label,
    ]),
  ),
  douyin: "抖音短视频",
  h5_campaign: "员工活动页",
};

function statusVariant(type: string | null | undefined): BadgeVariant {
  if (type === "success") return "success";
  if (type === "warning") return "warning";
  if (type === "danger") return "danger";
  if (type === "primary") return "default";
  return "secondary";
}

export function customerStatusMeta(status: string | null | undefined): CustomerDetailMeta {
  if (isCustomerStatus(status)) {
    return {
      label: CustomerStatusConfig[status].label,
      variant: statusVariant(CustomerStatusConfig[status].type),
    };
  }

  return {
    label: status ? "未识别状态" : "未设置状态",
    variant: status ? "outline" : "secondary",
  };
}

export function customerSourceLabel(source: string | null | undefined) {
  if (isCustomerSource(source)) {
    return customerSourceDetailLabels[source] || CustomerSourceConfig[source].label;
  }

  return source ? "未识别来源" : "-";
}

export function customerSourceDisplayLabel(source: {
  display_label?: string | null;
  source: string | null | undefined;
}) {
  const label = source.display_label?.trim();
  if (label && !/[A-Za-z_]/.test(label)) return label;

  return customerSourceLabel(source.source);
}

export function customerOriginLabel(origin: string | null | undefined) {
  if (isCustomerOrigin(origin)) {
    return CustomerOriginConfig[origin].label;
  }

  return origin ? "未识别渠道" : "-";
}

export function customerFollowUpStateMeta(
  state: string | null | undefined,
): CustomerDetailMeta {
  if (state === "overdue") {
    return { label: "超期", variant: "danger" };
  }
  if (state === "due") {
    return { label: "待跟进", variant: "warning" };
  }
  if (state === "upcoming") {
    return { label: "已计划", variant: "success" };
  }
  if (!state || state === "none") {
    return { label: "无计划", variant: "secondary" };
  }

  return { label: "未识别跟进状态", variant: "outline" };
}

export function customerDedupeResultLabel(result: string | null | undefined) {
  if (!result) return "-";
  if (result === "existing_customer") return "老客户线索";
  if (result === "created_customer") return "新客户线索";

  return "未识别结果";
}

export function douyinAppointmentStatusLabel(status: string | null | undefined) {
  if (status === "pending_confirmation") return "待确认";
  if (status === "confirmed") return "已确认";
  if (status === "completed") return "已完成";
  if (status === "canceled") return "已取消";
  if (status === "invalid") return "无效";
  return "状态未知";
}

export function douyinAppointmentStatusVariant(
  status: string | null | undefined,
): BadgeVariant {
  if (status === "completed") return "success";
  if (status === "confirmed") return "default";
  if (status === "pending_confirmation") return "warning";
  if (status === "canceled" || status === "invalid") return "danger";
  return "outline";
}

export function formatDouyinBudgetRange(
  minimum: number | null | undefined,
  maximum: number | null | undefined,
) {
  if (typeof minimum !== "number"
    || typeof maximum !== "number"
    || !Number.isSafeInteger(minimum)
    || !Number.isSafeInteger(maximum)) {
    return "-";
  }
  return `¥${minimum.toLocaleString("zh-CN")} - ¥${maximum.toLocaleString("zh-CN")}`;
}

export function getDouyinCustomerSourceMetadata(
  source: CustomerSourceRecord,
): DouyinCustomerSourceMetadata | null {
  if (source.source !== "douyin" || !isRecord(source.metadata)) return null;
  const metadata = source.metadata;
  if (!isNullableString(metadata.appointment_no)
    || !isNullableString(metadata.status)
    || !isNullableString(metadata.estimate_no)
    || !isNullableNumber(metadata.minimum_total)
    || !isNullableNumber(metadata.maximum_total)
    || !isNullableString(metadata.ai_status)
    || !isNullableString(metadata.ai_summary)
    || !isStringArray(metadata.allocation_advice)
    || !isStringArray(metadata.risk_factors)
    || !isStringArray(metadata.onsite_questions)) {
    return null;
  }

  return metadata as DouyinCustomerSourceMetadata;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isNullableNumber(value: unknown): value is number | null {
  return value === null || typeof value === "number";
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}
