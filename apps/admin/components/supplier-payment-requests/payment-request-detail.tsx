"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { StatusAlert } from "@/components/admin/status-alert";
import { resolveSupplierCommandAttempt, type SupplierCommandAttempt } from "@/components/supplier-products/supplier-command-attempt";
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

import { PaymentDialog } from "./payment-dialog";
import {
  approveSupplierPaymentRequest,
  cancelSupplierPaymentRequest,
  closeSupplierPaymentRequest,
  confirmSupplierPayment,
  getSupplierPaymentRequest,
  listSupplierPaymentRequestPayments,
  rejectSupplierPaymentRequest,
  submitSupplierPaymentRequest,
} from "./payment-request-api";
import {
  PaymentRecords,
  PaymentRequestAllocations,
  PaymentRequestFacts,
} from "./payment-request-detail-content";
import {
  errorCode,
  errorMessage,
  paymentRequestConflictMessage,
} from "./payment-request-page-utils";
import { supplierPaymentCommandRefresh } from "./payment-request-command-refresh";
import { paymentRequestActions } from "./payment-request-rules";
import {
  PaymentRequestReviewDialog,
  type PaymentRequestReviewAction,
} from "./payment-request-review-dialog";
import type {
  PaymentRequestAction,
  PaymentRequestPermissions,
  SupplierPaymentCommandResult,
  SupplierPaymentConfirmInput,
  SupplierPaymentPage,
  SupplierPaymentRequest,
  SupplierPaymentRequestDetail as PaymentRequestDetailData,
  SupplierPaymentRequestListItem,
} from "./payment-request-types";

const emptyPayments: SupplierPaymentPage = {
  list: [],
  pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
};

