"use client";

import Link from "next/link";
import { type ReactNode } from "react";
import { AlertTriangle, ArrowUpRight } from "lucide-react";
import { type ColumnDef } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/admin/data-table";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
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

function moneyTextClass(value: number | string | null | undefined) {
  const amount = Number(value || 0);
  if (amount < 0) return "text-red-700";
  if (amount > 0) return "text-foreground";
  return "text-muted-foreground";
}

function financeRiskActionByKey(
  row: FinanceProjectOperatingSummary,
  key: string,
) {
  return row.risk_reasons
    ?.map((reason) => reason.action)
    .find((action) => action?.key === key);
}

function budgetActionHref(row: FinanceProjectOperatingSummary) {
  const href = financeRiskActionHref(
    financeRiskActionByKey(row, "open_cost_budget"),
  );
  if (href) return href;
  return budgetConfigured(row) ? null : `/projects/${row.project_id}?tab=overview`;
}

function unallocatedActionHref(row: FinanceProjectOperatingSummary) {
  const href = financeRiskActionHref(
    financeRiskActionByKey(row, "open_unallocated_ledger"),
  );
  if (href) return href;
  return row.unallocated_expense_amount > 0
    ? `/finance/ledger?project_id=${row.project_id}&direction=out&unallocated_only=true`
    : null;
}

