"use client";

import { useMemo, useState, useTransition } from "react";
import { Loader2, Save } from "lucide-react";
import { StatusAlert } from "@/components/admin/status-alert";
import { FormSelect } from "@/components/admin/form-select";
import type { FinanceCostCategoryRecord } from "@/components/finance/finance-cost-budget-requests";
import type { FinanceLedgerRecord } from "@/components/finance/finance-requests";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { requestBackendJson } from "@/lib/backend-client";

const NO_CATEGORY_VALUE = "__none";

export function FinanceLedgerAllocationDialog({
  ledger,
  categories,
  onClose,
  onSaved,
}: {
  ledger: FinanceLedgerRecord;
  categories: FinanceCostCategoryRecord[];
  onClose: () => void;
  onSaved: (ledger: FinanceLedgerRecord) => void;
}) {
  const [categoryId, setCategoryId] = useState(
    ledger.cost_category_id || NO_CATEGORY_VALUE,
  );
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const options = useMemo(() => [
    { value: NO_CATEGORY_VALUE, label: "待归集" },
    ...categories.map((category) => ({
      value: category.id,
      label: category.name || category.code,
    })),
  ], [categories]);

  function save() {
    setError("");
    startTransition(async () => {
      try {
        const updated = await requestBackendJson<FinanceLedgerRecord>(
          `/finance/ledger/${ledger.id}/cost-category`,
          {
            method: "PATCH",
            body: JSON.stringify({
              cost_category_id: categoryId === NO_CATEGORY_VALUE
                ? null
                : categoryId,
            }),
            fallbackMessage: "成本归集保存失败",
          },
        );
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
          <DialogTitle>调整成本归集</DialogTitle>
          <DialogDescription>
            将这条支出流水归集到项目成本分类，保存后会影响预算使用率和利润偏差。
          </DialogDescription>
        </DialogHeader>

        {error ? <StatusAlert>{error}</StatusAlert> : null}

        <div className="grid gap-2">
          <label
            className="text-xs font-medium text-muted-foreground"
            htmlFor="ledger-cost-category"
          >
            成本分类
          </label>
          <FormSelect
            id="ledger-cost-category"
            value={categoryId}
            options={options}
            disabled={pending}
            onChange={setCategoryId}
          />
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" disabled={pending} onClick={onClose}>
            取消
          </Button>
          <Button type="button" disabled={pending} onClick={save}>
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
