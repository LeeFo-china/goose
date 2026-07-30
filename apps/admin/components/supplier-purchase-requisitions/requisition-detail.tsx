"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";

import { StatusAlert } from "@/components/admin/status-alert";
import type {
  FinanceCostCategoryRecord,
} from "@/components/finance/finance-cost-budget-requests";
import {
  resolveSupplierCommandAttempt,
  type SupplierCommandAttempt,
} from "@/components/supplier-products/supplier-command-attempt";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";

import { actionsFor } from "./requisition-rules";
import {
  cancelRequisition,
  convertRequisition,
  loadRequisition,
  loadRequisitionItems,
  reviewRequisition,
  submitRequisition,
} from "./requisition-api";
import { RequisitionBudgetSummary } from "./requisition-budget-summary";
import {
  RequisitionFacts,
  RequisitionItemsTable,
} from "./requisition-detail-content";
import {
  commandConflictMessage,
  errorCode,
  errorMessage,
  errorStatus,
} from "./requisition-page-utils";
import {
  refreshRequisitionAfterCommand,
} from "./requisition-command-refresh";
import {
  RequisitionReviewDialog,
  type RequisitionConfirmAction,
} from "./requisition-review-dialog";
import type {
  RequisitionAction,
  RequisitionCommandResult,
  RequisitionDetail as RequisitionDetailData,
  RequisitionItem,
  RequisitionRecord,
} from "./requisition-types";

const commandSuccess: Record<RequisitionConfirmAction, string> = {
  submit: "采购申请已提交",
  approve: "采购申请已批准",
  reject: "采购申请已驳回",
  cancel: "采购申请已取消",
  convert: "采购单草稿已生成",
};