export function PaymentRequestDetail({
  open,
  record,
  permissions,
  pendingRequestId,
  initialAction,
  onInitialActionConsumed,
  onPendingChange,
  onOpenChange,
  onEdit,
  onChanged,
}: {
  open: boolean;
  record: SupplierPaymentRequestListItem | null;
  permissions: PaymentRequestPermissions;
  pendingRequestId: string | null;
  initialAction: PaymentRequestAction | null;
  onInitialActionConsumed: () => void;
  onPendingChange: (requestId: string | null) => void;
  onOpenChange: (open: boolean) => void;
  onEdit: (detail: PaymentRequestDetailData) => void;
  onChanged: (request: SupplierPaymentRequest) => void;
}) {
  const router = useRouter();
  const [detail, setDetail] = useState<PaymentRequestDetailData | null>(null);
  const [payments, setPayments] = useState(emptyPayments);
  const [paymentPage, setPaymentPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshRequired, setRefreshRequired] = useState(false);
  const [attempt, setAttempt] = useState<SupplierCommandAttempt | null>(null);
  const [reviewAction, setReviewAction] =
    useState<PaymentRequestReviewAction>("submit");
  const [reviewValue, setReviewValue] = useState("");
  const [reviewOpen, setReviewOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const requestVersion = useRef(0);
  const recordId = record?.id ?? null;

  const reload = useCallback(async () => {
    if (!recordId) return null;
    const version = ++requestVersion.current;
    setLoading(true);
    setError(null);
    try {
      const [nextDetail, nextPayments] = await Promise.all([
        getSupplierPaymentRequest(recordId),
        listSupplierPaymentRequestPayments(recordId, {
          page: paymentPage,
          pageSize: 20,
        }),
      ]);
      if (requestVersion.current !== version) return null;
      setDetail(nextDetail);
      setPayments(nextPayments);
      setRefreshRequired(false);
      return nextDetail;
    } catch (caught) {
      if (requestVersion.current === version) {
        setError(errorMessage(caught, "付款申请详情加载失败"));
      }
      return null;
    } finally {
      if (requestVersion.current === version) setLoading(false);
    }
  }, [paymentPage, recordId]);

  useEffect(() => {
    requestVersion.current += 1;
    setDetail(null);
    setPayments(emptyPayments);
    setPaymentPage(1);
    setAttempt(null);
    setError(null);
    setRefreshRequired(false);
    setReviewOpen(false);
    setPaymentOpen(false);
  }, [open, recordId]);

  useEffect(() => {
    if (!open) return;
    void reload();
    return () => {
      requestVersion.current += 1;
    };
  }, [open, reload]);

  const current = detail?.payment_request ?? null;
  const invoiceBlocked = detail?.allocations.some(
    ({ invoice_required_before_payment }) => invoice_required_before_payment,
  ) ?? false;
  const actions = current
    ? paymentRequestActions({ status: current.status, invoiceBlocked }, permissions)
    : [];
  const resourcePending = pendingRequestId === recordId || attempt !== null;

  useEffect(() => {
    if (!initialAction || !detail || !actions.includes(initialAction)) return;
    if (initialAction === "edit") {
      onEdit(detail);
      onInitialActionConsumed();
      return;
    }
    openAction(initialAction);
    onInitialActionConsumed();
  }, [actions, detail, initialAction, onEdit, onInitialActionConsumed]);

  function openAction(action: Exclude<PaymentRequestAction, "edit">) {
    if (action === "pay") {
      setPaymentOpen(true);
      return;
    }
    setReviewAction(action);
    setReviewValue("");
    setReviewOpen(true);
  }

  async function refreshLatest() {
    const latest = await reload();
    setAttempt(null);
    onPendingChange(null);
    setReviewOpen(false);
    if (latest) onChanged(latest.payment_request);
  }

  async function handleCommandError(caught: unknown) {
    const conflict = paymentRequestConflictMessage(errorCode(caught));
    const message = conflict ?? errorMessage(caught, "付款申请操作失败");
    setError(message);
    if (conflict) {
      setError(`${message} 正在刷新最新数据。`);
      await refreshLatest();
      setError(`${message} 已刷新最新数据。`);
    }
    return new Error(message);
  }

  async function applySuccess(result: SupplierPaymentCommandResult) {
    setDetail((currentDetail) => currentDetail
      ? { ...currentDetail, payment_request: result.payment_request }
      : currentDetail);
    setRefreshRequired(true);
    onChanged(result.payment_request);
    const latest = await reload();
    if (latest) onChanged(latest.payment_request);
    else setError("操作已成功，但最新详情刷新失败，请手动刷新最新数据。");
    window.dispatchEvent(new CustomEvent("supplier-payment-command", {
      detail: {
        requestId: result.payment_request.id,
        ...supplierPaymentCommandRefresh(),
      },
    }));
    router.refresh();
  }

  async function runReviewCommand() {
    if (!current || resourcePending) return;
    const value = reviewValue.trim();
    if (
      (reviewAction === "reject" || reviewAction === "cancel" ||
        reviewAction === "close") && !value
    ) {
      setError("驳回、取消或关闭原因不能为空");
      return;
    }
    const commandPayload = reviewAction === "cancel" || reviewAction === "close"
      ? { expected_version: current.version, reason: value }
      : reviewAction === "reject"
      ? { expected_version: current.version, remark: value }
      : reviewAction === "approve"
      ? { expected_version: current.version, remark: value || null }
      : { expected_version: current.version };
    const nextAttempt = resolveSupplierCommandAttempt(attempt, {
      scope: `payment-request:${reviewAction}`,
      resourcePath: current.id,
      payload: commandPayload,
    });
    setAttempt(nextAttempt);
    onPendingChange(current.id);
    setError(null);
    try {
      let result: SupplierPaymentCommandResult;
      if (reviewAction === "submit") {
        result = await submitSupplierPaymentRequest(current.id, {
          expected_version: current.version,
        }, nextAttempt.idempotencyKey);
      } else if (reviewAction === "approve") {
        result = await approveSupplierPaymentRequest(current.id, {
          expected_version: current.version,
          remark: value || null,
        }, nextAttempt.idempotencyKey);
      } else if (reviewAction === "reject") {
        result = await rejectSupplierPaymentRequest(current.id, {
          expected_version: current.version,
          remark: value,
        }, nextAttempt.idempotencyKey);
      } else if (reviewAction === "cancel") {
        result = await cancelSupplierPaymentRequest(current.id, {
          expected_version: current.version,
          reason: value,
        }, nextAttempt.idempotencyKey);
      } else {
        result = await closeSupplierPaymentRequest(current.id, {
          expected_version: current.version,
          reason: value,
        }, nextAttempt.idempotencyKey);
      }
      setReviewOpen(false);
      setAttempt(null);
      await applySuccess(result);
      onPendingChange(null);
      toast.success(commandSuccess[reviewAction]);
    } catch (caught) {
      await handleCommandError(caught);
    }
  }

  async function runPayment(
    payload: SupplierPaymentConfirmInput,
  ): Promise<SupplierPaymentCommandResult> {
    if (!current || resourcePending) throw new RangeError("付款申请正在处理");
    const nextAttempt = resolveSupplierCommandAttempt(attempt, {
      scope: "payment-request:payment",
      resourcePath: current.id,
      payload,
    });
    setAttempt(nextAttempt);
    onPendingChange(current.id);
    try {
      const result = await confirmSupplierPayment(
        current.id,
        payload,
        nextAttempt.idempotencyKey,
      );
      setAttempt(null);
      await applySuccess(result);
      onPendingChange(null);
      return result;
    } catch (caught) {
      throw await handleCommandError(caught);
    }
  }

  return (
    <>
      <Sheet open={open} onOpenChange={(nextOpen) => {
        if (!nextOpen && resourcePending) return;
        onOpenChange(nextOpen);
      }}>
        <SheetContent className="w-[min(96vw,72rem)] max-w-none gap-0 overflow-hidden p-0 sm:max-w-6xl">
          <SheetHeader className="shrink-0 border-b p-4 pr-12">
            <SheetTitle>付款申请详情</SheetTitle>
            <SheetDescription>查看应付分配、状态版本、付款记录和凭证。</SheetDescription>
          </SheetHeader>
          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            <div className="flex flex-col gap-4">
              {error ? <StatusAlert>{error}</StatusAlert> : null}
              {refreshRequired || attempt ? (
                <Button type="button" variant="outline" disabled={loading} onClick={() => void refreshLatest()}>
                  刷新最新数据
                </Button>
              ) : null}
              {loading || !detail ? (
                <div className="flex flex-col gap-3">
                  <Skeleton className="h-48 w-full" />
                  <Skeleton className="h-64 w-full" />
                </div>
              ) : (
                <>
                  <PaymentRequestFacts detail={detail} supplierName={record?.supplier_name} />
                  <PaymentRequestAllocations detail={detail} />
                  <PaymentRecords
                    payments={payments}
                    loading={loading}
                    onPageChange={setPaymentPage}
                  />
                </>
              )}
            </div>
          </div>
          <SheetFooter className="shrink-0 border-t p-4">
            <Button type="button" variant="outline" disabled={resourcePending} onClick={() => onOpenChange(false)}>
              关闭
            </Button>
            {actions.map((action) => action === "edit" ? (
              <Button
                key={action}
                type="button"
                variant="outline"
                disabled={resourcePending}
                onClick={() => detail && onEdit(detail)}
              >
                编辑草稿
              </Button>
            ) : (
              <Button
                key={action}
                type="button"
                variant={action === "reject" || action === "cancel" || action === "close" ? "destructive" : "default"}
                disabled={resourcePending}
                onClick={() => openAction(action)}
              >
                {actionLabel(action)}
              </Button>
            ))}
          </SheetFooter>
        </SheetContent>
      </Sheet>
      <PaymentRequestReviewDialog
        open={reviewOpen}
        action={reviewAction}
        request={current}
        allocations={detail?.allocations ?? []}
        supplierName={record?.supplier_name}
        value={reviewValue}
        busy={pendingRequestId === recordId && attempt === null}
        frozen={attempt !== null}
        error={error}
        onValueChange={setReviewValue}
        onOpenChange={(nextOpen) => {
          if (!nextOpen && resourcePending) return;
          setReviewOpen(nextOpen);
        }}
        onAbandon={() => void refreshLatest()}
        onConfirm={() => void runReviewCommand()}
      />
      <PaymentDialog
        open={paymentOpen}
        request={detail}
        supplierName={record?.supplier_name}
        pending={resourcePending}
        onOpenChange={setPaymentOpen}
        onAbandon={() => void refreshLatest()}
        onConfirm={runPayment}
      />
    </>
  );
}

const commandSuccess: Record<PaymentRequestReviewAction, string> = {
  submit: "付款申请已提交",
  approve: "付款申请已批准",
  reject: "付款申请已驳回",
  cancel: "付款申请已取消",
  close: "付款申请已关闭",
};

function actionLabel(action: Exclude<PaymentRequestAction, "edit">) {
  return {
    submit: "提交审批",
    approve: "批准申请",
    reject: "驳回申请",
    cancel: "取消申请",
    pay: "确认付款",
    close: "关闭尾款",
  }[action];
}
