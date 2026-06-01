"use client";

import { type ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/admin/data-table";
import type { UsageSmsLogRecord } from "@/components/usage/usage-types";
import {
  formatUsageLogDate,
  formatUsageLogNumber,
  smsStatusBadge,
} from "@/components/usage/usage-log-formatters";

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
        <span className="text-sm">{formatUsageLogNumber(row.original.sms_count)}</span>
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
        <span className="text-muted-foreground">{formatUsageLogDate(row.original.created_at)}</span>
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
