"use client";

import Link from "next/link";
import { type ColumnDef } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/admin/data-table";
import type {
  WechatPayOrderRecord,
  WechatPayOrderStatus,
} from "@/components/finance/finance-wechat-pay-requests";
import {
  formatFinanceDateTime,
  formatFinanceMoney,
} from "@/components/finance/finance-ledger-utils";

function orderStatusMeta(status: WechatPayOrderStatus | string) {
  if (status === "paid") return { label: "已支付", variant: "success" as const };
  if (status === "failed") return { label: "支付失败", variant: "danger" as const };
  if (status === "closed") return { label: "已关闭", variant: "outline" as const };
  if (status === "refunded") return { label: "已退款", variant: "secondary" as const };
  return { label: "待支付", variant: "warning" as const };
}

function projectName(row: WechatPayOrderRecord) {
  return row.project?.name || row.project_id;
}

function receivableTitle(row: WechatPayOrderRecord) {
  return row.receivable_plan?.title || row.receivable_plan_id || "-";
}

export function FinanceWechatPayOrdersTable({
  rows,
}: {
  rows: WechatPayOrderRecord[];
}) {
  const columns: ColumnDef<WechatPayOrderRecord>[] = [
    {
      accessorKey: "created_at",
      header: "创建时间",
      cell: ({ row }) => formatFinanceDateTime(row.original.created_at),
      meta: {
        cellClassName: "whitespace-nowrap text-muted-foreground tabular-nums",
      },
    },
    {
      id: "project",
      header: "项目",
      cell: ({ row }) => (
        <div className="max-w-[18rem]">
          <Link
            href={`/projects/${row.original.project_id}`}
            className="truncate font-medium underline-offset-4 hover:underline"
          >
            {projectName(row.original)}
          </Link>
          <div className="mt-1 truncate text-xs text-muted-foreground">
            {row.original.workflow_task_id || "-"}
          </div>
        </div>
      ),
      meta: {
        cellClassName: "whitespace-nowrap",
      },
    },
    {
      id: "receivable_plan",
      header: "应收计划",
      cell: ({ row }) => (
        <div className="max-w-[16rem]">
          <div className="truncate">{receivableTitle(row.original)}</div>
          <div className="mt-1 truncate text-xs text-muted-foreground">
            {row.original.receivable_plan?.payment_type || "-"}
          </div>
        </div>
      ),
      meta: {
        cellClassName: "text-muted-foreground",
      },
    },
    {
      accessorKey: "out_trade_no",
      header: "商户订单号",
      cell: ({ row }) => (
        <div className="max-w-[15rem] truncate font-mono text-xs">
          {row.original.out_trade_no}
        </div>
      ),
      meta: {
        cellClassName: "whitespace-nowrap",
      },
    },
    {
      accessorKey: "amount",
      header: "订单金额",
      cell: ({ row }) => formatFinanceMoney(row.original.amount),
      meta: {
        headerClassName: "text-right",
        cellClassName: "whitespace-nowrap text-right font-medium tabular-nums",
      },
    },
    {
      accessorKey: "paid_amount",
      header: "已付金额",
      cell: ({ row }) => formatFinanceMoney(row.original.paid_amount),
      meta: {
        headerClassName: "text-right",
        cellClassName: "whitespace-nowrap text-right tabular-nums",
      },
    },
    {
      accessorKey: "status",
      header: "状态",
      cell: ({ row }) => {
        const meta = orderStatusMeta(row.original.status);
        return <Badge variant={meta.variant}>{meta.label}</Badge>;
      },
      meta: {
        cellClassName: "whitespace-nowrap",
      },
    },
    {
      accessorKey: "transaction_id",
      header: "微信交易号",
      cell: ({ row }) => (
        <div className="max-w-[15rem] truncate font-mono text-xs text-muted-foreground">
          {row.original.transaction_id || "-"}
        </div>
      ),
      meta: {
        cellClassName: "whitespace-nowrap",
      },
    },
    {
      accessorKey: "paid_at",
      header: "支付时间",
      cell: ({ row }) => formatFinanceDateTime(row.original.paid_at),
      meta: {
        cellClassName: "whitespace-nowrap text-muted-foreground tabular-nums",
      },
    },
  ];

  return (
    <DataTable
      columns={columns}
      data={rows}
      emptyText="暂无微信支付订单"
      minWidth="min-w-[1280px]"
    />
  );
}
