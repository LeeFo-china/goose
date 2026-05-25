"use client";

import { type ColumnDef } from "@tanstack/react-table";
import { Eye, Image as ImageIcon } from "lucide-react";
import { DataTable } from "@/components/admin/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { CustomerServiceTicket } from "@/components/customer-service/customer-service-types";

type BadgeVariant = "default" | "secondary" | "outline" | "success" | "warning" | "danger";

const statusVariant: Record<string, BadgeVariant> = {
  open: "warning",
  in_progress: "default",
  resolved: "success",
  closed: "secondary",
  cancelled: "danger",
};

const priorityVariant: Record<string, BadgeVariant> = {
  normal: "secondary",
  high: "warning",
  urgent: "danger",
};

function formatDateTime(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function normalizeSummaryText(value: string | null | undefined) {
  return value?.replace(/\s+/g, " ").trim() || "";
}

function hasDistinctSummaryTitle(title: string | null | undefined, content: string | null | undefined) {
  const normalizedTitle = normalizeSummaryText(title);
  const normalizedContent = normalizeSummaryText(content);

  return Boolean(
    normalizedTitle &&
      normalizedContent &&
      normalizedTitle !== normalizedContent &&
      !normalizedContent.startsWith(normalizedTitle)
  );
}

const columns: ColumnDef<CustomerServiceTicket>[] = [
  {
    accessorKey: "ticket_no",
    header: "工单",
    cell: ({ row }) => (
      <div className="min-w-[148px]">
        <div className="font-medium">{row.original.ticket_no}</div>
        <div className="mt-1 text-xs text-muted-foreground">
          {formatDateTime(row.original.created_at)}
        </div>
      </div>
    ),
  },
  {
    id: "customer",
    header: "客户",
    cell: ({ row }) => (
      <div className="min-w-[132px]">
        <div className="font-medium">{row.original.customer?.name || "未命名客户"}</div>
        <div className="mt-1 text-xs text-muted-foreground">
          {row.original.customer?.phone_masked || "-"}
        </div>
      </div>
    ),
  },
  {
    id: "project",
    header: "项目",
    cell: ({ row }) => (
      <div className="min-w-[150px]">
        <div className="truncate">{row.original.project?.name || "未关联项目"}</div>
        <div className="mt-1 truncate text-xs text-muted-foreground">
          {row.original.project?.status || "-"}
        </div>
      </div>
    ),
  },
  {
    accessorKey: "category",
    header: "分类",
    cell: ({ row }) => (
      <Badge className="whitespace-nowrap" variant="outline">
        {row.original.category_label}
      </Badge>
    ),
    meta: {
      cellClassName: "whitespace-nowrap",
    },
  },
  {
    accessorKey: "status",
    header: "状态",
    cell: ({ row }) => (
      <Badge
        className="whitespace-nowrap"
        variant={statusVariant[row.original.status] || "outline"}
      >
        {row.original.status_label}
      </Badge>
    ),
    meta: {
      cellClassName: "whitespace-nowrap",
    },
  },
  {
    accessorKey: "priority",
    header: "优先级",
    cell: ({ row }) => (
      <Badge
        className="whitespace-nowrap"
        variant={priorityVariant[row.original.priority] || "secondary"}
      >
        {row.original.priority_label}
      </Badge>
    ),
    meta: {
      cellClassName: "whitespace-nowrap",
    },
  },
  {
    id: "summary",
    header: "问题摘要",
    cell: ({ row }) => {
      const title = row.original.title?.trim() || "";
      const content = row.original.content?.trim() || "";
      const showTitle = hasDistinctSummaryTitle(title, content);

      return (
        <div className="min-w-[260px] max-w-[360px]">
          {showTitle ? (
            <div className="truncate font-medium">{title}</div>
          ) : null}
          <div className={showTitle ? "mt-1 line-clamp-2 text-xs text-muted-foreground" : "line-clamp-2 text-sm font-medium"}>
            {content || title || "-"}
          </div>
        </div>
      );
    },
  },
  {
    id: "images",
    header: "图片",
    cell: ({ row }) => (
      <div className="flex items-center gap-1 text-sm text-muted-foreground">
        <ImageIcon aria-hidden="true" />
        {row.original.image_count}
      </div>
    ),
    meta: {
      cellClassName: "whitespace-nowrap",
    },
  },
  {
    id: "assignee",
    header: "负责人",
    cell: ({ row }) => (
      <div className="min-w-[96px] text-sm">
        {row.original.assigned_employee?.name || "未分配"}
      </div>
    ),
    meta: {
      cellClassName: "whitespace-nowrap text-muted-foreground",
    },
  },
  {
    id: "actions",
    header: "操作",
    cell: ({ row, table }) => {
      const meta = table.options.meta as
        | { openDetail?: (ticketId: string) => void }
        | undefined;
      const openDetail = meta?.openDetail;
      return (
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={(event) => {
            event.stopPropagation();
            if (typeof openDetail === "function") {
              openDetail(row.original.id);
            }
          }}
        >
          <Eye data-icon="inline-start" />
          详情
        </Button>
      );
    },
    meta: {
      headerClassName: "text-right",
      cellClassName: "text-right",
    },
  },
];

export function CustomerServiceTable({
  tickets,
  onOpenDetail,
}: {
  tickets: CustomerServiceTicket[];
  onOpenDetail: (ticketId: string) => void;
}) {
  return (
    <DataTable
      columns={columns}
      data={tickets}
      emptyText="没有符合条件的客服问题"
      minWidth="min-w-[1280px]"
      onRowClick={(ticket) => onOpenDetail(ticket.id)}
      tableMeta={{ openDetail: onOpenDetail }}
    />
  );
}
