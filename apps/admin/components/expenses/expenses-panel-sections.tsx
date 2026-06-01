"use client";

import { ChevronLeft, ChevronRight, CircleDollarSign, Clock3, ListFilter, Loader2, RotateCcw, Search, UserRound } from "lucide-react";
import { FormSelect } from "@/components/admin/form-select";
import { ListCardHeader } from "@/components/admin/list-card-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  emptyExpenseFilters,
  formatMoney,
  modeOptions,
  statusOptions,
  stepOptions,
  type ExpenseFiltersState,
  type Pagination,
} from "@/components/expenses/expenses-panel-data";

export function ExpenseSummaryCards({
  total,
  totalAmount,
  pendingCount,
  paymentCount,
}: {
  total: number;
  totalAmount: number;
  pendingCount: number;
  paymentCount: number;
}) {
  return (
    <div className="grid gap-3 md:grid-cols-4">
      <ExpenseSummaryCard
        label="当前筛选费用"
        value={total}
        icon={<ListFilter className="size-5" />}
        tone="primary"
      />
      <ExpenseSummaryCard
        label="本页金额"
        value={`¥${formatMoney(totalAmount)}`}
        icon={<CircleDollarSign className="size-5" />}
        tone="accent"
      />
      <ExpenseSummaryCard
        label="本页审批中"
        value={pendingCount}
        icon={<Clock3 className="size-5" />}
        tone="secondary"
      />
      <ExpenseSummaryCard
        label="本页待打款"
        value={paymentCount}
        icon={<UserRound className="size-5" />}
        tone="primary"
      />
    </div>
  );
}

function ExpenseSummaryCard({
  label,
  value,
  icon,
  tone,
}: {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  tone: "primary" | "secondary" | "accent";
}) {
  const toneClass = tone === "primary"
    ? "bg-primary text-primary-foreground"
    : tone === "accent"
      ? "bg-accent text-accent-foreground"
      : "bg-secondary text-secondary-foreground";

  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div className={`flex size-10 items-center justify-center rounded-md ${toneClass}`}>
          {icon}
        </div>
        <div>
          <div className="text-sm text-muted-foreground">{label}</div>
          <div className="text-xl font-semibold">{value}</div>
        </div>
      </CardContent>
    </Card>
  );
}

export function ExpenseListHeader({
  filters,
  keywordDraft,
  pagination,
  loading,
  onFilterChange,
  onKeywordDraftChange,
  onReset,
}: {
  filters: ExpenseFiltersState;
  keywordDraft: string;
  pagination: Pagination;
  loading: boolean;
  onFilterChange: (patch: Partial<ExpenseFiltersState>) => void;
  onKeywordDraftChange: (value: string) => void;
  onReset: () => void;
}) {
  return (
    <ListCardHeader
      title="费用申请列表"
      description={`筛选条件作用于下方费用申请表格，当前共 ${pagination.total} 条记录。`}
      action={
        <Badge variant="outline">
          {loading ? <Loader2 className="mr-1 inline size-3 animate-spin" /> : null}
          第 {pagination.page || 1} / {Math.max(pagination.totalPages || 0, 1)} 页
        </Badge>
      }
      filters={
        <div className="grid gap-3 xl:grid-cols-[140px_140px_160px_1fr_150px_150px_auto]">
          <FormSelect
            id="expense-status-filter"
            value={filters.status || "__all"}
            options={statusOptions.map(([value, label]) => ({
              value: value || "__all",
              label,
            }))}
            onChange={(value) => onFilterChange({ status: value === "__all" ? "" : value })}
          />
          <FormSelect
            id="expense-mode-filter"
            value={filters.mode || "__all"}
            options={modeOptions.map(([value, label]) => ({
              value: value || "__all",
              label,
            }))}
            onChange={(value) => onFilterChange({ mode: value === "__all" ? "" : value })}
          />
          <FormSelect
            id="expense-current-step-filter"
            value={filters.currentStep || "__all"}
            options={stepOptions.map(([value, label]) => ({
              value: value || "__all",
              label,
            }))}
            onChange={(value) => onFilterChange({ currentStep: value === "__all" ? "" : value })}
          />
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={keywordDraft}
              placeholder="搜索单号或标题"
              className="pl-9"
              onChange={(event) => onKeywordDraftChange(event.target.value)}
            />
          </div>
          <Input
            type="date"
            value={filters.createdFrom}
            aria-label="创建开始日期"
            onChange={(event) => onFilterChange({ createdFrom: event.target.value })}
          />
          <Input
            type="date"
            value={filters.createdTo}
            aria-label="创建结束日期"
            onChange={(event) => onFilterChange({ createdTo: event.target.value })}
          />
          <Button type="button" variant="outline" onClick={onReset}>
            <RotateCcw data-icon="inline-start" />
            重置
          </Button>
        </div>
      }
    />
  );
}

export function ExpensePagination({
  pagination,
  loading,
  onPageChange,
}: {
  pagination: Pagination;
  loading: boolean;
  onPageChange: (updater: (page: number) => number) => void;
}) {
  const canGoPrev = pagination.page > 1 && !loading;
  const canGoNext = pagination.totalPages > 0 && pagination.page < pagination.totalPages && !loading;

  return (
    <div className="flex flex-col gap-3 px-4 pb-4 md:flex-row md:items-center md:justify-between">
      <div className="text-sm text-muted-foreground">
        每页 {pagination.pageSize} 条，共 {pagination.total} 条
      </div>
      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={!canGoPrev}
          onClick={() => onPageChange((value) => Math.max(1, value - 1))}
        >
          <ChevronLeft data-icon="inline-start" />
          上一页
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={!canGoNext}
          onClick={() => onPageChange((value) => value + 1)}
        >
          下一页
          <ChevronRight data-icon="inline-end" />
        </Button>
      </div>
    </div>
  );
}

export function resetExpenseFilterState() {
  return emptyExpenseFilters();
}
