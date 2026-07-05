"use client";

import {
  type FormEvent,
  useEffect,
  useMemo,
  useState,
  useTransition,
} from "react";
import { useRouter } from "next/navigation";
import { ClipboardCheck, Loader2 } from "lucide-react";
import { FormSelect } from "@/components/admin/form-select";
import { StatusAlert } from "@/components/admin/status-alert";
import type {
  FinanceCostCategoryListData,
  FinanceCostCategoryRecord,
} from "@/components/finance/finance-cost-budget-requests";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { requestBackendJson } from "@/lib/backend-client";
import { refreshAfterDialogClose } from "@/lib/deferred-refresh";
import type {
  FinanceReconciliationAction,
  FinanceReconciliationActionRecord,
  FinanceReconciliationAvailableAction,
  FinanceReconciliationExceptionDetailData,
  FinanceReconciliationExceptionRecord,
  FinanceReconciliationExpenseContext,
} from "./finance-reconciliation-requests";
import {
  financeReconciliationActionLabel,
  financeReconciliationExceptionLabel,
  financeReconciliationStatusMeta,
} from "./finance-reconciliation-utils";
import {
  formatFinanceDateTime,
  formatFinanceMoney,
} from "./finance-ledger-utils";

const ACTION_OPTIONS: FinanceReconciliationAvailableAction[] = [
  { key: "acknowledge", label: "标记已确认" },
  { key: "resolve", label: "标记人工闭环" },
  { key: "ignore", label: "标记忽略" },
  { key: "reopen", label: "重新打开" },
];

