"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { type ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/admin/data-table";
import type {
  FinanceReconciliationExceptionRecord,
} from "@/components/finance/finance-reconciliation-requests";
import {
  financeReconciliationActionHref,
  financeReconciliationDirectionLabel,
  financeReconciliationExceptionLabel,
  financeReconciliationLevelMeta,
} from "@/components/finance/finance-reconciliation-utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  formatFinanceDateTime,
  formatFinanceMoney,
} from "./finance-ledger-utils";

function projectName(row: FinanceReconciliationExceptionRecord) {
  return row.project_name || row.project_id || "-";
}

export function FinanceReconciliationTable({
  rows,
}: {
  rows: FinanceReconciliationExceptionRecord[];
}) {
  const columns: ColumnDef<FinanceReconciliationExceptionRecord>[] = [
    {
      accessorKey: "occurred_at",
      header: "发生时间",
      cell: ({ row }) => formatFinanceDateTime(row.original.occurred_at),
      meta: {
        cellClassName: "whitespace-nowrap text-muted-foreground tabular-nums",
      },
    },
    {
      id: "project",
      header: "项目",
      cell: ({ row }) => (
        <div className="max-w-[18rem]">
          <div className="truncate font-medium">{projectName(row.original)}</div>
          <div className="mt-1 truncate text-xs text-muted-foreground">
            {row.original.project_id || "-"}
          </div>
        </div>
      ),
      meta: {
        cellClassName: "whitespace-nowrap",
      },
    },
    {
      accessorKey: "level",
      header: "等级",
      cell: ({ row }) => {
        const meta = financeReconciliationLevelMeta(row.original.level);
        return <Badge variant={meta.variant}>{meta.label}</Badge>;
      },
      meta: {
        cellClassName: "whitespace-nowrap",
      },
    },
    {
      accessorKey: "exception_code",
      header: "异常类型",
      cell: ({ row }) => (
        <div className="max-w-[12rem] truncate">
          {financeReconciliationExceptionLabel(row.original.exception_code)}
        </div>
      ),
      meta: {
        cellClassName: "whitespace-nowrap text-muted-foreground",
      },
    },
    {
      id: "description",
      header: "异常说明",
      cell: ({ row }) => (
        <div className="max-w-[24rem]">
          <div className="truncate font-medium">{row.original.title}</div>
          <div className="mt-1 truncate text-xs text-muted-foreground">
            {row.original.description}
          </div>
        </div>
      ),
    },
    {
      accessorKey: "direction",
      header: "方向",
      cell: ({ row }) =>
        financeReconciliationDirectionLabel(row.original.direction),
      meta: {
        cellClassName: "whitespace-nowrap text-muted-foreground",
      },
    },
    {
      accessorKey: "amount",
      header: "差异金额",
      cell: ({ row }) => formatFinanceMoney(row.original.amount),
      meta: {
        headerClassName: "text-right",
        cellClassName: "whitespace-nowrap text-right font-medium tabular-nums",
      },
    },
    {
      id: "action",
      header: "",
      cell: ({ row }) => (
        <Button asChild variant="ghost" size="sm" className="h-8 px-2">
          <Link href={financeReconciliationActionHref(row.original.action.target)}>
            {row.original.action.label || "查看"}
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
      emptyText="当前筛选条件下暂无对账异常"
      minWidth="min-w-[1180px]"
    />
  );
}
