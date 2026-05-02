"use client";

import { useEffect, useState, useTransition } from "react";
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
import { FormSelect } from "@/components/admin/form-select";
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
  const [selectedStatus, setSelectedStatus] = useState(status);
  const [selectedMode, setSelectedMode] = useState(mode);
  const [selectedStep, setSelectedStep] = useState(currentStep);

  useEffect(() => {
    setSelectedStatus(status);
    setSelectedMode(mode);
    setSelectedStep(currentStep);
  }, [currentStep, mode, status]);

  return (
    <form
      action="/expenses"
      method="get"
      className="grid gap-3 xl:grid-cols-[140px_140px_160px_1fr_72px]"
    >
      <input type="hidden" name="status" value={selectedStatus} />
      <input type="hidden" name="mode" value={selectedMode} />
      <input type="hidden" name="current_step" value={selectedStep} />
      <FormSelect
        id="expense-status-filter"
        value={selectedStatus || "__all"}
        options={statusOptions.map(([value, label]) => ({
          value: value || "__all",
          label,
        }))}
        onChange={(value) => setSelectedStatus(value === "__all" ? "" : value)}
      />
      <FormSelect
        id="expense-mode-filter"
        value={selectedMode || "__all"}
        options={modeOptions.map(([value, label]) => ({
          value: value || "__all",
          label,
        }))}
        onChange={(value) => setSelectedMode(value === "__all" ? "" : value)}
      />
      <FormSelect
        id="expense-current-step-filter"
        value={selectedStep || "__all"}
        options={stepOptions.map(([value, label]) => ({
          value: value || "__all",
          label,
        }))}
        onChange={(value) => setSelectedStep(value === "__all" ? "" : value)}
      />
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
