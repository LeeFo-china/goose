"use client";

import Link from "next/link";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { AlertTriangle, ArrowUpRight } from "lucide-react";
import { type ColumnDef } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/admin/data-table";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
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

function collectionRate(row: FinanceProjectOperatingSummary) {
  const contractAmount = Number(row.contract_amount || 0);
  if (!Number.isFinite(contractAmount) || contractAmount <= 0) return "-";
  return formatFinancePercent(Number(row.received_amount || 0) / contractAmount);
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

function unallocatedRiskReason(row: FinanceProjectOperatingSummary) {
  return row.risk_reasons?.find((reason) =>
    reason.code === "unallocated_expense"
  );
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

function FinanceUnallocatedProjectPopover({
  row,
  children,
}: {
  row: FinanceProjectOperatingSummary;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const reason = unallocatedRiskReason(row);

  useEffect(() => {
    if (!open) return;

    function handlePointerMove(event: PointerEvent) {
      const trigger = triggerRef.current;
      if (!trigger) {
        setOpen(false);
        return;
      }

      const rect = trigger.getBoundingClientRect();
      const isInsideTrigger =
        event.clientX >= rect.left &&
        event.clientX <= rect.right &&
        event.clientY >= rect.top &&
        event.clientY <= rect.bottom;

      if (!isInsideTrigger) setOpen(false);
    }

    document.addEventListener("pointermove", handlePointerMove);
    return () => {
      document.removeEventListener("pointermove", handlePointerMove);
    };
  }, [open]);

  function openPopover() {
    setOpen(true);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          ref={triggerRef}
          type="button"
          className="block w-full max-w-[18rem] cursor-default rounded-sm text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onBlur={() => setOpen(false)}
          onFocus={openPopover}
          onMouseEnter={openPopover}
          onMouseLeave={() => setOpen(false)}
        >
          {children}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        aria-label="未归集费用摘要"
        className="pointer-events-none w-80 p-0"
        side="right"
      >
        <div className="flex flex-col gap-3 p-3">
          <div className="flex items-start gap-2">
            <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md bg-amber-100 text-amber-700">
              <AlertTriangle aria-hidden="true" className="size-4" />
            </span>
            <div className="min-w-0">
              <h3 className="text-sm font-semibold">未归集费用摘要</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                {projectName(row)}
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="rounded-md border bg-muted/30 p-2">
              <div className="text-xs text-muted-foreground">未归集金额</div>
              <div className="mt-1 font-semibold tabular-nums">
                {formatFinanceMoney(row.unallocated_expense_amount)}
              </div>
            </div>
            <div className="rounded-md border bg-muted/30 p-2">
              <div className="text-xs text-muted-foreground">流水数量</div>
              <div className="mt-1 font-semibold tabular-nums">
                {row.ledger_entry_count} 条
              </div>
            </div>
          </div>
          <p className="text-xs leading-5 text-muted-foreground">
            {reason?.description ||
              "该项目存在未归集成本，实际利润和毛利率可能偏高。"}
          </p>
        </div>
      </PopoverContent>
    </Popover>
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
          <FinanceUnallocatedProjectPopover row={row.original}>
            {content}
          </FinanceUnallocatedProjectPopover>
        );
      },
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
      header: "合同额",
      cell: ({ row }) => formatFinanceMoney(row.original.contract_amount),
      meta: {
        headerClassName: "text-right",
        cellClassName: "whitespace-nowrap text-right tabular-nums",
      },
    },
    {
      accessorKey: "received_amount",
      header: "已收/回款率",
      cell: ({ row }) => (
        <div className="text-right">
          <div className="font-medium tabular-nums">
            {formatFinanceMoney(row.original.received_amount)}
          </div>
          <div className="mt-1 text-xs text-muted-foreground tabular-nums">
            {collectionRate(row.original)}
          </div>
        </div>
      ),
      meta: {
        headerClassName: "text-right",
        cellClassName: "whitespace-nowrap text-right",
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
      header: "实际支出",
      cell: ({ row }) => formatFinanceMoney(row.original.expense_paid_amount),
      meta: {
        headerClassName: "text-right",
        cellClassName: "whitespace-nowrap text-right tabular-nums",
      },
    },
    {
      accessorKey: "budget_cost_amount",
      header: "预算成本",
      cell: ({ row }) => {
        if (!budgetConfigured(row.original)) {
          return (
            <div className="flex justify-end">
              <Badge variant="warning">未配置</Badge>
            </div>
          );
        }
        return (
          <div className="text-right">
            <div className="font-medium tabular-nums">
              {formatFinanceMoney(budgetNumber(row.original, "budget_cost_amount"))}
            </div>
            <div className="mt-1 text-xs text-muted-foreground tabular-nums">
              使用率 {formatFinancePercent(budgetRatio(row.original))}
            </div>
          </div>
        );
      },
      meta: {
        headerClassName: "text-right",
        cellClassName: "whitespace-nowrap text-right",
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
          <div className={`mt-1 text-xs tabular-nums ${moneyTextClass(row.original.profit_variance_amount)}`}>
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
        cellClassName: "whitespace-nowrap",
      },
    },
    {
      id: "action",
      header: "操作",
      cell: ({ row }) => {
        const budgetHref = budgetActionHref(row.original);
        const unallocatedHref = unallocatedActionHref(row.original);
        return (
          <div className="flex justify-end gap-1">
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
          "text-right lg:sticky lg:right-0 lg:z-10 lg:bg-card lg:shadow-[-12px_0_18px_-18px_hsl(var(--foreground)/0.25)]",
        cellClassName:
          "whitespace-nowrap text-right lg:sticky lg:right-0 lg:z-10 lg:bg-card lg:shadow-[-12px_0_18px_-18px_hsl(var(--foreground)/0.25)]",
      },
    },
  ];

  return (
    <DataTable
      columns={columns}
      data={rows}
      emptyText="暂无项目经营数据"
      minWidth="min-w-[1280px]"
      tableClassName="[&_td]:py-2"
      headerClassName="sticky top-0 z-10 bg-card shadow-[inset_0_-1px_0_hsl(var(--border))]"
      rowClassName={rowToneClass}
    />
  );
}
