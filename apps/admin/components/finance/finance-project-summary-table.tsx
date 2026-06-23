"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { type ColumnDef } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/admin/data-table";
import type {
  FinanceProjectOperatingSummary,
} from "@/components/finance/finance-requests";
import {
  formatFinanceMoney,
  formatFinancePercent,
} from "@/components/finance/finance-ledger-utils";
import {
  projectStatusLabel,
  projectStatusBadgeVariant,
} from "@/components/projects/project-mutation-utils";

function projectName(row: FinanceProjectOperatingSummary) {
  return row.project_name || row.project_id;
}

export function FinanceProjectSummaryTable({
  rows,
}: {
  rows: FinanceProjectOperatingSummary[];
}) {
  const columns: ColumnDef<FinanceProjectOperatingSummary>[] = [
    {
      id: "project",
      header: "项目",
      cell: ({ row }) => (
        <div className="max-w-[18rem]">
          <div className="truncate font-medium">{projectName(row.original)}</div>
          <div className="mt-1 text-xs text-muted-foreground">
            {row.original.ledger_entry_count} 条流水
          </div>
        </div>
      ),
      meta: {
        cellClassName: "whitespace-nowrap",
      },
    },
    {
      accessorKey: "project_status",
      header: "状态",
      cell: ({ row }) => (
        <Badge variant={projectStatusBadgeVariant(row.original.project_status)}>
          {projectStatusLabel(row.original.project_status)}
        </Badge>
      ),
      meta: {
        cellClassName: "whitespace-nowrap",
      },
    },
    {
      accessorKey: "contract_amount",
      header: "合同",
      cell: ({ row }) => formatFinanceMoney(row.original.contract_amount),
      meta: {
        headerClassName: "text-right",
        cellClassName: "whitespace-nowrap text-right tabular-nums",
      },
    },
    {
      accessorKey: "received_amount",
      header: "已收",
      cell: ({ row }) => formatFinanceMoney(row.original.received_amount),
      meta: {
        headerClassName: "text-right",
        cellClassName: "whitespace-nowrap text-right tabular-nums",
      },
    },
    {
      accessorKey: "receivable_remaining_amount",
      header: "待收",
      cell: ({ row }) =>
        formatFinanceMoney(row.original.receivable_remaining_amount),
      meta: {
        headerClassName: "text-right",
        cellClassName: "whitespace-nowrap text-right tabular-nums",
      },
    },
    {
      accessorKey: "expense_paid_amount",
      header: "支出",
      cell: ({ row }) => formatFinanceMoney(row.original.expense_paid_amount),
      meta: {
        headerClassName: "text-right",
        cellClassName: "whitespace-nowrap text-right tabular-nums",
      },
    },
    {
      accessorKey: "actual_profit_amount",
      header: "实际利润",
      cell: ({ row }) => formatFinanceMoney(row.original.actual_profit_amount),
      meta: {
        headerClassName: "text-right",
        cellClassName: "whitespace-nowrap text-right font-medium tabular-nums",
      },
    },
    {
      accessorKey: "actual_gross_margin",
      header: "实际毛利率",
      cell: ({ row }) => formatFinancePercent(row.original.actual_gross_margin),
      meta: {
        headerClassName: "text-right",
        cellClassName: "whitespace-nowrap text-right tabular-nums text-muted-foreground",
      },
    },
    {
      accessorKey: "overdue_amount",
      header: "逾期",
      cell: ({ row }) => row.original.overdue_count > 0
        ? `${formatFinanceMoney(row.original.overdue_amount)} / ${row.original.overdue_count} 笔`
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
      emptyText="暂无项目经营数据"
      minWidth="min-w-[1280px]"
    />
  );
}
