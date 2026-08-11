import {
  PLATFORM_SERVICE_TRIAL_CAPABILITY_VALUES,
  PLATFORM_SERVICE_TRIAL_SOURCE_VALUES,
  PLATFORM_SERVICE_TRIAL_STATUS_VALUES,
  PLATFORM_SERVICE_TRIAL_TYPE_VALUES,
} from "@gooes/domain";

import type {
  PlatformServiceTrialCapability,
  PlatformServiceTrialRecord,
  PlatformServiceTrialSource,
  PlatformServiceTrialStatus,
  PlatformServiceTrialType,
} from "./platform-service-trial-types";

type StatusVariant = "secondary" | "success" | "warning" | "danger";

const statusLabels: Record<PlatformServiceTrialStatus, string> = {
  pending_review: "待审核",
  scheduled: "待开始",
  active: "试用中",
  grace_period: "宽限期",
  expired: "已到期",
  rejected: "已驳回",
  withdrawn: "已撤回",
  revoked: "已撤销",
  converted: "已转正式",
};

const statusVariants: Record<PlatformServiceTrialStatus, StatusVariant> = {
  pending_review: "warning",
  scheduled: "secondary",
  active: "success",
  grace_period: "warning",
  expired: "secondary",
  rejected: "danger",
  withdrawn: "secondary",
  revoked: "danger",
  converted: "success",
};

const sourceLabels: Record<PlatformServiceTrialSource, string> = {
  tenant_application: "租户申请",
  platform_grant: "平台开通",
};

const typeLabels: Record<PlatformServiceTrialType, string> = {
  standard: "标准试用",
  guided: "陪跑试用",
};

const capabilityLabels: Record<PlatformServiceTrialCapability, string> = {
  "core.projects": "项目管理",
  "core.customers": "客户管理",
  "core.employees": "员工管理",
  "core.workflows": "流程管理",
  "core.files": "文件管理",
  "core.notifications": "通知中心",
};

export const trialStatusOptions = PLATFORM_SERVICE_TRIAL_STATUS_VALUES.map((value) => ({
  value,
  label: statusLabels[value],
}));

export const trialSourceOptions = PLATFORM_SERVICE_TRIAL_SOURCE_VALUES.map((value) => ({
  value,
  label: sourceLabels[value],
}));

export const trialTypeOptions = PLATFORM_SERVICE_TRIAL_TYPE_VALUES.map((value) => ({
  value,
  label: typeLabels[value],
}));

export const trialCapabilityOptions = PLATFORM_SERVICE_TRIAL_CAPABILITY_VALUES.map(
  (value) => ({ value, label: capabilityLabels[value] }),
);

export function buildServiceTrialQuery(input: {
  page: number;
  pageSize: number;
  keyword?: string;
  status?: string;
  source?: string;
  trialType?: string;
  assigneeEmployeeId?: string;
  appliedFrom?: string;
  appliedTo?: string;
  expiresFrom?: string;
  expiresTo?: string;
}) {
  const query = new URLSearchParams();
  query.set("page", String(input.page));
  query.set("pageSize", String(input.pageSize));
  setQueryValue(query, "keyword", input.keyword);
  setQueryValue(query, "status", input.status);
  setQueryValue(query, "source", input.source);
  setQueryValue(query, "trialType", input.trialType);
  setQueryValue(query, "assigneeEmployeeId", input.assigneeEmployeeId);
  setQueryValue(query, "appliedFrom", toDateBoundary(input.appliedFrom, "start"));
  setQueryValue(query, "appliedTo", toDateBoundary(input.appliedTo, "end"));
  setQueryValue(query, "expiresFrom", toDateBoundary(input.expiresFrom, "start"));
  setQueryValue(query, "expiresTo", toDateBoundary(input.expiresTo, "end"));
  return query.toString();
}

function setQueryValue(query: URLSearchParams, key: string, value?: string) {
  if (value) query.set(key, value);
}

function toDateBoundary(value: string | undefined, boundary: "start" | "end") {
  if (!value) return undefined;
  const suffix = boundary === "start" ? "T00:00:00.000Z" : "T23:59:59.999Z";
  const date = new Date(`${value}${suffix}`);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

export function getTrialStatusMeta(status: PlatformServiceTrialStatus) {
  return { label: statusLabels[status], variant: statusVariants[status] };
}

export function getTrialSourceLabel(source: PlatformServiceTrialSource) {
  return sourceLabels[source];
}

export function getTrialTypeLabel(type: PlatformServiceTrialType) {
  return typeLabels[type];
}

export function getTrialCapabilityLabel(capability: PlatformServiceTrialCapability) {
  return capabilityLabels[capability];
}

export function formatTrialDateTime(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("zh-CN", { hour12: false });
}

export function formatTrialPeriod(trial: PlatformServiceTrialRecord) {
  if (!trial.starts_at || !trial.trial_ends_at) return "尚未安排";
  return `${formatShortDate(trial.starts_at)} 至 ${formatShortDate(trial.trial_ends_at)}`;
}

export function formatTrialRemaining(
  trial: PlatformServiceTrialRecord,
  serverTime: string,
) {
  if (trial.status === "converted") return "已转正式";
  if (!trial.trial_ends_at) return "-";
  const remainingMs = Date.parse(trial.trial_ends_at) - Date.parse(serverTime);
  if (!Number.isFinite(remainingMs)) return "-";
  if (remainingMs <= 0) {
    if (trial.status === "grace_period" && trial.grace_ends_at) {
      const graceDays = Math.max(
        0,
        Math.ceil((Date.parse(trial.grace_ends_at) - Date.parse(serverTime)) / 86_400_000),
      );
      return `宽限期剩余 ${graceDays} 天`;
    }
    return "已到期";
  }
  return `剩余 ${Math.ceil(remainingMs / 86_400_000)} 天`;
}

export function getTrialConversionLabel(trial: PlatformServiceTrialRecord) {
  return trial.converted_at ? "已转正式" : "未转正式";
}

function formatShortDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("zh-CN");
}