export function FinanceReconciliationActionDialog({
  row,
  onClose,
}: {
  row: FinanceReconciliationExceptionRecord;
  onClose: () => void;
}) {
  const router = useRouter();
  const [action, setAction] = useState<FinanceReconciliationAction>(
    row.status === "open" ? "acknowledge" : "reopen",
  );
  const [error, setError] = useState("");
  const [detail, setDetail] =
    useState<FinanceReconciliationExceptionDetailData | null>(null);
  const [history, setHistory] = useState<FinanceReconciliationActionRecord[]>([]);
  const [detailError, setDetailError] = useState("");
  const [detailLoading, setDetailLoading] = useState(true);
  const [categories, setCategories] = useState<FinanceCostCategoryRecord[]>([]);
  const [categoryId, setCategoryId] = useState("");
  const [pending, startTransition] = useTransition();
  const statusMeta = financeReconciliationStatusMeta(row.status);
  const actionOptions = useMemo(
    () =>
      detail?.available_actions?.length
        ? detail.available_actions
        : ACTION_OPTIONS,
    [detail],
  );
  const needsCostCategory = action === "update_expense_ledger_category";

  useEffect(() => {
    const controller = new AbortController();
    setDetailLoading(true);
    setDetailError("");
    setDetail(null);
    setHistory([]);

    requestBackendJson<FinanceReconciliationExceptionDetailData>(
      `/finance/reconciliation/exceptions/${
        encodeURIComponent(row.exception_fingerprint)
      }`,
      {
        cache: "no-store",
        signal: controller.signal,
        fallbackMessage: "异常详情加载失败",
      },
    )
      .then((data) => {
        setDetail(data);
        setHistory(data.history || []);
        const firstAction = data.available_actions?.[0]?.key;
        if (firstAction) setAction(firstAction);
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        setDetailError(err instanceof Error ? err.message : "异常详情加载失败");
      })
      .finally(() => {
        if (!controller.signal.aborted) setDetailLoading(false);
      });

    return () => controller.abort();
  }, [row.exception_fingerprint]);

  useEffect(() => {
    if (row.exception_code !== "expense_ledger_without_category") return;
    const controller = new AbortController();
    requestBackendJson<FinanceCostCategoryListData>(
      "/finance/cost-categories?page=1&pageSize=100&status=active",
      {
        cache: "no-store",
        signal: controller.signal,
        fallbackMessage: "成本分类加载失败",
      },
    )
      .then((data) => {
        const nextCategories = data.list || [];
        setCategories(nextCategories);
        setCategoryId((current) => current || nextCategories[0]?.id || "");
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : "成本分类加载失败");
      });
    return () => controller.abort();
  }, [row.exception_code]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const form = new FormData(event.currentTarget);
    const remark = String(form.get("remark") || "").trim();
    if (needsCostCategory && !categoryId) {
      setError("请选择成本分类");
      return;
    }

    startTransition(async () => {
      try {
        await requestBackendJson(
          `/finance/reconciliation/exceptions/${
            encodeURIComponent(row.exception_fingerprint)
          }/actions`,
          {
            method: "POST",
            body: JSON.stringify({
              action,
              remark,
              ...(needsCostCategory ? { cost_category_id: categoryId } : {}),
            }),
            fallbackMessage: "处理对账异常失败",
          },
        );
        onClose();
        refreshAfterDialogClose(router);
      } catch (err) {
        setError(err instanceof Error ? err.message : "处理对账异常失败");
      }
    });
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-[760px]">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-accent text-accent-foreground">
              <ClipboardCheck aria-hidden="true" className="size-4" />
            </span>
            <div className="min-w-0">
              <DialogTitle>处理对账异常</DialogTitle>
              <DialogDescription>
                {financeReconciliationExceptionLabel(row.exception_code)} · {statusMeta.label}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {error ? <StatusAlert>{error}</StatusAlert> : null}
        {detailError ? <StatusAlert>{detailError}</StatusAlert> : null}

        <form id="reconciliation-action-form" className="grid gap-3" onSubmit={submit}>
          <div className="rounded-md border bg-muted/30 px-3 py-2">
            <div className="truncate text-sm font-medium">{row.title}</div>
            <div className="mt-1 text-xs text-muted-foreground">
              {row.description}
            </div>
          </div>

          <ExpenseContextCard
            loading={detailLoading}
            context={detail?.context ?? null}
          />

          <HistoryPanel loading={detailLoading} history={history} />

          <label className="grid gap-1.5 text-sm">
            <span className="text-xs font-medium text-muted-foreground">处理动作</span>
            <Select
              value={action}
              disabled={pending || detailLoading}
              onValueChange={(value) =>
                setAction(value as FinanceReconciliationAction)}
            >
              <SelectTrigger>
                <SelectValue placeholder="请选择处理动作" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {actionOptions.map((item) => (
                    <SelectItem key={item.key} value={item.key}>
                      {item.label || financeReconciliationActionLabel(item.key)}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </label>

          {needsCostCategory ? (
            <label className="grid gap-1.5 text-sm">
              <span className="text-xs font-medium text-muted-foreground">
                成本分类
              </span>
              <FormSelect
                id="reconciliation-cost-category"
                value={categoryId}
                options={categories.map((category) => ({
                  value: category.id,
                  label: category.name || category.code,
                }))}
                disabled={pending}
                placeholder="请选择成本分类"
                onChange={setCategoryId}
              />
            </label>
          ) : null}

          <label className="grid gap-1.5 text-sm">
            <span className="text-xs font-medium text-muted-foreground">处理备注</span>
            <Textarea
              name="remark"
              required
              maxLength={500}
              disabled={pending}
              placeholder="填写处理原因、凭证或后续追踪说明"
            />
          </label>

          <p className="text-xs text-muted-foreground">
            费用补台账和补成本分类会执行受控修正并写入处理记录；金额不一致复核只记录结论，不自动改动金额。
          </p>
        </form>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={onClose}
          >
            取消
          </Button>
          <Button
            type="submit"
            form="reconciliation-action-form"
            disabled={pending || detailLoading}
          >
            {pending ? <Loader2 data-icon="inline-start" className="animate-spin" /> : null}
            保存处理
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ExpenseContextCard({
  loading,
  context,
}: {
  loading: boolean;
  context: FinanceReconciliationExpenseContext | null;
}) {
  if (loading) {
    return (
      <div className="rounded-md border px-3 py-2 text-xs text-muted-foreground">
        异常详情加载中
      </div>
    );
  }
  if (!context) return null;

  return (
    <div className="grid gap-2 rounded-md border px-3 py-2">
      <div className="text-xs font-medium text-muted-foreground">费用上下文</div>
      <div className="grid gap-2 md:grid-cols-3">
        <DetailItem
          label="费用申请"
          value={context.expense_request?.title || context.expense_request?.id}
        />
        <DetailItem
          label="打款金额"
          value={formatFinanceMoney(context.settlement?.paid_amount)}
        />
        <DetailItem
          label="打款时间"
          value={formatFinanceDateTime(context.settlement?.paid_at)}
        />
        <DetailItem
          label="收款人"
          value={context.settlement?.payee_name}
        />
        <DetailItem
          label="台账金额"
          value={context.ledger ? formatFinanceMoney(context.ledger.amount) : "-"}
        />
        <DetailItem
          label="相关台账"
          value={String(context.ledgers?.length ?? (context.ledger ? 1 : 0))}
        />
      </div>
    </div>
  );
}

function HistoryPanel({
  loading,
  history,
}: {
  loading: boolean;
  history: FinanceReconciliationActionRecord[];
}) {
  return (
    <div className="rounded-md border px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground">
          处理历史
        </span>
        <span className="text-xs text-muted-foreground">
          {loading ? "加载中" : `${history.length} 条`}
        </span>
      </div>
      {history.length > 0 ? (
        <div className="mt-2 grid max-h-32 gap-2 overflow-auto pr-1">
          {history.map((item) => (
            <div key={item.id} className="grid gap-1 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">
                  {financeReconciliationActionLabel(item.action)}
                </span>
                <span className="shrink-0 text-muted-foreground">
                  {formatFinanceDateTime(item.created_at)}
                </span>
              </div>
              <div className="truncate text-muted-foreground">
                {[item.actor_employee_name || "未知处理人", item.remark]
                  .filter(Boolean)
                  .join(" · ")}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-2 text-xs text-muted-foreground">
          {loading ? "正在加载处理历史" : "暂无处理历史"}
        </p>
      )}
    </div>
  );
}

function DetailItem({
  label,
  value,
}: {
  label: string;
  value: string | number | null | undefined;
}) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="truncate text-sm">{value || "-"}</div>
    </div>
  );
}
