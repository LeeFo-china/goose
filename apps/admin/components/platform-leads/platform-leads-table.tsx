"use client";

import { type ColumnDef } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/admin/data-table";
import { PlatformLeadDetailButton } from "@/components/platform-leads/platform-lead-mutations";
import {
  getPlatformLeadStatusMeta,
  type PlatformLeadRecord,
} from "@/components/platform-leads/platform-lead-types";

function formatDate(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : date.toLocaleString("zh-CN");
}

function formatArea(value?: number | null) {
  return typeof value === "number" && Number.isFinite(value) ? `${value}㎡` : null;
}

function locationText(lead: PlatformLeadRecord) {
  return [lead.city, lead.community].filter(Boolean).join(" / ") || "-";
}

const columns: ColumnDef<PlatformLeadRecord>[] = [
  {
    accessorKey: "phone",
    header: "线索",
    cell: ({ row }) => {
      const lead = row.original;
      return (
        <div className="min-w-0">
          <div className="truncate font-medium">{lead.name || "未留姓名"}</div>
          <div className="truncate text-xs text-muted-foreground">{lead.phone}</div>
        </div>
      );
    },
    meta: {
      cellClassName: "min-w-[160px]",
    },
  },
  {
    id: "need",
    header: "需求",
    cell: ({ row }) => {
      const lead = row.original;
      const area = formatArea(lead.area);
      const summary = [area, lead.budget].filter(Boolean).join(" / ");
      return (
        <div className="min-w-0">
          <div className="truncate">{locationText(lead)}</div>
          <div className="truncate text-xs text-muted-foreground">
            {summary || lead.description || "需求待补"}
          </div>
        </div>
      );
    },
    meta: {
      cellClassName: "min-w-[240px]",
    },
  },
  {
    accessorKey: "status",
    header: "状态",
    cell: ({ row }) => {
      const meta = getPlatformLeadStatusMeta(row.original.status);
      return <Badge variant={meta.variant}>{meta.label}</Badge>;
    },
    meta: {
      cellClassName: "whitespace-nowrap",
    },
  },
  {
    id: "assignment",
    header: "分配结果",
    cell: ({ row }) => {
      const lead = row.original;
      if (lead.status !== "assigned") {
        return <span className="text-sm text-muted-foreground">待分配</span>;
      }
      return (
        <div className="min-w-0">
          <div className="truncate font-medium">{lead.assigned_tenant?.name || "租户待补"}</div>
          <div className="truncate text-xs text-muted-foreground">
            {lead.assigned_customer
              ? `客户：${lead.assigned_customer.name || lead.assigned_customer.phone || lead.assigned_customer.id}`
              : "客户关联待补"}
          </div>
        </div>
      );
    },
    meta: {
      cellClassName: "min-w-[220px]",
    },
  },
  {
    accessorKey: "source",
    header: "来源",
    cell: ({ row }) => (
      <span className="text-sm text-muted-foreground">{row.original.source || "-"}</span>
    ),
    meta: {
      cellClassName: "whitespace-nowrap",
    },
  },
  {
    accessorKey: "created_at",
    header: "提交时间",
    cell: ({ row }) => (
      <span className="text-muted-foreground">{formatDate(row.original.created_at)}</span>
    ),
    meta: {
      cellClassName: "whitespace-nowrap",
    },
  },
  {
    id: "actions",
    header: "操作",
    cell: ({ row }) => (
      <div className="flex justify-end">
        <PlatformLeadDetailButton lead={row.original} />
      </div>
    ),
    meta: {
      headerClassName: "text-right",
      cellClassName: "whitespace-nowrap text-right",
    },
  },
];

export function PlatformLeadsTable({ leads }: { leads: PlatformLeadRecord[] }) {
  return (
    <DataTable
      columns={columns}
      data={leads}
      emptyText="暂无平台线索"
      minWidth="min-w-[1120px]"
    />
  );
}
