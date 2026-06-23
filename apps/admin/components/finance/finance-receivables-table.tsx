"use client";

import Link from "next/link";
import { PaymentTypeConfig } from "@gooes/domain";
import { ArrowUpRight } from "lucide-react";
import { type ColumnDef } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/admin/data-table";
import type {
  FinanceReceivableRecord,
  FinanceReceivableStatus,
} from "@/components/finance/finance-requests";
import {
  formatFinanceDate,
  formatFinanceMoney,
} from "@/components/finance/finance-ledger-utils";

function projectName(row: FinanceReceivableRecord) {
  return row.project?.name || row.project_id;
}

function paymentTypeLabel(value: string) {
  if (value in PaymentTypeConfig) {
    return PaymentTypeConfig[value as keyof typeof PaymentTypeConfig].label;
  }
  return value || "-";
}

function receivableStatusMeta(status: FinanceReceivableStatus) {
  if (status === "paid") return { label: "已收", variant: "success" as const };
  if (status === "overdue") return { label: "逾期", variant: "danger" as const };
  if (status === "partially_paid") {
    return { label: "部分收款", variant: "warning" as const };
  }
  if (status === "canceled") return { label: "已取消", variant: "outline" as const };
  return { label: "待收", variant: "secondary" as const };
}

export function FinanceReceivablesTable({
  rows,
}: {
  rows: FinanceReceivableRecord[];
}) {
  const columns: ColumnDef<FinanceReceivableRecord>[] = [
    {
      id: "project",
      header: "项目",
      cell: ({ row }) => (
        <div className="max-w-[18rem]">
          <div className="truncate font-medium">{projectName(row.original)}</div>
          <div className="mt-1 truncate text-xs text-muted-foreground">
            {row.original.workflow_node_key || row.original.source_type}
          </div>
        </div>
      ),
      meta: {
        cellClassName: "whitespace-nowrap",
      },
    },
    {
      accessorKey: "title",
      header: "应收事项",
      cell: ({ row }) => (
        <div className="max-w-[16rem] truncate">
          {row.original.title || paymentTypeLabel(row.original.payment_type)}
        </div>
      ),
      meta: {
        cellClassName: "text-muted-foreground",
      },
    },
    {
      accessorKey: "payment_type",
      header: "收款类型",
      cell: ({ row }) => paymentTypeLabel(row.original.payment_type),
      meta: {
        cellClassName: "whitespace-nowrap",
      },
    },
    {
      accessorKey: "status",
      header: "状态",
      cell: ({ row }) => {
        const meta = receivableStatusMeta(row.original.status);
        return <Badge variant={meta.variant}>{meta.label}</Badge>;
      },
      meta: {
        cellClassName: "whitespace-nowrap",
      },
    },
    {
      accessorKey: "amount",
      header: "应收",
      cell: ({ row }) => formatFinanceMoney(row.original.amount),
      meta: {
        headerClassName: "text-right",
        cellClassName: "whitespace-nowrap text-right font-medium tabular-nums",
      },
    },
    {
      accessorKey: "paid_amount",
      header: "已收",
      cell: ({ row }) => formatFinanceMoney(row.original.paid_amount),
      meta: {
        headerClassName: "text-right",
        cellClassName: "whitespace-nowrap text-right tabular-nums",
      },
    },
    {
      accessorKey: "remaining_amount",
      header: "未收",
      cell: ({ row }) => formatFinanceMoney(row.original.remaining_amount),
      meta: {
        headerClassName: "text-right",
        cellClassName: "whitespace-nowrap text-right tabular-nums",
      },
    },
    {
      accessorKey: "due_date",
      header: "应收日期",
      cell: ({ row }) => formatFinanceDate(row.original.due_date),
      meta: {
        cellClassName: "whitespace-nowrap text-muted-foreground tabular-nums",
      },
    },
    {
      accessorKey: "overdue_days",
      header: "逾期",
      cell: ({ row }) =>
        row.original.overdue_days > 0
          ? `${row.original.overdue_days} 天`
          : "-",
      meta: {
        headerClassName: "text-right",
        cellClassName: "whitespace-nowrap text-right tabular-nums text-muted-foreground",
      },
    },
    {
      id: "action",
      header: "",
      cell: ({ row }) => (
        <Button asChild variant="ghost" size="sm" className="h-8 px-2">
          <Link href={`/projects/${row.original.project_id}`}>
            查看项目
            <ArrowUpRight data-icon="inline-end" />
          </Link>
        </Button>
      ),
      meta: {
        cellClassName: "whitespace-nowrap text-right",
      },
    },
  ];

  return (
    <DataTable
      columns={columns}
      data={rows}
      emptyText="暂无应收计划"
      minWidth="min-w-[1180px]"
    />
  );
}
