"use client";

import Link from "next/link";
import { useState } from "react";
import { Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  FinanceFilterSelectField,
  type FinanceFilterOption,
} from "@/components/finance/finance-filter-controls";

type FinanceProjectSummaryFilterFormProps = {
  keyword?: string;
  status?: string;
  riskLevel?: string;
  riskFlag?: string;
  budgetConfigured?: string;
  hasUnallocatedExpense?: string;
  overdue?: string;
  advancedFilterCount: number;
  projectStatusOptions: readonly FinanceFilterOption[];
  riskLevelOptions: readonly FinanceFilterOption[];
  riskFlagOptions: readonly FinanceFilterOption[];
  booleanFilterOptions: readonly FinanceFilterOption[];
};

export function FinanceProjectSummaryFilterForm({
  keyword,
  status,
  riskLevel,
  riskFlag,
  budgetConfigured,
  hasUnallocatedExpense,
  overdue,
  advancedFilterCount,
  projectStatusOptions,
  riskLevelOptions,
  riskFlagOptions,
  booleanFilterOptions,
}: FinanceProjectSummaryFilterFormProps) {
  const [advancedOpen, setAdvancedOpen] = useState(advancedFilterCount > 0);

  return (
    <form
      action="/finance"
      className="shrink-0 space-y-1.5 border-b bg-card p-2.5"
    >
      <div className="flex flex-wrap items-center gap-1">
        <div className="order-1 grid min-w-0 flex-1 gap-0">
          <label className="sr-only" htmlFor="finance-keyword">
            项目搜索
          </label>
          <div className="relative">
            <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="finance-keyword"
              name="keyword"
              defaultValue={keyword || ""}
              placeholder="搜索项目名称 / 客户 / 小区"
              className="h-11 pl-9 md:h-9"
            />
          </div>
        </div>
        <div className="order-2 w-[104px] shrink-0">
          <FinanceFilterSelectField
            id="finance-status"
            name="status"
            label="状态"
            value={status}
            options={projectStatusOptions}
            compact
          />
        </div>
        <div className="order-3 w-[104px] shrink-0">
          <FinanceFilterSelectField
            id="finance-risk-level"
            name="risk_level"
            label="风险"
            value={riskLevel}
            options={riskLevelOptions}
            compact
          />
        </div>
        <button
          type="button"
          className="order-4 flex h-11 shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-md border px-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:h-9 md:px-1.5"
          aria-expanded={advancedOpen}
          aria-controls="finance-advanced-filters"
          onClick={() => setAdvancedOpen((current) => !current)}
        >
          <span>更多筛选</span>
          {advancedFilterCount > 0 ? (
            <Badge variant="secondary" className="px-1.5 py-0 text-[11px]">
              已选 {advancedFilterCount}
            </Badge>
          ) : null}
        </button>
        <div className="order-5 flex shrink-0 flex-nowrap items-center gap-1">
          <Button type="submit" size="sm" className="h-11 md:h-9">筛选</Button>
          <Button asChild type="button" variant="ghost" size="sm" className="h-11 px-2 md:h-9 md:px-1.5">
            <Link href="/finance">重置</Link>
          </Button>
        </div>
        {advancedOpen ? (
          <div
            id="finance-advanced-filters"
            className="order-6 mt-2 grid basis-full gap-3 md:grid-cols-2 xl:grid-cols-4"
          >
            <FinanceFilterSelectField
              id="finance-risk-flag"
              name="risk_flag"
              label="原因"
              value={riskFlag}
              options={riskFlagOptions}
            />
            <FinanceFilterSelectField
              id="finance-budget-configured"
              name="budget_configured"
              label="已配预算"
              value={budgetConfigured}
              options={booleanFilterOptions}
            />
            <FinanceFilterSelectField
              id="finance-has-unallocated-expense"
              name="has_unallocated_expense"
              label="未归集"
              value={hasUnallocatedExpense}
              options={booleanFilterOptions}
            />
            <FinanceFilterSelectField
              id="finance-overdue"
              name="overdue"
              label="逾期"
              value={overdue}
              options={booleanFilterOptions}
            />
          </div>
        ) : null}
      </div>
    </form>
  );
}
