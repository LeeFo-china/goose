"use client";

import { type ColumnDef } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/admin/data-table";
import type {
  UsageAiLogRecord,
  UsageSmsLogRecord,
  UsageSocialVideoLogRecord,
} from "@/components/usage/usage-types";

function formatDate(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : date.toLocaleString("zh-CN");
}

function formatNumber(value?: number | null) {
  return new Intl.NumberFormat("zh-CN").format(value || 0);
}

function formatDurationSeconds(value?: number | null) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return "-";
  const minutes = Math.floor(value / 60);
  const seconds = Math.round(value % 60);
  return minutes > 0 ? `${minutes}分${String(seconds).padStart(2, "0")}秒` : `${seconds}秒`;
}

function aiStatusBadge(status: UsageAiLogRecord["status"]) {
  return status === "success"
    ? <Badge variant="success">成功</Badge>
    : <Badge variant="danger">失败</Badge>;
}

function aiSourceLabel(source?: string | null) {
  if (source === "customer_miniprogram") return "客户小程序";
  if (source === "employee_miniprogram") return "员工小程序";
  if (source === "visitor") return "访客";
  if (source === "admin") return "Admin";
  return source || "未标记";
}

function aiBillableBadge(billable?: boolean | null) {
  if (billable === false) return <Badge variant="outline">不计费</Badge>;
  if (billable === true) return <Badge variant="secondary">计费</Badge>;
  return <Badge variant="outline">未标记</Badge>;
}

function smsStatusBadge(status: UsageSmsLogRecord["status"]) {
  if (status === "success") return <Badge variant="success">成功</Badge>;
  if (status === "failure") return <Badge variant="danger">失败</Badge>;
  if (status === "mock") return <Badge variant="secondary">模拟</Badge>;
  return <Badge variant="warning">禁用</Badge>;
}

function socialVideoStatusBadge(status: UsageSocialVideoLogRecord["status"]) {
  if (status === "completed") return <Badge variant="success">完成</Badge>;
  if (status === "failed") return <Badge variant="danger">失败</Badge>;
  if (status === "pending") return <Badge variant="secondary">排队</Badge>;
  return <Badge variant="warning">处理中</Badge>;
}

function socialVideoBillableBadge(billable?: boolean | null) {
  if (billable === false) return <Badge variant="outline">不计费</Badge>;
  if (billable === true) return <Badge variant="secondary">计费</Badge>;
  return <Badge variant="outline">未标记</Badge>;
}

export function UsageAiLogsTable({ logs }: { logs: UsageAiLogRecord[] }) {
  const columns: ColumnDef<UsageAiLogRecord>[] = [
    {
      accessorKey: "scene_code",
      header: "场景",
      cell: ({ row }) => (
        <div className="min-w-0">
          <div className="truncate font-medium">{row.original.scene_code || "-"}</div>
          <div className="truncate text-xs text-muted-foreground">{row.original.request_id || row.original.id}</div>
        </div>
      ),
      meta: {
        cellClassName: "min-w-[220px]",
      },
    },
    {
      id: "model",
      header: "模型",
      cell: ({ row }) => (
        <div className="min-w-0">
          <div className="truncate">{row.original.provider_code || "unknown"}</div>
          <div className="truncate text-xs text-muted-foreground">
            {row.original.model_name || row.original.model_code || "模型待补"}
          </div>
        </div>
      ),
      meta: {
        cellClassName: "min-w-[180px]",
      },
    },
    {
      id: "source",
      header: "来源/计费",
      cell: ({ row }) => (
        <div className="flex flex-col items-start gap-1">
          <Badge variant="outline">{aiSourceLabel(row.original.source)}</Badge>
          {aiBillableBadge(row.original.billable)}
        </div>
      ),
      meta: {
        cellClassName: "min-w-[130px]",
      },
    },
    {
      accessorKey: "status",
      header: "状态",
      cell: ({ row }) => aiStatusBadge(row.original.status),
      meta: {
        cellClassName: "whitespace-nowrap",
      },
    },
    {
      id: "tokens",
      header: "Token",
      cell: ({ row }) => (
        <div className="whitespace-nowrap text-sm">
          <div>{formatNumber(row.original.total_tokens)} total</div>
          <div className="text-xs text-muted-foreground">
            {formatNumber(row.original.prompt_tokens)} / {formatNumber(row.original.completion_tokens)}
          </div>
        </div>
      ),
    },
    {
      accessorKey: "duration_ms",
      header: "耗时",
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">
          {typeof row.original.duration_ms === "number" ? `${row.original.duration_ms}ms` : "-"}
        </span>
      ),
      meta: {
        cellClassName: "whitespace-nowrap",
      },
    },
    {
      id: "error",
      header: "错误",
      cell: ({ row }) => (
        <div className="max-w-[260px] truncate text-sm text-muted-foreground">
          {row.original.error_message || row.original.error_code || "-"}
        </div>
      ),
    },
    {
      accessorKey: "created_at",
      header: "时间",
      cell: ({ row }) => (
        <span className="text-muted-foreground">{formatDate(row.original.created_at)}</span>
      ),
      meta: {
        cellClassName: "whitespace-nowrap",
      },
    },
  ];

  return (
    <DataTable
      columns={columns}
      data={logs}
      emptyText="暂无 AI 调用明细"
      minWidth="min-w-[1210px]"
    />
  );
}

