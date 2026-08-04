"use client";

import type { ColumnDef } from "@tanstack/react-table";

import { DataTable } from "@/components/admin/data-table";
import { PLATFORM_LIST_TABLE_ROW_HEIGHT_CLASS_NAME } from "@/components/platform/platform-list-page-size";
import { Badge } from "@/components/ui/badge";

import {
  formatDateTime,
  formatFen,
  getOrderProductCode,
  getOrderTenantName,
  getRefundStatusMeta,
} from "./platform-service-order-rules";
import { PlatformServiceRefundActions } from "./platform-service-refund-actions";
import type { PlatformServiceRefundRequestListItem } from "./platform-service-order-types";

export function PlatformServiceRefundRequestTable({
  requests,
  canReview,
}: {
  requests: PlatformServiceRefundRequestListItem[];
  canReview: boolean;
}) {
  const columns: ColumnDef<PlatformServiceRefundRequestListItem>[] = [
    {
      id: "order",
      header: "订单号",
      cell: ({ row }) => (
        <div className="min-w-0">
          <div className="truncate font-semibold">
            {row.original.order?.order_no || row.original.service_order_id}
          </div>
          <div className="truncate text-xs text-muted-foreground">
            {formatDateTime(row.original.created_at)}
          </div>
        </div>
      ),
      meta: { cellClassName: "min-w-[240px]" },
    },
    {
      id: "tenant",
      header: "租户",
      cell: ({ row }) => getOrderTenantName(row.original),
      meta: { cellClassName: "min-w-[180px]" },
    },
    {
      id: "product",
      header: "套餐",
      cell: ({ row }) => getOrderProductCode(row.original),
      meta: { cellClassName: "whitespace-nowrap" },
    },
    {
      id: "amount",
      header: "金额",
      cell: ({ row }) => (
        <span className="tabular-nums">{formatFen(row.original.order?.amount_fen)}</span>
      ),
      meta: { cellClassName: "whitespace-nowrap" },
    },
    {
      accessorKey: "status",
      header: "退款状态",
      cell: ({ row }) => {
        const meta = getRefundStatusMeta(row.original.status);
        return <Badge variant={meta.variant}>{meta.label}</Badge>;
      },
      meta: { cellClassName: "whitespace-nowrap" },
    },
    {
      accessorKey: "reason",
      header: "原因",
      cell: ({ row }) => (
        <span className="line-clamp-2 text-sm text-muted-foreground">
          {row.original.reason}
        </span>
      ),
      meta: { cellClassName: "min-w-[260px]" },
    },
    {
      id: "reviewed_at",
      header: "审核时间",
      cell: ({ row }) => (
        <span className="tabular-nums text-muted-foreground">
          {formatDateTime(row.original.reviewed_at)}
        </span>
      ),
      meta: { cellClassName: "whitespace-nowrap" },
    },
    {
      id: "actions",
      header: "操作",
      cell: ({ row }) => (
        <PlatformServiceRefundActions
          request={row.original}
          canReview={canReview}
        />
      ),
      meta: {
        headerClassName: "text-right",
        cellClassName: "whitespace-nowrap text-right",
      },
    },
  ];

  return (
    <DataTable
      columns={columns}
      data={requests}
      emptyText="当前筛选条件下没有退款审核记录"
      minWidth="min-w-[1180px]"
      tableClassName="border-t-0"
      rowClassName={() => PLATFORM_LIST_TABLE_ROW_HEIGHT_CLASS_NAME}
    />
  );
}