function formatFinanceDateTime(value: string | null | undefined) {
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

function rowToneClass(row: FinanceProjectOperatingSummary) {
  if (riskLevel(row) === "danger") return "bg-red-50/40 hover:bg-red-50/70";
  if (riskLevel(row) === "warning") return "bg-amber-50/35 hover:bg-amber-50/70";
  if (!budgetConfigured(row) || row.unallocated_expense_amount > 0) {
    return "bg-amber-50/20 hover:bg-amber-50/50";
  }
  return undefined;
}

function ProjectCellContent({
  row,
}: {
  row: FinanceProjectOperatingSummary;
}) {
  return (
    <>
      <div className="truncate font-medium">{projectName(row)}</div>
      <div className="mt-1 flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
        <span>{row.ledger_entry_count} 条流水</span>
        {row.unallocated_expense_amount > 0 ? (
          <Badge variant="warning" className="px-1.5 py-0 text-[11px]">
            有未归集
          </Badge>
        ) : null}
      </div>
    </>
  );
}

function FinanceUnallocatedProjectHoverCard({
  row,
  children,
}: {
  row: FinanceProjectOperatingSummary;
  children: ReactNode;
}) {
  const items = row.unallocated_expense_items || [];

  return (
    <HoverCard openDelay={0} closeDelay={80}>
      <HoverCardTrigger asChild>
        <button
          type="button"
          className="-mx-5 -my-2 block w-[calc(100%+2.5rem)] max-w-[20.5rem] cursor-default rounded-sm px-5 py-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {children}
        </button>
      </HoverCardTrigger>
      <HoverCardContent
        align="start"
        aria-label="未归集费用摘要"
        className="pointer-events-none w-80 p-0"
        data-testid="finance-unallocated-summary-hover-card"
        side="right"
      >
        <div className="flex flex-col gap-3 p-3 text-sm">
          <div className="flex items-start gap-2">
            <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md bg-amber-100 text-amber-700">
              <AlertTriangle aria-hidden="true" className="size-4" />
            </span>
            <div className="min-w-0">
              <h3 className="text-sm font-semibold">待归集申请明细</h3>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            {items.length > 0 ? items.map((item) => (
              <div key={item.id} className="min-w-0">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate font-medium">
                      {item.request_title || item.summary || "未命名费用申请"}
                    </div>
                    <div className="mt-0.5 truncate text-xs text-muted-foreground">
                      {item.expense_category || "未设置分类"}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                      <span>{item.applicant_name || item.applicant_phone || "未知员工"}</span>
                      <span>{formatFinanceDateTime(item.request_time)}</span>
                      {item.request_no ? <span>{item.request_no}</span> : null}
                    </div>
                  </div>
                  <div className="shrink-0 text-right text-xs font-medium tabular-nums">
                    {formatFinanceMoney(item.amount)}
                  </div>
                </div>
              </div>
            )) : (
              <div className="text-xs text-muted-foreground">
                暂无可展示的费用申请明细
              </div>
            )}
          </div>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
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
      cell: ({ row }) => {
        const content = <ProjectCellContent row={row.original} />;
        if (row.original.unallocated_expense_amount <= 0) {
          return <div className="max-w-[18rem]">{content}</div>;
        }

        return (
          <FinanceUnallocatedProjectHoverCard row={row.original}>
            {content}
          </FinanceUnallocatedProjectHoverCard>
        );
      },
      meta: {
        headerClassName: "w-[17%]",
        cellClassName: "min-w-0 whitespace-nowrap",
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
        headerClassName: "w-[7%]",
        cellClassName: "whitespace-nowrap",
      },
    },
    {
      accessorKey: "contract_amount",
      header: "合同/回款",
      cell: ({ row }) => (
        <div className="min-w-0 text-right">
          <div className="truncate font-medium tabular-nums">
            {formatFinanceMoney(row.original.contract_amount)}
          </div>
          <div className="mt-1 truncate text-xs text-muted-foreground tabular-nums">
            {formatFinanceMoney(row.original.received_amount)}
          </div>
          <div className="mt-1 truncate text-xs text-muted-foreground tabular-nums">
            待收 {formatFinanceMoney(row.original.receivable_remaining_amount)}
          </div>
        </div>
      ),
      meta: {
        headerClassName: "w-[14%] text-right",
        cellClassName: "min-w-0 text-right",
      },
    },
    {
      accessorKey: "expense_paid_amount",
      header: "支出/预算",
      cell: ({ row }) => (
        <div className="min-w-0 text-right">
          <div className="truncate font-medium tabular-nums">
            {formatFinanceMoney(row.original.expense_paid_amount)}
          </div>
          <div className="mt-1 truncate text-xs text-muted-foreground tabular-nums">
            {budgetConfigured(row.original)
              ? `预算 ${formatFinanceMoney(budgetNumber(row.original, "budget_cost_amount"))}`
              : "预算未配置"}
          </div>
          <div className="mt-1 truncate text-xs text-muted-foreground tabular-nums">
            使用率 {formatFinancePercent(budgetRatio(row.original))}
          </div>
        </div>
      ),
      meta: {
        headerClassName: "w-[14%] text-right",
        cellClassName: "min-w-0 text-right",
      },
    },
    {
      accessorKey: "actual_profit_amount",
      header: "利润",
      cell: ({ row }) => (
        <div className="min-w-0 text-right">
          <div className={`truncate font-medium tabular-nums ${moneyTextClass(row.original.actual_profit_amount)}`}>
            {formatFinanceMoney(row.original.actual_profit_amount)}
          </div>
          <div className="mt-1 truncate text-xs text-muted-foreground tabular-nums">
            毛利率 {formatFinancePercent(row.original.actual_gross_margin)}
          </div>
          <div className={`mt-1 truncate text-xs tabular-nums ${moneyTextClass(row.original.profit_variance_amount)}`}>
            偏差 {formatFinanceMoney(
              budgetNumber(row.original, "profit_variance_amount"),
            )}
          </div>
        </div>
      ),
      meta: {
        headerClassName: "w-[12%] text-right",
        cellClassName: "min-w-0 text-right",
      },
    },
    {
      accessorKey: "risk_level",
      header: "风险状态",
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
            {row.original.overdue_count > 0 ? (
              <Badge variant="danger" className="ml-1">
                逾期 {row.original.overdue_count} 笔
              </Badge>
            ) : null}
            {reasonText ? (
              <div className="mt-1 truncate text-xs text-muted-foreground">
                {reasonText}
              </div>
            ) : null}
          </div>
        );
      },
      meta: {
        headerClassName: "min-w-0",
        cellClassName: "min-w-0",
      },
    },
    {
      id: "action",
      header: "操作",
      cell: ({ row }) => {
        const budgetHref = budgetActionHref(row.original);
        const unallocatedHref = unallocatedActionHref(row.original);
        return (
          <div className="flex flex-nowrap justify-end gap-1">
            {budgetHref ? (
              <Button asChild variant="outline" size="sm" className="h-8 px-2">
                <Link href={budgetHref}>配预算</Link>
              </Button>
            ) : null}
            {unallocatedHref ? (
              <Button asChild variant="outline" size="sm" className="h-8 px-2">
                <Link href={unallocatedHref}>归集成本</Link>
              </Button>
            ) : null}
            <Button asChild variant="ghost" size="sm" className="h-8 px-2">
              <Link href={`/projects/${row.original.project_id}`}>
                查看
                <ArrowUpRight data-icon="inline-end" />
              </Link>
            </Button>
          </div>
        );
      },
      meta: {
        headerClassName:
          "w-[13.5rem] text-right lg:sticky lg:right-0 lg:z-10 lg:bg-card lg:shadow-[-12px_0_18px_-18px_hsl(var(--foreground)/0.25)]",
        cellClassName:
          "text-right lg:sticky lg:right-0 lg:z-10 lg:bg-card lg:shadow-[-12px_0_18px_-18px_hsl(var(--foreground)/0.25)]",
      },
    },
  ];

  return (
    <DataTable
      columns={columns}
      data={rows}
      emptyText="暂无项目经营数据"
      containerClassName="overflow-x-hidden"
      tableClassName="table-fixed [&_td]:px-3 [&_td]:py-2 [&_th]:px-3"
      headerClassName="sticky top-0 z-10 bg-card shadow-[inset_0_-1px_0_hsl(var(--border))]"
      rowClassName={rowToneClass}
    />
  );
}
