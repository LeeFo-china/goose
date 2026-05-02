"use client";

import { useTransition } from "react";
import {
  EXPENSE_MODE_VALUES,
  EXPENSE_REQUEST_STEP_VALUES,
  EXPENSE_STATUS_VALUES,
  ExpenseModeConfig,
  ExpenseRequestStepConfig,
  ExpenseStatusConfig,
} from "@gooes/domain";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Pagination = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

const statusOptions = [
  ["", "全部状态"],
  ...EXPENSE_STATUS_VALUES.map((value) => [
    value,
    ExpenseStatusConfig[value].label,
  ] as const),
] as const;

const modeOptions = [
  ["", "全部模式"],
  ...EXPENSE_MODE_VALUES.map((value) => [
    value,
    ExpenseModeConfig[value].label,
  ] as const),
] as const;

const stepOptions = [
  ["", "全部节点"],
  ...EXPENSE_REQUEST_STEP_VALUES.map((value) => [
    value,
    ExpenseRequestStepConfig[value].label,
  ] as const),
] as const;

function buildExpensesHref(input: {
  page?: number;
  status?: string;
  mode?: string;
  currentStep?: string;
  keyword?: string;
}) {
  const params = new URLSearchParams();
  if (input.page && input.page > 1) params.set("page", String(input.page));
  if (input.status) params.set("status", input.status);
  if (input.mode) params.set("mode", input.mode);
  if (input.currentStep) params.set("current_step", input.currentStep);
  if (input.keyword) params.set("keyword", input.keyword);
  const query = params.toString();
  return query ? `/expenses?${query}` : "/expenses";
}

function useExpensesNavigation() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function navigate(href: string) {
    startTransition(() => {
      router.push(href);
      router.refresh();
    });
  }

  return { pending, navigate };
}

export function ExpenseFilters({
  status,
  mode,
  currentStep,
  keyword,
}: {
  status: string;
  mode: string;
  currentStep: string;
  keyword: string;
}) {
  return (
    <form
      action="/expenses"
      method="get"
      className="grid gap-3 xl:grid-cols-[140px_140px_160px_1fr_72px]"
    >
      <select
        name="status"
        defaultValue={status}
        className="h-10 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
      >
        {statusOptions.map(([value, label]) => (
          <option key={value || "all"} value={value}>{label}</option>
        ))}
      </select>
      <select
        name="mode"
        defaultValue={mode}
        className="h-10 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
      >
        {modeOptions.map(([value, label]) => (
          <option key={value || "all"} value={value}>{label}</option>
        ))}
      </select>
      <select
        name="current_step"
        defaultValue={currentStep}
        className="h-10 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
      >
        {stepOptions.map(([value, label]) => (
          <option key={value || "all"} value={value}>{label}</option>
        ))}
      </select>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          name="keyword"
          defaultValue={keyword}
          placeholder="搜索单号或标题"
          className="pl-9"
        />
      </div>
      <Button type="submit" variant="outline">
        搜索
      </Button>
    </form>
  );
}

export function ExpensesPagination({
  pagination,
  status,
  mode,
  currentStep,
  keyword,
}: {
  pagination: Pagination;
  status: string;
  mode: string;
  currentStep: string;
  keyword: string;
}) {
  const { pending, navigate } = useExpensesNavigation();
  const previousDisabled = pagination.page <= 1 || pending;
  const nextDisabled = pagination.page >= pagination.totalPages || pending;

  return (
    <div className="flex gap-2">
      <Button
        type="button"
        variant="outline"
        disabled={previousDisabled}
        onClick={() => navigate(buildExpensesHref({
          page: Math.max(1, pagination.page - 1),
          status,
          mode,
          currentStep,
          keyword,
        }))}
      >
        {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <ChevronLeft data-icon="inline-start" />}
        上一页
      </Button>
      <Button
        type="button"
        variant="outline"
        disabled={nextDisabled}
        onClick={() => navigate(buildExpensesHref({
          page: pagination.page + 1,
          status,
          mode,
          currentStep,
          keyword,
        }))}
      >
        下一页
        {pending ? <Loader2 className="animate-spin" data-icon="inline-end" /> : <ChevronRight data-icon="inline-end" />}
      </Button>
    </div>
  );
}