export function UsageSmsLogsTable({ logs }: { logs: UsageSmsLogRecord[] }) {
  const columns: ColumnDef<UsageSmsLogRecord>[] = [
    {
      accessorKey: "purpose",
      header: "场景",
      cell: ({ row }) => (
        <div className="min-w-0">
          <div className="truncate font-medium">{row.original.purpose || "-"}</div>
          <div className="truncate text-xs text-muted-foreground">{row.original.template_code || "模板待补"}</div>
        </div>
      ),
      meta: {
        cellClassName: "min-w-[220px]",
      },
    },
    {
      id: "phone",
      header: "手机号",
      cell: ({ row }) => (
        <span className="whitespace-nowrap font-medium">{row.original.phone_masked}</span>
      ),
    },
    {
      id: "channel",
      header: "通道",
      cell: ({ row }) => (
        <div className="min-w-0">
          <div className="truncate">{row.original.provider}</div>
          <div className="truncate text-xs text-muted-foreground">{row.original.channel_mode || "platform"}</div>
        </div>
      ),
      meta: {
        cellClassName: "min-w-[160px]",
      },
    },
    {
      accessorKey: "status",
      header: "状态",
      cell: ({ row }) => smsStatusBadge(row.original.status),
      meta: {
        cellClassName: "whitespace-nowrap",
      },
    },
    {
      accessorKey: "sms_count",
      header: "条数",
      cell: ({ row }) => (
        <span className="text-sm">{formatNumber(row.original.sms_count)}</span>
      ),
      meta: {
        cellClassName: "whitespace-nowrap",
      },
    },
    {
      id: "provider_result",
      header: "服务商返回",
      cell: ({ row }) => (
        <div className="max-w-[260px] truncate text-sm text-muted-foreground">
          {row.original.provider_message || row.original.provider_code || row.original.request_id || "-"}
        </div>
      ),
    },
    {
      id: "error",
      header: "错误",
      cell: ({ row }) => (
        <div className="max-w-[260px] truncate text-sm text-muted-foreground">
          {row.original.error_message || row.original.error_code || "-"}
        </div>
      ),
    },
    {
      accessorKey: "created_at",
      header: "时间",
      cell: ({ row }) => (
        <span className="text-muted-foreground">{formatDate(row.original.created_at)}</span>
      ),
      meta: {
        cellClassName: "whitespace-nowrap",
      },
    },
  ];

  return (
    <DataTable
      columns={columns}
      data={logs}
      emptyText="暂无短信发送明细"
      minWidth="min-w-[1160px]"
    />
  );
}

export function UsageSocialVideoLogsTable({ logs }: { logs: UsageSocialVideoLogRecord[] }) {
  const columns: ColumnDef<UsageSocialVideoLogRecord>[] = [
    {
      id: "source",
      header: "视频链接",
      cell: ({ row }) => (
        <div className="min-w-0">
          <div className="truncate font-medium">{row.original.platform === "douyin" ? "抖音" : row.original.platform}</div>
          <div className="max-w-[300px] truncate text-xs text-muted-foreground">
            {row.original.source_url || row.original.id}
          </div>
        </div>
      ),
      meta: {
        cellClassName: "min-w-[260px]",
      },
    },
    {
      accessorKey: "status",
      header: "状态",
      cell: ({ row }) => socialVideoStatusBadge(row.original.status),
      meta: {
        cellClassName: "whitespace-nowrap",
      },
    },
    {
      id: "provider",
      header: "服务商",
      cell: ({ row }) => (
        <div className="min-w-0">
          <div className="truncate">{row.original.provider || "unknown"}</div>
          <div className="truncate text-xs text-muted-foreground">
            {row.original.billing_source || "计费来源待补"}
          </div>
        </div>
      ),
      meta: {
        cellClassName: "min-w-[160px]",
      },
    },
    {
      id: "duration",
      header: "时长",
      cell: ({ row }) => (
        <div className="whitespace-nowrap text-sm">
          <div>{formatDurationSeconds(row.original.billing_duration_seconds ?? row.original.audio_duration_seconds)}</div>
          <div className="text-xs text-muted-foreground">
            {row.original.billing_minutes == null
              ? "分钟待确认"
              : `${formatNumber(row.original.billing_minutes)} 计费分钟`}
          </div>
        </div>
      ),
    },
    {
      accessorKey: "billable",
      header: "计费",
      cell: ({ row }) => socialVideoBillableBadge(row.original.billable),
      meta: {
        cellClassName: "whitespace-nowrap",
      },
    },
    {
      id: "error",
      header: "错误",
      cell: ({ row }) => (
        <div className="max-w-[260px] truncate text-sm text-muted-foreground">
          {row.original.error_message || row.original.error_code || "-"}
        </div>
      ),
    },
    {
      accessorKey: "created_at",
      header: "创建时间",
      cell: ({ row }) => (
        <span className="text-muted-foreground">{formatDate(row.original.created_at)}</span>
      ),
      meta: {
        cellClassName: "whitespace-nowrap",
      },
    },
    {
      accessorKey: "completed_at",
      header: "完成时间",
      cell: ({ row }) => (
        <span className="text-muted-foreground">{formatDate(row.original.completed_at)}</span>
      ),
      meta: {
        cellClassName: "whitespace-nowrap",
      },
    },
  ];

  return (
    <DataTable
      columns={columns}
      data={logs}
      emptyText="暂无短视频转写明细"
      minWidth="min-w-[1260px]"
    />
  );
}
