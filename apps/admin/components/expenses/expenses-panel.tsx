"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  EXPENSE_MODE_VALUES,
  EXPENSE_REQUEST_STEP_VALUES,
  EXPENSE_STATUS_VALUES,
  ExpenseModeConfig,
  ExpenseRequestStepConfig,
  ExpenseStatusConfig,
} from "@gooes/domain";
import { ChevronLeft, ChevronRight, CircleDollarSign, Clock3, ListFilter, Loader2, RotateCcw, Search, UserRound } from "lucide-react";
import { FormSelect } from "@/components/admin/form-select";
import { ListCardHeader } from "@/components/admin/list-card-header";
import { StatusAlert } from "@/components/admin/status-alert";
import { type ExpenseRecord } from "@/components/expenses/expense-mutations";
import { ExpensesTable } from "@/components/expenses/expenses-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type Pagination = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

type ExpenseListData = {
  list: ExpenseRecord[];
  pagination: Pagination;
};

type InitialExpenseData = ExpenseListData & {
  error: string | null;
};

type ExpenseFiltersState = {
  status: string;
  mode: string;
  currentStep: string;
  keyword: string;
  createdFrom: string;
  createdTo: string;
};

const EXPENSE_PAGE_SIZE = 20;

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

function getPayloadMessage(payload: unknown, fallback: string) {
  if (payload && typeof payload === "object" && "message" in payload) {
    const message = (payload as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return fallback;
}

function formatMoney(value: number | string | null | undefined) {
  const amount = Number(value || 0);
  return amount.toLocaleString("zh-CN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function dateStartToIso(value: string) {
  return value ? new Date(`${value}T00:00:00`).toISOString() : "";
}

function dateEndToIso(value: string) {
  return value ? new Date(`${value}T23:59:59.999`).toISOString() : "";
}

function toDateInputValue(value: string) {
  if (!value) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}

async function fetchExpenses(filters: ExpenseFiltersState, page: number) {
  const query = new URLSearchParams({
    page: String(page),
    pageSize: String(EXPENSE_PAGE_SIZE),
  });

  if (filters.status) query.set("status", filters.status);
  if (filters.mode) query.set("mode", filters.mode);
  if (filters.currentStep) query.set("current_step", filters.currentStep);
  if (filters.keyword.trim()) query.set("keyword", filters.keyword.trim());
  if (filters.createdFrom) query.set("created_from", dateStartToIso(filters.createdFrom));
  if (filters.createdTo) query.set("created_to", dateEndToIso(filters.createdTo));

  const response = await fetch(`/api/backend/expense-requests?${query.toString()}`, {
    cache: "no-store",
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.success === false) {
    throw new Error(getPayloadMessage(payload, "费用申请列表加载失败"));
  }

  return payload.data as ExpenseListData;
}

export function ExpensesPanel({
  initialData,
  initialFilters,
  currentEmployeeId,
}: {
  initialData: InitialExpenseData;
  initialFilters: ExpenseFiltersState;
  currentEmployeeId: string | null;
}) {
  const normalizedInitialFilters = {
    ...initialFilters,
    createdFrom: toDateInputValue(initialFilters.createdFrom),
    createdTo: toDateInputValue(initialFilters.createdTo),
  };
  const [filters, setFilters] = useState(normalizedInitialFilters);
  const [keywordDraft, setKeywordDraft] = useState(normalizedInitialFilters.keyword);
  const [page, setPage] = useState(initialData.pagination.page || 1);
  const [expenses, setExpenses] = useState(initialData.list);
  const [pagination, setPagination] = useState(initialData.pagination);
  const [error, setError] = useState(initialData.error || "");
  const [loading, setLoading] = useState(false);
  const firstLoadRef = useRef(true);
  const requestSeqRef = useRef(0);

  const loadExpenses = useCallback(async (options: { silent?: boolean } = {}) => {
    const requestSeq = requestSeqRef.current + 1;
    requestSeqRef.current = requestSeq;
    if (!options.silent) {
      setLoading(true);
    }
    setError("");

    try {
      const data = await fetchExpenses(filters, page);
      if (requestSeqRef.current !== requestSeq) return;
      setExpenses(data?.list || []);
      setPagination(data?.pagination || {
        page,
        pageSize: EXPENSE_PAGE_SIZE,
        total: 0,
        totalPages: 0,
      });
    } catch (err) {
      if (requestSeqRef.current !== requestSeq) return;
      setError(err instanceof Error ? err.message : "费用申请列表加载失败");
    } finally {
      if (requestSeqRef.current === requestSeq) {
        setLoading(false);
      }
    }
  }, [filters, page]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const keyword = keywordDraft.trim();
      setFilters((current) => {
        if (current.keyword === keyword) return current;
        setPage(1);
        return { ...current, keyword };
      });
    }, 300);

    return () => window.clearTimeout(timer);
  }, [keywordDraft]);

  useEffect(() => {
    if (firstLoadRef.current) {
      firstLoadRef.current = false;
      return;
    }

    void loadExpenses();
  }, [loadExpenses]);

  const updateFilter = (patch: Partial<ExpenseFiltersState>) => {
    setFilters((current) => ({ ...current, ...patch }));
    setPage(1);
  };
  const canGoPrev = pagination.page > 1 && !loading;
  const canGoNext = pagination.totalPages > 0 && pagination.page < pagination.totalPages && !loading;
  const pendingCount = expenses.filter((item) => item.status === "pending").length;
  const paymentCount = expenses.filter((item) =>
    item.status === "approved" && item.current_step === "payment"
  ).length;
  const totalAmount = expenses.reduce((sum, item) => sum + Number(item.total_amount || 0), 0);

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-3 md:grid-cols-4">
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex size-10 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <ListFilter className="size-5" />
            </div>
            <div>
              <div className="text-sm text-muted-foreground">当前筛选费用</div>
              <div className="text-xl font-semibold">{pagination.total}</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex size-10 items-center justify-center rounded-md bg-accent text-accent-foreground">
              <CircleDollarSign className="size-5" />
            </div>
            <div>
              <div className="text-sm text-muted-foreground">本页金额</div>
              <div className="text-xl font-semibold">¥{formatMoney(totalAmount)}</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex size-10 items-center justify-center rounded-md bg-secondary text-secondary-foreground">
              <Clock3 className="size-5" />
            </div>
            <div>
              <div className="text-sm text-muted-foreground">本页审批中</div>
              <div className="text-xl font-semibold">{pendingCount}</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex size-10 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <UserRound className="size-5" />
            </div>
            <div>
              <div className="text-sm text-muted-foreground">本页待打款</div>
              <div className="text-xl font-semibold">{paymentCount}</div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="overflow-hidden">
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
                onChange={(value) => updateFilter({ status: value === "__all" ? "" : value })}
              />
              <FormSelect
                id="expense-mode-filter"
                value={filters.mode || "__all"}
                options={modeOptions.map(([value, label]) => ({
                  value: value || "__all",
                  label,
                }))}
                onChange={(value) => updateFilter({ mode: value === "__all" ? "" : value })}
              />
              <FormSelect
                id="expense-current-step-filter"
                value={filters.currentStep || "__all"}
                options={stepOptions.map(([value, label]) => ({
                  value: value || "__all",
                  label,
                }))}
                onChange={(value) => updateFilter({ currentStep: value === "__all" ? "" : value })}
              />
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={keywordDraft}
                  placeholder="搜索单号或标题"
                  className="pl-9"
                  onChange={(event) => setKeywordDraft(event.target.value)}
                />
              </div>
              <Input
                type="date"
                value={filters.createdFrom}
                aria-label="创建开始日期"
                onChange={(event) => updateFilter({ createdFrom: event.target.value })}
              />
              <Input
                type="date"
                value={filters.createdTo}
                aria-label="创建结束日期"
                onChange={(event) => updateFilter({ createdTo: event.target.value })}
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  const emptyFilters = {
                    status: "",
                    mode: "",
                    currentStep: "",
                    keyword: "",
                    createdFrom: "",
                    createdTo: "",
                  };
                  setKeywordDraft("");
                  setFilters(emptyFilters);
                  setPage(1);
                }}
              >
                <RotateCcw data-icon="inline-start" />
                重置
              </Button>
            </div>
          }
        />
        <CardContent className="relative flex flex-col gap-4 p-0">
          {loading ? (
            <div className="absolute inset-0 z-10 grid place-items-center bg-background/70 backdrop-blur-[1px]">
              <div className="flex items-center rounded-md border bg-background px-3 py-2 text-sm text-muted-foreground">
                <Loader2 className="mr-2 size-4 animate-spin" />
                正在更新费用申请列表
              </div>
            </div>
          ) : null}
          {error ? (
            <div className="p-4">
              <StatusAlert>{error}</StatusAlert>
            </div>
          ) : (
            <ExpensesTable
              expenses={expenses}
              currentEmployeeId={currentEmployeeId}
              onExpenseUpdated={() => {
                void loadExpenses({ silent: true });
              }}
            />
          )}
          <div className="flex flex-col gap-3 px-4 pb-4 md:flex-row md:items-center md:justify-between">
            <div className="text-sm text-muted-foreground">
              每页 {pagination.pageSize} 条，共 {pagination.total} 条
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={!canGoPrev}
                onClick={() => setPage((value) => Math.max(1, value - 1))}
              >
                <ChevronLeft data-icon="inline-start" />
                上一页
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={!canGoNext}
                onClick={() => setPage((value) => value + 1)}
              >
                下一页
                <ChevronRight data-icon="inline-end" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
