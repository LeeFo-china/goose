"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { type ColumnDef } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/admin/data-table";
import type {
  FinanceProjectOperatingSummary,
  FinanceProjectRiskLevel,
} from "@/components/finance/finance-requests";
import {
  formatFinanceMoney,
  formatFinancePercent,
} from "@/components/finance/finance-ledger-utils";
import {
  financeRiskActionHref,
  financeRiskLabel,
  financeRiskVariant,
  summarizeFinanceRiskReasons,
} from "@/components/finance/finance-risk-display";
import {
  projectStatusLabel,
  projectStatusBadgeVariant,
} from "@/components/projects/project-mutation-utils";

function projectName(row: FinanceProjectOperatingSummary) {
  return row.project_name || row.project_id;
}

function budgetConfigured(row: FinanceProjectOperatingSummary) {
  return row.budget_configured === true;
}

function budgetNumber(
  row: FinanceProjectOperatingSummary,
  key: keyof Pick<
    FinanceProjectOperatingSummary,
    | "budget_cost_amount"
    | "budget_remaining_amount"
    | "projected_budget_profit_amount"
    | "profit_variance_amount"
  >,
) {
  const value = row[key];
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function budgetRatio(row: FinanceProjectOperatingSummary) {
  return row.budget_usage_ratio ?? null;
}

function riskLevel(row: FinanceProjectOperatingSummary): FinanceProjectRiskLevel {
  return row.risk_level || "normal";
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
      accessorKey: "budget_cost_amount",
      header: "预算成本",
      cell: ({ row }) => budgetConfigured(row.original)
        ? formatFinanceMoney(budgetNumber(row.original, "budget_cost_amount"))
        : "未配置",
      meta: {
        headerClassName: "text-right",
        cellClassName: "whitespace-nowrap text-right tabular-nums",
      },
    },
    {
      accessorKey: "budget_remaining_amount",
      header: "预算剩余",
      cell: ({ row }) => budgetConfigured(row.original)
        ? formatFinanceMoney(budgetNumber(row.original, "budget_remaining_amount"))
        : "-",
      meta: {
        headerClassName: "text-right",
        cellClassName: "whitespace-nowrap text-right tabular-nums",
      },
    },
    {
      accessorKey: "budget_usage_ratio",
      header: "使用率",
      cell: ({ row }) => budgetConfigured(row.original)
        ? formatFinancePercent(budgetRatio(row.original))
        : "-",
      meta: {
        headerClassName: "text-right",
        cellClassName: "whitespace-nowrap text-right tabular-nums text-muted-foreground",
      },
    },
    {
      accessorKey: "unallocated_expense_amount",
      header: "未归集",
      cell: ({ row }) => row.original.unallocated_expense_amount > 0
        ? formatFinanceMoney(row.original.unallocated_expense_amount)
        : "-",
      meta: {
        headerClassName: "text-right",
        cellClassName:
          "whitespace-nowrap text-right tabular-nums text-muted-foreground",
      },
    },
    {
      accessorKey: "projected_budget_profit_amount",
      header: "预算利润",
      cell: ({ row }) => budgetConfigured(row.original) ? (
        <div className="text-right">
          <div className="font-medium tabular-nums">
            {formatFinanceMoney(
              budgetNumber(row.original, "projected_budget_profit_amount"),
            )}
          </div>
          <div className="mt-1 text-xs text-muted-foreground tabular-nums">
            偏差 {formatFinanceMoney(budgetNumber(row.original, "profit_variance_amount"))}
          </div>
        </div>
      ) : "-",
      meta: {
        headerClassName: "text-right",
        cellClassName: "whitespace-nowrap text-right",
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
      accessorKey: "risk_level",
      header: "风险",
      cell: ({ row }) => {
        const level = riskLevel(row.original);
        const reasonText = summarizeFinanceRiskReasons(
          row.original.risk_reasons || [],
        );
        return (
          <div className="max-w-[12rem]">
            <Badge variant={financeRiskVariant(level)}>
              {financeRiskLabel(level)}
            </Badge>
            {reasonText ? (
              <div className="mt-1 truncate text-xs text-muted-foreground">
                {reasonText}
              </div>
            ) : null}
          </div>
        );
      },
      meta: {
        cellClassName: "whitespace-nowrap",
      },
    },
    {
      id: "action",
      header: "",
      cell: ({ row }) => {
        const action = row.original.risk_reasons
          ?.map((reason) => reason.action)
          .find((item) => financeRiskActionHref(item));
        const href = financeRiskActionHref(action);
        return (
          <div className="flex justify-end gap-1">
            {href ? (
              <Button asChild variant="outline" size="sm" className="h-8 px-2">
                <Link href={href}>{action?.label || "处理"}</Link>
              </Button>
            ) : null}
            <Button asChild variant="ghost" size="sm" className="h-8 px-2">
              <Link href={`/projects/${row.original.project_id}`}>
                查看项目
                <ArrowUpRight data-icon="inline-end" />
              </Link>
            </Button>
          </div>
        );
      },
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
      minWidth="min-w-[1800px]"
    />
  );
}
