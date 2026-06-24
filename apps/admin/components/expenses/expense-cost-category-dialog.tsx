"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Loader2, Save } from "lucide-react";
import { StatusAlert } from "@/components/admin/status-alert";
import { FormSelect } from "@/components/admin/form-select";
import type {
  FinanceCostCategoryListData,
  FinanceCostCategoryRecord,
} from "@/components/finance/finance-cost-budget-requests";
import type { ExpenseRecord } from "@/components/expenses/expense-mutation-types";
import { requestExpense } from "@/components/expenses/expense-mutation-shared";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const NO_CATEGORY_VALUE = "__none";

export function ExpenseCostCategoryDialog({
  expense,
  onClose,
  onSaved,
}: {
  expense: ExpenseRecord;
  onClose: () => void;
  onSaved: (expense: ExpenseRecord) => void;
}) {
  const [categories, setCategories] = useState<FinanceCostCategoryRecord[]>([]);
  const [categoryId, setCategoryId] = useState(
    expense.cost_category_id || NO_CATEGORY_VALUE,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const options = useMemo(() => [
    { value: NO_CATEGORY_VALUE, label: "待归集" },
    ...categories.map((category) => ({
      value: category.id,
      label: category.name || category.code,
    })),
  ], [categories]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    requestExpense<FinanceCostCategoryListData>({
      path: "/finance/cost-categories?page=1&pageSize=100&status=active",
    })
      .then((payload) => {
        if (!active) return;
        setCategories(payload.list || []);
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : "成本分类加载失败");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  function save() {
    if (!expense.project_id) {
      setError("选择成本分类前请先关联项目。");
      return;
    }

    setError("");
    startTransition(async () => {
      try {
        const updated = await requestExpense<ExpenseRecord>({
          path: `/expense-requests/${expense.id}`,
          method: "PATCH",
          payload: {
            project_id: expense.project_id,
            cost_category_id: categoryId === NO_CATEGORY_VALUE
              ? null
              : categoryId,
          },
        });
        onSaved(updated);
      } catch (err) {
        setError(err instanceof Error ? err.message : "成本归集保存失败");
      }
    });
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>费用成本归集</DialogTitle>
          <DialogDescription>
            为项目费用选择成本分类，付款入账后会带入项目预算和利润偏差统计。
          </DialogDescription>
        </DialogHeader>

        {error ? <StatusAlert>{error}</StatusAlert> : null}

        <div className="grid gap-2">
          <label
            className="text-xs font-medium text-muted-foreground"
            htmlFor="expense-cost-category"
          >
            成本分类
          </label>
          <FormSelect
            id="expense-cost-category"
            value={categoryId}
            options={options}
            disabled={loading || pending}
            onChange={setCategoryId}
          />
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" disabled={pending} onClick={onClose}>
            取消
          </Button>
          <Button type="button" disabled={loading || pending} onClick={save}>
            {pending ? (
              <Loader2 className="animate-spin" data-icon="inline-start" />
            ) : (
              <Save data-icon="inline-start" />
            )}
            保存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