export function RequisitionDetail({
  open,
  record,
  projectName,
  supplierName,
  costCategories,
  currentEmployeeId,
  canManage,
  canApprove,
  canManageBudget,
  canViewPurchaseOrders,
  initialAction,
  onOpenChange,
  onEdit,
  onChanged,
  onInitialActionConsumed,
}: {
  open: boolean;
  record: RequisitionRecord | null;
  projectName?: string;
  supplierName?: string;
  costCategories: FinanceCostCategoryRecord[];
  currentEmployeeId: string | null;
  canManage: boolean;
  canApprove: boolean;
  canManageBudget: boolean;
  canViewPurchaseOrders: boolean;
  initialAction: Exclude<RequisitionAction, "edit"> | null;
  onOpenChange: (open: boolean) => void;
  onEdit: (record: RequisitionRecord) => void;
  onChanged: (record: RequisitionRecord) => void;
  onInitialActionConsumed: () => void;
}) {
  const [detail, setDetail] = useState<RequisitionDetailData | null>(null);
  const [items, setItems] = useState<RequisitionItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState<SupplierCommandAttempt | null>(null);
  const [confirmAction, setConfirmAction] =
    useState<RequisitionConfirmAction>("submit");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmValue, setConfirmValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [commandError, setCommandError] = useState<string | null>(null);
  const [conflict, setConflict] = useState<string | null>(null);
  const [refreshRequired, setRefreshRequired] = useState(false);
  const requestVersion = useRef(0);
  const recordId = record?.id ?? null;
  const recordRef = useRef(record);
  recordRef.current = record;

  const reload = useCallback(async (refreshFailureMessage?: string) => {
    if (!recordId) return null;
    const version = ++requestVersion.current;
    setLoading(true);
    setHasLoaded(false);
    setError(null);
    const refreshed = await refreshRequisitionAfterCommand(() =>
      Promise.all([
        loadRequisition(recordId),
        loadRequisitionItems(recordId),
      ])
    );
    if (requestVersion.current !== version) return null;
    if (refreshed.status === "refresh_failed") {
      setError(refreshFailureMessage ??
        errorMessage(refreshed.error, "采购申请详情加载失败"));
      setLoading(false);
      if (errorStatus(refreshed.error) === 404) return "not_found" as const;
      return null;
    }
    const [nextDetail, itemPage] = refreshed.value;
    setDetail(nextDetail);
    setItems(itemPage.list);
    setHasLoaded(true);
    setRefreshRequired(false);
    setLoading(false);
    return nextDetail.requisition;
  }, [recordId]);

  useEffect(() => {
    requestVersion.current += 1;
    const baseline = recordRef.current;
    setDetail(baseline
      ? { requisition: baseline, budget_snapshots: [] }
      : null);
    setItems([]);
    setLoading(false);
    setHasLoaded(false);
    setAttempt(null);
    setConflict(null);
    setCommandError(null);
    setRefreshRequired(false);
    setConfirmOpen(false);
    setConfirmValue("");
    if (open) void reload();
    return () => {
      requestVersion.current += 1;
    };
  }, [open, recordId, reload]);

  const current = detail?.requisition ?? null;
  const actions = current && hasLoaded
    ? actionsFor({
      status: current.status,
      budgetStatus: current.budget_status,
      currentEmployeeId,
      requesterEmployeeId: current.created_by_employee_id,
      canManage,
      canApprove,
      canManageBudget,
    })
    : [];

  function openCommand(action: Exclude<RequisitionAction, "edit">) {
    if (attempt && action !== confirmAction) return;
    if (!attempt) setConfirmValue("");
    setConfirmAction(action);
    setCommandError(null);
    setConfirmOpen(true);
  }

  useEffect(() => {
    if (
      !initialAction ||
      !current ||
      !actions.includes(initialAction) ||
      loading
    ) return;
    openCommand(initialAction);
    onInitialActionConsumed();
  }, [
    actions,
    current,
    initialAction,
    loading,
    onInitialActionConsumed,
  ]);

  async function runCommand() {
    if (!current || !hasLoaded || busy) return;
    const trimmed = confirmValue.trim();
    const commandScope = `purchase-requisition:${confirmAction}`;
    setBusy(true);
    setError(null);
    setCommandError(null);
    setConflict(null);
    let commandResult: RequisitionCommandResult;
    try {
      if (confirmAction === "convert") {
        const payload = { expected_version: current.version };
        const nextAttempt = resolveSupplierCommandAttempt(attempt, {
          scope: commandScope,
          resourcePath: current.id,
          payload,
          allocateResourceId: true,
        });
        setAttempt(nextAttempt);
        commandResult = await convertRequisition(
          current.id,
          payload,
          nextAttempt,
        );
      } else if (confirmAction === "submit") {
        const payload = { expected_version: current.version };
        const nextAttempt = resolveSupplierCommandAttempt(attempt, {
          scope: commandScope,
          resourcePath: current.id,
          payload,
        });
        setAttempt(nextAttempt);
        commandResult = await submitRequisition(
          current.id,
          payload,
          nextAttempt,
        );
      } else if (confirmAction === "cancel") {
        const payload = {
          expected_version: current.version,
          reason: trimmed,
        };
        const nextAttempt = resolveSupplierCommandAttempt(attempt, {
          scope: commandScope,
          resourcePath: current.id,
          payload,
        });
        setAttempt(nextAttempt);
        commandResult = await cancelRequisition(
          current.id,
          payload,
          nextAttempt,
        );
      } else {
        const payload = {
          expected_version: current.version,
          action: confirmAction,
          remark: trimmed || null,
        };
        const nextAttempt = resolveSupplierCommandAttempt(attempt, {
          scope: commandScope,
          resourcePath: current.id,
          payload,
        });
        setAttempt(nextAttempt);
        commandResult = await reviewRequisition(
          current.id,
          payload,
          nextAttempt,
        );
      }
    } catch (caught) {
      const nextConflict = commandConflictMessage(errorCode(caught));
      const message = nextConflict ??
        errorMessage(caught, "采购申请操作失败");
      setConflict(nextConflict);
      setCommandError(message);
      setError(message);
      setBusy(false);
      return;
    }
    setAttempt(null);
    setConfirmOpen(false);
    setConfirmValue("");
    setDetail((currentDetail) => ({
      requisition: commandResult.requisition,
      budget_snapshots: currentDetail?.budget_snapshots ?? [],
    }));
    setHasLoaded(false);
    setRefreshRequired(true);
    onChanged(commandResult.requisition);
    toast.success(commandSuccess[confirmAction]);
    const latest = await reload(
      "操作已成功，但最新详情刷新失败，请手动刷新。",
    );
    if (latest && latest !== "not_found") {
      onChanged(latest);
    }
    setBusy(false);
  }

  async function refreshLatest() {
    setConflict(null);
    setCommandError(null);
    const latest = await reload();
    if (latest === "not_found") {
      setAttempt(null);
      setConfirmOpen(false);
    } else if (latest) {
      setAttempt(null);
      setConfirmOpen(false);
      onChanged(latest);
    }
  }

  function handleSheetOpenChange(nextOpen: boolean) {
    if (!nextOpen && (busy || attempt)) return;
    onOpenChange(nextOpen);
  }

  const categoryNames = Object.fromEntries(
    costCategories.map((category) => [category.id, category.name]),
  );
  return (
    <>
      <Sheet open={open} onOpenChange={handleSheetOpenChange}>
        <SheetContent className="w-[min(96vw,72rem)] max-w-none gap-0 overflow-hidden p-0 sm:max-w-6xl">
          <SheetHeader className="shrink-0 border-b p-4 pr-12">
            <SheetTitle>采购申请详情</SheetTitle>
            <SheetDescription>
              查看申请版本、服务端计价、预算快照和当前可执行动作。
            </SheetDescription>
          </SheetHeader>
          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            <div className="flex flex-col gap-4">
              {error ? <StatusAlert>{error}</StatusAlert> : null}
              {conflict || refreshRequired ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void refreshLatest()}
                >
                  刷新最新数据
                </Button>
              ) : null}
              {loading || !detail ? (
                <div className="flex flex-col gap-3">
                  <Skeleton className="h-44 w-full" />
                  <Skeleton className="h-60 w-full" />
                </div>
              ) : (
                <>
                  <RequisitionFacts
                    requisition={detail.requisition}
                    projectName={projectName}
                    supplierName={supplierName}
                  />
                  <RequisitionItemsTable
                    items={items}
                    categoryNames={categoryNames}
                  />
                  <RequisitionBudgetSummary
                    detail={detail}
                    categories={costCategories}
                  />
                </>
              )}
            </div>
          </div>
          <SheetFooter className="shrink-0 border-t p-4">
            <Button
              type="button"
              variant="outline"
              disabled={busy || Boolean(attempt)}
              onClick={() => handleSheetOpenChange(false)}
            >
              关闭
            </Button>
            {hasLoaded &&
            current?.status === "converted" &&
            current.purchase_order_id &&
            canViewPurchaseOrders ? (
              <Button asChild variant="outline">
                <Link
                  href={`/supplier-purchase-orders?purchase_order_id=${
                    encodeURIComponent(current.purchase_order_id)
                  }`}
                >
                  查看对应采购单
                </Link>
              </Button>
            ) : null}
            {actions.map((action) =>
              action === "edit" ? (
                <Button
                  key={action}
                  type="button"
                  variant="outline"
                  disabled={busy || Boolean(attempt)}
                  onClick={() => current && onEdit(current)}
                >
                  编辑草稿
                </Button>
              ) : (
                <Button
                  key={action}
                  type="button"
                  variant={action === "reject" || action === "cancel"
                    ? "destructive"
                    : "default"}
                  disabled={busy || Boolean(attempt)}
                  onClick={() => openCommand(action)}
                >
                  {actionLabel(action)}
                </Button>
              )
            )}
          </SheetFooter>
        </SheetContent>
      </Sheet>
      <RequisitionReviewDialog
        open={confirmOpen}
        action={confirmAction}
        value={confirmValue}
        busy={busy || loading}
        frozen={attempt !== null}
        error={commandError}
        onValueChange={setConfirmValue}
        onOpenChange={(nextOpen) => {
          if (!nextOpen && (busy || attempt)) return;
          setConfirmOpen(nextOpen);
        }}
        onAbandon={() => void refreshLatest()}
        onConfirm={() => void runCommand()}
      />
    </>
  );
}

function actionLabel(action: Exclude<RequisitionAction, "edit">) {
  return {
    submit: "提交审批",
    approve: "批准申请",
    reject: "驳回申请",
    convert: "生成采购单",
    cancel: "取消申请",
  }[action];
}
