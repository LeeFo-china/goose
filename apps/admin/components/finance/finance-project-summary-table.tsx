"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { type ColumnDef } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/admin/data-table";
import type {
  FinanceProjectOperatingSummary,
  FinanceProjectRiskFlag,
  FinanceProjectRiskLevel,
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

function riskLabel(level: FinanceProjectRiskLevel) {
  if (level === "danger") return "超预算";
  if (level === "warning") return "预警";
  if (level === "info") return "待配置";
  return "正常";
}

function riskVariant(level: FinanceProjectRiskLevel) {
  if (level === "danger") return "danger" as const;
  if (level === "warning") return "warning" as const;
  if (level === "info") return "secondary" as const;
  return "success" as const;
}

const RISK_FLAG_LABELS: Record<FinanceProjectRiskFlag, string> = {
  budget_missing: "未配置预算",
  category_over_budget: "分类预警",
  project_over_budget: "项目超预算",
  low_projected_margin: "预算毛利偏低",
  receivable_overdue: "应收逾期",
};

function riskFlagText(row: FinanceProjectOperatingSummary) {
  const flags = Array.isArray(row.risk_flags) ? row.risk_flags : [];
  return flags.map((flag) => RISK_FLAG_LABELS[flag]).filter(Boolean).join("、");
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
        const flagText = riskFlagText(row.original);
        return (
          <div className="max-w-[10rem]">
            <Badge variant={riskVariant(level)}>{riskLabel(level)}</Badge>
            {flagText ? (
              <div className="mt-1 truncate text-xs text-muted-foreground">
                {flagText}
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
      minWidth="min-w-[1720px]"
    />
  );
}
