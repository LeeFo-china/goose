"use client";

import { type ColumnDef } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/admin/data-table";
import {
  getPlatformAuditLogActionLabel,
  getPlatformAuditLogActionVariant,
  getPlatformAuditLogStatusMeta,
  type PlatformAuditLogRecord,
} from "@/components/platform-audit-logs/platform-audit-log-types";

function formatDate(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : date.toLocaleString("zh-CN");
}

const columns: ColumnDef<PlatformAuditLogRecord>[] = [
  {
    accessorKey: "action",
    header: "操作",
    cell: ({ row }) => {
      const log = row.original;
      return (
        <div className="flex flex-col gap-1">
          <Badge variant={getPlatformAuditLogActionVariant(log.action)}>
            {getPlatformAuditLogActionLabel(log.action)}
          </Badge>
          <span className="text-xs text-muted-foreground">{log.action}</span>
        </div>
      );
    },
    meta: {
      cellClassName: "whitespace-nowrap",
    },
  },
  {
    accessorKey: "summary",
    header: "摘要",
    cell: ({ row }) => {
      const log = row.original;
      return (
        <div className="min-w-0">
          <div className="truncate font-medium">{log.summary || log.resource_label || "-"}</div>
          <div className="truncate text-xs text-muted-foreground">
            {log.resource_type}{log.resource_id ? ` / ${log.resource_id}` : ""}
          </div>
        </div>
      );
    },
    meta: {
      cellClassName: "min-w-[300px]",
    },
  },
  {
    id: "target_tenant",
    header: "目标租户",
    cell: ({ row }) => {
      const tenant = row.original.target_tenant;
      return (
        <div className="min-w-0">
          <div className="truncate">{tenant?.name || "-"}</div>
          <div className="truncate text-xs text-muted-foreground">{tenant?.slug || row.original.target_tenant_id || ""}</div>
        </div>
      );
    },
    meta: {
      cellClassName: "min-w-[180px]",
    },
  },
  {
    id: "actor",
    header: "操作人",
    cell: ({ row }) => {
      const actor = row.original.actor_employee;
      return (
        <div className="min-w-0">
          <div className="truncate">{actor?.name || actor?.phone || "-"}</div>
          <div className="truncate text-xs text-muted-foreground">{row.original.actor_user_id || ""}</div>
        </div>
      );
    },
    meta: {
      cellClassName: "min-w-[180px]",
    },
  },
  {
    accessorKey: "status",
    header: "结果",
    cell: ({ row }) => {
      const meta = getPlatformAuditLogStatusMeta(row.original.status);
      return <Badge variant={meta.variant}>{meta.label}</Badge>;
    },
    meta: {
      cellClassName: "whitespace-nowrap",
    },
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

export function PlatformAuditLogsTable({ logs }: { logs: PlatformAuditLogRecord[] }) {
  return (
    <DataTable
      columns={columns}
      data={logs}
      emptyText="暂无平台审计记录"
      minWidth="min-w-[1120px]"
    />
  );
}
