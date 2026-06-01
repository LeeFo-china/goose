"use client";

import { Badge } from "@/components/ui/badge";
import type {
  UsageAiLogRecord,
  UsageSmsLogRecord,
  UsageSocialVideoLogRecord,
} from "@/components/usage/usage-types";

export function formatUsageLogDate(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : date.toLocaleString("zh-CN");
}

export function formatUsageLogNumber(value?: number | null) {
  return new Intl.NumberFormat("zh-CN").format(value || 0);
}

export function formatDurationSeconds(value?: number | null) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return "-";
  const minutes = Math.floor(value / 60);
  const seconds = Math.round(value % 60);
  return minutes > 0 ? `${minutes}分${String(seconds).padStart(2, "0")}秒` : `${seconds}秒`;
}

export function socialVideoDisplayUrl(record: UsageSocialVideoLogRecord) {
  return record.resolved_video_url || record.normalized_url || record.source_url || record.id;
}

export function aiStatusBadge(status: UsageAiLogRecord["status"]) {
  return status === "success"
    ? <Badge variant="success">成功</Badge>
    : <Badge variant="danger">失败</Badge>;
}

export function aiSourceLabel(source?: string | null) {
  if (source === "customer_miniprogram") return "客户小程序";
  if (source === "employee_miniprogram") return "员工小程序";
  if (source === "visitor") return "访客";
  if (source === "admin") return "Admin";
  return source || "未标记";
}

export function aiBillableBadge(billable?: boolean | null) {
  if (billable === false) return <Badge variant="outline">不计费</Badge>;
  if (billable === true) return <Badge variant="secondary">计费</Badge>;
  return <Badge variant="outline">未标记</Badge>;
}

export function smsStatusBadge(status: UsageSmsLogRecord["status"]) {
  if (status === "success") return <Badge variant="success">成功</Badge>;
  if (status === "failure") return <Badge variant="danger">失败</Badge>;
  if (status === "mock") return <Badge variant="secondary">模拟</Badge>;
  return <Badge variant="warning">禁用</Badge>;
}

export function socialVideoStatusBadge(status: UsageSocialVideoLogRecord["status"]) {
  if (status === "completed") return <Badge variant="success">完成</Badge>;
  if (status === "failed") return <Badge variant="danger">失败</Badge>;
  if (status === "pending") return <Badge variant="secondary">排队</Badge>;
  return <Badge variant="warning">处理中</Badge>;
}

export function socialVideoBillableBadge(billable?: boolean | null) {
  if (billable === false) return <Badge variant="outline">不计费</Badge>;
  if (billable === true) return <Badge variant="secondary">计费</Badge>;
  return <Badge variant="outline">未标记</Badge>;
}
