"use client";

import { type ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/admin/data-table";
import type { UsageSocialVideoLogRecord } from "@/components/usage/usage-types";
import {
  formatDurationSeconds,
  formatUsageLogDate,
  formatUsageLogNumber,
  socialVideoBillableBadge,
  socialVideoDisplayUrl,
  socialVideoStatusBadge,
} from "@/components/usage/usage-log-formatters";

export function UsageSocialVideoLogsTable({ logs }: { logs: UsageSocialVideoLogRecord[] }) {
  const columns: ColumnDef<UsageSocialVideoLogRecord>[] = [
    {
      id: "source",
      header: "视频链接",
      cell: ({ row }) => {
        const displayUrl = socialVideoDisplayUrl(row.original);
        const originalUrl = row.original.source_url;
        return (
          <div className="min-w-0">
            <div className="truncate font-medium">
              {row.original.platform === "douyin" ? "抖音视频地址" : row.original.platform}
            </div>
            <a
              className="block max-w-[340px] truncate text-xs text-muted-foreground underline-offset-4 hover:underline"
              href={displayUrl}
              target="_blank"
              rel="noreferrer"
              title={displayUrl}
            >
              {displayUrl}
            </a>
            {originalUrl && originalUrl !== displayUrl ? (
              <div className="max-w-[340px] truncate text-xs text-muted-foreground" title={originalUrl}>
                原始提交：{originalUrl}
              </div>
            ) : null}
          </div>
        );
      },
      meta: {
        cellClassName: "min-w-[320px]",
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
              : `${formatUsageLogNumber(row.original.billing_minutes)} 计费分钟`}
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
        <span className="text-muted-foreground">{formatUsageLogDate(row.original.created_at)}</span>
      ),
      meta: {
        cellClassName: "whitespace-nowrap",
      },
    },
    {
      accessorKey: "completed_at",
      header: "完成时间",
      cell: ({ row }) => (
        <span className="text-muted-foreground">{formatUsageLogDate(row.original.completed_at)}</span>
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
