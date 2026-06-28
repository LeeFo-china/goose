"use client";

import { type ColumnDef } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/admin/data-table";
import { PLATFORM_LIST_TABLE_ROW_HEIGHT_CLASS_NAME } from "@/components/platform/platform-list-page-size";
import type { UsageAiLogRecord } from "@/components/usage/usage-types";
import {
  aiBillableBadge,
  aiSourceLabel,
  aiStatusBadge,
  formatUsageLogDate,
  formatUsageLogNumber,
} from "@/components/usage/usage-log-formatters";

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
          <div>{formatUsageLogNumber(row.original.total_tokens)} total</div>
          <div className="text-xs text-muted-foreground">
            {formatUsageLogNumber(row.original.prompt_tokens)} / {formatUsageLogNumber(row.original.completion_tokens)}
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
      emptyText="暂无 AI 调用明细"
      minWidth="min-w-[1210px]"
      tableClassName="border-t-0"
      rowClassName={() => PLATFORM_LIST_TABLE_ROW_HEIGHT_CLASS_NAME}
    />
  );
}
