"use client";

import { type ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/admin/data-table";
import {
  LeadConvertAction,
  LeadFollowAction,
  LeadInvalidateAction,
  type LeadUpdatedHandler,
} from "@/components/marketing/h5-lead-actions";
import { h5MarketingLeadStatusOptions } from "@/components/marketing/marketing-constants";
import type { H5MarketingLeadRecord } from "@/components/marketing/marketing-types";
import { Badge } from "@/components/ui/badge";

const statusLabel = Object.fromEntries(h5MarketingLeadStatusOptions);

const statusVariant: Record<string, "success" | "warning" | "secondary" | "outline" | "default"> = {
  new: "default",
  contacted: "warning",
  converted: "success",
  invalid: "secondary",
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

const columns: ColumnDef<H5MarketingLeadRecord>[] = [
  {
    accessorKey: "name",
    header: "线索",
    cell: ({ row }) => (
      <div className="min-w-0">
        <div className="truncate font-medium">{row.original.name || "未填写姓名"}</div>
        <div className="truncate text-xs text-muted-foreground">{row.original.phone || "未填写手机号"}</div>
      </div>
    ),
  },
  {
    accessorKey: "lead_status",
    header: "状态",
    cell: ({ row }) => (
      <Badge variant={statusVariant[row.original.lead_status] || "outline"}>
        {statusLabel[row.original.lead_status] || row.original.lead_status}
      </Badge>
    ),
    meta: {
      cellClassName: "whitespace-nowrap",
    },
  },
  {
    id: "activity",
    header: "活动页",
    cell: ({ row }) => (
      <div className="min-w-0">
        <div className="truncate text-sm">{row.original.page?.title || "未知活动页"}</div>
        <div className="truncate text-xs text-muted-foreground">
          {row.original.page?.slug ? `/p/${row.original.page.slug}` : "-"}
        </div>
      </div>
    ),
  },
  {
    id: "intent",
    header: "填写信息",
    cell: ({ row }) => (
      <div className="flex flex-col gap-1 text-sm">
        <span>{row.original.community || "未填写小区"}</span>
        <span className="text-xs text-muted-foreground">{row.original.city || "未填写城市"}</span>
      </div>
    ),
  },
  {
    id: "customer",
    header: "客户匹配",
    cell: ({ row }) => row.original.customer ? (
      <div className="flex flex-col gap-1 text-sm">
        <span>{row.original.customer.name || row.original.customer.phone || "已匹配客户"}</span>
        <span className="text-xs text-muted-foreground">{row.original.customer.status || "-"}</span>
      </div>
    ) : (
      <span className="text-sm text-muted-foreground">未匹配</span>
    ),
  },
  {
    accessorKey: "follow_remark",
    header: "跟进备注",
    cell: ({ row }) => (
      <div className="max-w-[260px] whitespace-pre-wrap text-sm text-muted-foreground">
        {row.original.follow_remark || "-"}
      </div>
    ),
  },
  {
    accessorKey: "created_at",
    header: "提交时间",
    cell: ({ row }) => formatDateTime(row.original.created_at),
    meta: {
      cellClassName: "whitespace-nowrap text-muted-foreground",
    },
  },
  {
    id: "actions",
    header: "操作",
    cell: ({ row, table }) => {
      const meta = table.options.meta as { onLeadUpdated?: LeadUpdatedHandler } | undefined;
      const onLeadUpdated = meta?.onLeadUpdated;

      return (
        <div className="flex justify-end gap-2">
          <LeadFollowAction lead={row.original} onLeadUpdated={onLeadUpdated} />
          <LeadConvertAction lead={row.original} onLeadUpdated={onLeadUpdated} />
          <LeadInvalidateAction lead={row.original} onLeadUpdated={onLeadUpdated} />
        </div>
      );
    },
    meta: {
      headerClassName: "text-right",
      cellClassName: "whitespace-nowrap text-right",
    },
  },
];

export function H5MarketingLeadsTable({
  leads,
  onLeadUpdated,
}: {
  leads: H5MarketingLeadRecord[];
  onLeadUpdated?: LeadUpdatedHandler;
}) {
  return (
    <DataTable
      columns={columns}
      data={leads}
      emptyText="还没有 H5 营销线索"
      minWidth="min-w-[1260px]"
      tableMeta={{ onLeadUpdated }}
    />
  );
}
