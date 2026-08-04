"use client";

import type { ColumnDef } from "@tanstack/react-table";

import { DataTable } from "@/components/admin/data-table";
import { PLATFORM_LIST_TABLE_ROW_HEIGHT_CLASS_NAME } from "@/components/platform/platform-list-page-size";
import { Badge } from "@/components/ui/badge";

import {
  formatDateTime,
  formatFen,
  getPaymentStatusMeta,
  getServiceStatusMeta,
  getTenantName,
  getWechatShippingStatusMeta,
} from "./platform-service-order-rules";
import { PlatformServiceOrderShippingAction } from "./platform-service-order-shipping-action";
import type { PlatformServiceOrderListItem } from "./platform-service-order-types";

export function PlatformServiceOrderTable({
  orders,
  canRetryShipping,
}: {
  orders: PlatformServiceOrderListItem[];
  canRetryShipping: boolean;
}) {
  const columns: ColumnDef<PlatformServiceOrderListItem>[] = [
    {
      accessorKey: "order_no",
      header: "订单号",
      cell: ({ row }) => (
        <div className="min-w-0">
          <div className="truncate font-semibold">{row.original.order_no}</div>
          <div className="truncate text-xs text-muted-foreground">
            {formatDateTime(row.original.created_at)}
          </div>
        </div>
      ),
      meta: { cellClassName: "min-w-[220px]" },
    },
    {
      id: "tenant",
      header: "租户",
      cell: ({ row }) => <span className="truncate">{getTenantName(row.original)}</span>,
      meta: { cellClassName: "min-w-[180px]" },
    },
    {
      accessorKey: "product_code",
      header: "套餐",
      cell: ({ row }) => (
        <div>
          <div>{row.original.product_code}</div>
          <div className="text-xs text-muted-foreground">{row.original.term_years} 年</div>
        </div>
      ),
      meta: { cellClassName: "whitespace-nowrap" },
    },
    {
      accessorKey: "amount_fen",
      header: "金额",
      cell: ({ row }) => (
        <span className="tabular-nums">{formatFen(row.original.amount_fen)}</span>
      ),
      meta: { cellClassName: "whitespace-nowrap" },
    },
    {
      accessorKey: "payment_status",
      header: "支付状态",
      cell: ({ row }) => {
        const meta = getPaymentStatusMeta(row.original.payment_status);
        return <Badge variant={meta.variant}>{meta.label}</Badge>;
      },
      meta: { cellClassName: "whitespace-nowrap" },
    },
    {
      accessorKey: "service_status",
      header: "服务状态",
      cell: ({ row }) => {
        const meta = getServiceStatusMeta(row.original.service_status);
        return <Badge variant={meta.variant}>{meta.label}</Badge>;
      },
      meta: { cellClassName: "whitespace-nowrap" },
    },
    {
      accessorKey: "paid_at",
      header: "支付时间",
      cell: ({ row }) => (
        <span className="tabular-nums text-muted-foreground">
          {formatDateTime(row.original.paid_at)}
        </span>
      ),
      meta: { cellClassName: "whitespace-nowrap" },
    },
    {
      id: "wechat_shipping_report",
      header: "微信履约",
      cell: ({ row }) => {
        const report = row.original.wechat_shipping_report;
        const meta = getWechatShippingStatusMeta(report?.status || "not_started");
        return (
          <div className="space-y-1">
            <Badge variant={meta.variant}>{meta.label}</Badge>
            <div className="text-xs text-muted-foreground">
              {formatDateTime(report?.last_attempt_at)}
            </div>
            {report?.wechat_errcode ? (
              <div className="text-xs tabular-nums text-destructive">
                {report.wechat_errcode}
              </div>
            ) : null}
          </div>
        );
      },
      meta: { cellClassName: "whitespace-nowrap" },
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <div className="flex justify-end">
          <PlatformServiceOrderShippingAction
            order={row.original}
            canRetry={canRetryShipping}
          />
        </div>
      ),
      meta: { cellClassName: "min-w-[176px]" },
    },
  ];

  return (
    <DataTable
      columns={columns}
      data={orders}
      emptyText="当前筛选条件下没有平台技术服务订单"
      minWidth="min-w-[1320px]"
      tableClassName="border-t-0"
      rowClassName={() => PLATFORM_LIST_TABLE_ROW_HEIGHT_CLASS_NAME}
    />
  );
}
