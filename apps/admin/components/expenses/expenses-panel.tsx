"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { StatusAlert } from "@/components/admin/status-alert";
import { ExpensesTable } from "@/components/expenses/expenses-table";
import { Card, CardContent } from "@/components/ui/card";
import {
  EXPENSE_PAGE_SIZE,
  emptyExpenseFilters,
  fetchExpenses,
  summarizeExpensePage,
  toDateInputValue,
  type ExpenseFiltersState,
  type InitialExpenseData,
} from "@/components/expenses/expenses-panel-data";
import {
  ExpenseListHeader,
  ExpensePagination,
} from "@/components/expenses/expenses-panel-sections";

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
  const summary = summarizeExpensePage(expenses);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Card className="flex min-h-0 flex-1 flex-col overflow-hidden shadow-none">
        <ExpenseListHeader
          filters={filters}
          keywordDraft={keywordDraft}
          pagination={pagination}
          totalAmount={summary.totalAmount}
          pendingCount={summary.pendingCount}
          paymentCount={summary.paymentCount}
          loading={loading}
          onFilterChange={updateFilter}
          onKeywordDraftChange={setKeywordDraft}
          onReset={() => {
            setKeywordDraft("");
            setFilters(emptyExpenseFilters());
            setPage(1);
          }}
        />
        <CardContent className="relative flex min-h-0 flex-1 flex-col p-0">
          {loading ? (
            <div className="absolute inset-0 z-10 grid place-items-center bg-background/70 backdrop-blur-[1px]">
              <div className="flex items-center rounded-md border bg-background px-3 py-2 text-sm text-muted-foreground">
                <Loader2 className="mr-2 size-4 animate-spin" />
                正在更新费用申请列表
              </div>
            </div>
          ) : null}
          {error ? (
            <div className="shrink-0 p-4">
              <StatusAlert>{error}</StatusAlert>
            </div>
          ) : null}
          <div className="min-h-0 flex-1 overflow-auto">
            <ExpensesTable
              expenses={expenses}
              currentEmployeeId={currentEmployeeId}
              onExpenseUpdated={() => {
                void loadExpenses({ silent: true });
              }}
            />
          </div>
          <ExpensePagination
            pagination={pagination}
            visibleCount={expenses.length}
            loading={loading}
            onPageChange={setPage}
          />
        </CardContent>
      </Card>
    </div>
  );
}
