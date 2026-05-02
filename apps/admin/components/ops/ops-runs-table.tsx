"use client";

import { type ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/admin/data-table";
import type { OpsScriptRun } from "@/components/ops/ops-types";
import { Badge } from "@/components/ui/badge";

const statusMeta: Record<OpsScriptRun["status"], {
  label: string;
  variant: "success" | "warning" | "danger";
}> = {
  running: { label: "运行中", variant: "warning" },
  success: { label: "成功", variant: "success" },
  failed: { label: "失败", variant: "danger" },
  timeout: { label: "超时", variant: "danger" },
};

function formatDateTime(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function executorName(run: OpsScriptRun) {
  return run.executed_by?.name || run.executed_by?.phone || "-";
}

const columns: ColumnDef<OpsScriptRun>[] = [
  {
    accessorKey: "script_label",
    header: "脚本",
    cell: ({ row }) => (
      <div className="min-w-0">
        <div className="truncate font-medium">{row.original.script_label}</div>
        <div className="truncate text-xs text-muted-foreground">{row.original.script_key}</div>
      </div>
    ),
  },
  {
    accessorKey: "status",
    header: "状态",
    cell: ({ row }) => {
      const meta = statusMeta[row.original.status] || statusMeta.failed;
      return <Badge variant={meta.variant}>{meta.label}</Badge>;
    },
    meta: {
      cellClassName: "whitespace-nowrap",
    },
  },
  {
    accessorKey: "exit_code",
    header: "退出码",
    cell: ({ row }) => row.original.exit_code ?? "-",
    meta: {
      cellClassName: "whitespace-nowrap text-muted-foreground",
    },
  },
  {
    accessorKey: "duration_ms",
    header: "耗时",
    cell: ({ row }) => `${row.original.duration_ms ?? 0}ms`,
    meta: {
      cellClassName: "whitespace-nowrap text-muted-foreground",
    },
  },
  {
    id: "executor",
    header: "执行人",
    cell: ({ row }) => executorName(row.original),
    meta: {
      cellClassName: "whitespace-nowrap text-muted-foreground",
    },
  },
  {
    accessorKey: "created_at",
    header: "执行时间",
    cell: ({ row }) => formatDateTime(row.original.created_at),
    meta: {
      cellClassName: "whitespace-nowrap text-muted-foreground",
    },
  },
];

export function OpsRunsTable({ runs }: { runs: OpsScriptRun[] }) {
  return (
    <DataTable
      columns={columns}
      data={runs}
      emptyText="还没有脚本执行记录"
      minWidth="min-w-[980px]"
    />
  );
}

