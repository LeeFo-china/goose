"use client";

import { useEffect, useMemo, useState } from "react";
import { Calculator, Loader2, Pencil, Save, X } from "lucide-react";
import { StatusAlert } from "@/components/admin/status-alert";
import type {
  FinanceCostCategoryListData,
  FinanceCostCategoryRecord,
  ProjectCostBudgetListData,
} from "@/components/finance/finance-cost-budget-requests";
import {
  formatFinanceMoney,
  formatFinancePercent,
} from "@/components/finance/finance-ledger-utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { requestProject } from "@/components/projects/project-mutation-utils";
import {
  buildEditableRows,
  buildSaveBudgetItems,
  calculateBudgetAvailability,
  categoryName,
  type EditableBudgetRow,
  emptyBudgetData,
  formatBudgetAvailability,
  isNegativeBudgetAvailability,
  normalizeBudgetData,
  parseOptionalMoney,
  riskLabel,
  riskVariant,
  validateEditRows,
} from "@/components/projects/project-cost-budget-panel-utils";

export function ProjectCostBudgetPanel({ projectId }: { projectId: string }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState<ProjectCostBudgetListData>(emptyBudgetData);
  const [categories, setCategories] = useState<FinanceCostCategoryRecord[]>([]);
  const [editRows, setEditRows] = useState<EditableBudgetRow[]>([]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    setSaved(false);

    Promise.all([
      requestProject<ProjectCostBudgetListData>({
        path: `/projects/${projectId}/cost-budgets`,
        signal: controller.signal,
      }),
      requestProject<FinanceCostCategoryListData>({
        path: "/finance/cost-categories?page=1&pageSize=100&status=active",
        signal: controller.signal,
      }),
    ])
      .then(([budgetPayload, categoryPayload]) => {
        const nextData = normalizeBudgetData(budgetPayload);
        const nextCategories = categoryPayload.list || [];
        setData(nextData);
        setCategories(nextCategories);
        setEditRows(buildEditableRows(nextData.list, nextCategories));
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : "成本预算加载失败");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [projectId]);

  const summary = data.summary || emptyBudgetData.summary;
  const displayRows = data.list || [];
  const hasEditableRows = editRows.length > 0;
  const projectedRows = useMemo(() => (
    editRows.map((row) => {
      const budgetAmount = parseOptionalMoney(row.budget_amount);
      return {
        ...row,
        budgetAmount,
        availableAmount: calculateBudgetAvailability({
          budgetAmount,
          expenseAmount: row.expense_amount,
          commitmentAmount: row.commitment_amount,
        }),
      };
    })
  ), [editRows]);

  function beginEdit() {
    setSaved(false);
    setError("");
    setEditRows(buildEditableRows(displayRows, categories));
    setEditing(true);
  }

  function updateRow(
    categoryId: string,
    field: keyof Pick<
      EditableBudgetRow,
      "budget_amount" | "warning_threshold_percent" | "remark"
    >,
    value: string,
  ) {
    setEditRows((rows) => rows.map((row) => (
      row.cost_category_id === categoryId ? { ...row, [field]: value } : row
    )));
  }

  async function saveBudgets() {
    setError("");
    setSaved(false);
    const validationError = validateEditRows(editRows);
    if (validationError) {
      setError(validationError);
      return;
    }

    const items = buildSaveBudgetItems(editRows);

    if (items.length === 0) {
      setError("请至少填写一个预算金额。");
      return;
    }

    setSaving(true);
    try {
      const payload = await requestProject<ProjectCostBudgetListData>({
        path: `/projects/${projectId}/cost-budgets`,
        method: "PUT",
        payload: { items },
      });
      const nextData = normalizeBudgetData(payload);
      setData(nextData);
      setEditRows(buildEditableRows(nextData.list, categories));
      setEditing(false);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "成本预算保存失败");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-lg border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <Calculator className="size-4 text-muted-foreground" />
          <h3 className="text-base font-semibold">成本预算</h3>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={riskVariant(summary.risk_level)}>
            {riskLabel(summary.risk_level)}
          </Badge>
          {editing ? (
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={saving}
                onClick={() => {
                  setEditing(false);
                  setEditRows(buildEditableRows(displayRows, categories));
                }}
              >
                <X data-icon="inline-start" />
                取消
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={saving || loading || !hasEditableRows}
                onClick={saveBudgets}
              >
                {saving ? (
                  <Loader2 className="animate-spin" data-icon="inline-start" />
                ) : (
                  <Save data-icon="inline-start" />
                )}
                保存
              </Button>
            </>
          ) : (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={loading}
              onClick={beginEdit}
            >
              <Pencil data-icon="inline-start" />
              配置预算
            </Button>
          )}
        </div>
      </div>

      {error ? (
        <div className="mt-3">
          <StatusAlert>{error}</StatusAlert>
        </div>
      ) : null}
      {saved ? (
        <div className="mt-3">
          <StatusAlert tone="success">成本预算已保存。</StatusAlert>
        </div>
      ) : null}

      <dl className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric
          label="预算成本"
          value={loading ? "加载中..." : formatFinanceMoney(summary.budget_amount)}
        />
        <Metric
          label="已归集支出"
          value={loading ? "加载中..." : formatFinanceMoney(summary.expense_amount)}
        />
        <Metric
          label="已承诺"
          value={loading
            ? "加载中..."
            : formatFinanceMoney(summary.commitment_amount)}
        />
        <Metric
          label="可用预算"
          value={loading
            ? "加载中..."
            : formatFinanceMoney(summary.available_amount)}
          danger={isNegativeBudgetAvailability(summary.available_amount)}
          title={formatBudgetAvailability(summary)}
        />
        <Metric
          label="预算剩余"
          value={loading ? "加载中..." : formatFinanceMoney(summary.remaining_amount)}
        />
        <Metric
          label="预算使用率"
          value={loading ? "加载中..." : formatFinancePercent(summary.usage_ratio)}
        />
        <Metric
          label="未归类支出"
          value={loading
            ? "加载中..."
            : formatFinanceMoney(summary.unallocated_expense_amount)}
        />
      </dl>

      <div className="mt-4 overflow-x-auto rounded-md border">
        {editing ? (
          <div className="min-w-[1060px]">
            <div className="grid grid-cols-[minmax(0,1fr)_7.5rem_6.5rem_7.5rem_7.5rem_7.5rem_minmax(11rem,1fr)] gap-3 border-b bg-muted/60 px-3 py-2 text-xs font-medium text-muted-foreground">
              <span>成本分类</span>
              <span className="text-right">预算金额</span>
              <span className="text-right">预警阈值</span>
              <span className="text-right">已支出</span>
              <span className="text-right">已承诺</span>
              <span className="text-right">可用预算</span>
              <span>备注</span>
            </div>
            {loading ? (
              <div className="px-3 py-5 text-sm text-muted-foreground">
                正在加载成本预算...
              </div>
            ) : projectedRows.length ? (
              projectedRows.map((row) => (
                <div
                  key={row.cost_category_id}
                  className="grid grid-cols-[minmax(0,1fr)_7.5rem_6.5rem_7.5rem_7.5rem_7.5rem_minmax(11rem,1fr)] gap-3 border-b px-3 py-2 text-sm last:border-b-0"
                >
                  <CategoryCell row={row} />
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    inputMode="decimal"
                    value={row.budget_amount}
                    onChange={(event) =>
                      updateRow(
                        row.cost_category_id,
                        "budget_amount",
                        event.target.value,
                      )}
                    className="h-8 text-right tabular-nums"
                    aria-label={`${categoryName(row)}预算金额`}
                  />
                  <Input
                    type="number"
                    min="0.01"
                    step="1"
                    inputMode="decimal"
                    value={row.warning_threshold_percent}
                    onChange={(event) =>
                      updateRow(
                        row.cost_category_id,
                        "warning_threshold_percent",
                        event.target.value,
                      )}
                    className="h-8 text-right tabular-nums"
                    aria-label={`${categoryName(row)}预警阈值`}
                  />
                  <span className="text-right text-muted-foreground tabular-nums">
                    {formatFinanceMoney(row.expense_amount)}
                  </span>
                  <span className="text-right text-muted-foreground tabular-nums">
                    {formatFinanceMoney(row.commitment_amount)}
                  </span>
                  <span
                    className={`text-right font-medium tabular-nums ${
                      isNegativeBudgetAvailability(row.availableAmount)
                        ? "text-destructive"
                        : "text-foreground"
                    }`}
                    title={formatBudgetAvailability({
                      budget_amount: row.budgetAmount,
                      expense_amount: row.expense_amount,
                      commitment_amount: row.commitment_amount,
                      available_amount: row.availableAmount,
                    })}
                  >
                    {formatFinanceMoney(row.availableAmount)}
                  </span>
                  <Textarea
                    value={row.remark}
                    maxLength={200}
                    onChange={(event) =>
                      updateRow(row.cost_category_id, "remark", event.target.value)}
                    className="min-h-8 resize-none py-1.5"
                    aria-label={`${categoryName(row)}预算备注`}
                  />
                </div>
              ))
            ) : (
              <div className="px-3 py-5 text-sm text-muted-foreground">
                暂无可配置的成本分类。
              </div>
            )}
          </div>
        ) : (
          <div className="min-w-[1040px]">
            <div className="grid grid-cols-[minmax(0,1fr)_7.5rem_7.5rem_7.5rem_7.5rem_6.5rem_6.5rem_minmax(8rem,1fr)] gap-3 border-b bg-muted/60 px-3 py-2 text-xs font-medium text-muted-foreground">
              <span>成本分类</span>
              <span className="text-right">预算</span>
              <span className="text-right">已支出</span>
              <span className="text-right">已承诺</span>
              <span className="text-right">可用预算</span>
              <span className="text-right">使用率</span>
              <span>风险</span>
              <span>备注</span>
            </div>
            {loading ? (
              <div className="px-3 py-5 text-sm text-muted-foreground">
                正在加载成本预算...
              </div>
            ) : displayRows.length ? (
              displayRows.map((row) => (
                <div
                  key={row.id}
                  className="grid grid-cols-[minmax(0,1fr)_7.5rem_7.5rem_7.5rem_7.5rem_6.5rem_6.5rem_minmax(8rem,1fr)] gap-3 border-b px-3 py-2 text-sm last:border-b-0"
                >
                  <CategoryCell row={row} />
                  <span className="text-right tabular-nums">
                    {formatFinanceMoney(row.budget_amount)}
                  </span>
                  <span className="text-right tabular-nums">
                    {formatFinanceMoney(row.expense_amount)}
                  </span>
                  <span className="text-right text-muted-foreground tabular-nums">
                    {formatFinanceMoney(row.commitment_amount)}
                  </span>
                  <span
                    className={`text-right font-medium tabular-nums ${
                      isNegativeBudgetAvailability(row.available_amount)
                        ? "text-destructive"
                        : "text-foreground"
                    }`}
                    title={formatBudgetAvailability(row)}
                  >
                    {formatFinanceMoney(row.available_amount)}
                  </span>
                  <span className="text-right text-muted-foreground tabular-nums">
                    {formatFinancePercent(row.usage_ratio)}
                  </span>
                  <span className="min-w-0">
                    <Badge variant={riskVariant(row.risk_level)}>
                      {riskLabel(row.risk_level)}
                    </Badge>
                    {row.risk_reasons?.[0]?.title ? (
                      <div className="mt-1 truncate text-xs text-muted-foreground">
                        {row.risk_reasons[0].title}
                      </div>
                    ) : null}
                  </span>
                  <span className="truncate text-muted-foreground">
                    {row.remark || "-"}
                  </span>
                </div>
              ))
            ) : (
              <div className="px-3 py-5 text-sm text-muted-foreground">
                暂无成本预算。点击“配置预算”后按成本分类录入预算金额。
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

function CategoryCell({
  row,
}: {
  row: {
    category_name: string | null;
    category_code: string | null;
  };
}) {
  return (
    <div className="min-w-0">
      <div className="truncate font-medium">{categoryName(row)}</div>
      {row.category_code ? (
        <div className="mt-1 truncate text-xs text-muted-foreground">
          {row.category_code}
        </div>
      ) : null}
    </div>
  );
}

function Metric({
  label,
  value,
  danger = false,
  title,
}: {
  label: string;
  value: string;
  danger?: boolean;
  title?: string;
}) {
  return (
    <div className="rounded-md border bg-background px-3 py-2">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd
        className={`mt-1 truncate text-sm font-semibold tabular-nums ${
          danger ? "text-destructive" : "text-foreground"
        }`}
        title={title}
      >
        {value}
      </dd>
    </div>
  );
}
