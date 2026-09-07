"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { StatusAlert } from "@/components/admin/status-alert";
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
  getSupplierPaymentRequest,
  listSupplierPaymentRequestPayments,
} from "./payment-request-api";
import { usePaymentRequestCommand } from "./use-payment-request-command";
import { canManagePayableDestination } from "../supplier-payables/payable-destination";
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
import {
  paymentRequestRefreshOutcome,
  supplierPaymentCommandRefresh,
} from "./payment-request-command-refresh";
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
  const command = usePaymentRequestCommand("actions");
  const attempt = command.pending?.command.attempt ?? null;
  const [reviewAction, setReviewAction] =
    useState<PaymentRequestReviewAction>("submit");
  const [reviewValue, setReviewValue] = useState("");
  const [reviewOpen, setReviewOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const requestVersion = useRef(0);
  const recordId = record?.id ?? null;
  const visibleView = useRef({ open, recordId, paymentPage });
  visibleView.current = { open, recordId, paymentPage };

  const reload = useCallback(async () => {
    // Callers can outlive their render while an uncertain command is replaying.
    const target = visibleView.current;
    if (!target.open || !target.recordId) return null;
    const version = ++requestVersion.current;
    const isCurrent = () => requestVersion.current === version && visibleView.current.open &&
      visibleView.current.recordId === target.recordId && visibleView.current.paymentPage === target.paymentPage;
    setLoading(true);
    setError(null);
    try {
      const [nextDetail, nextPayments] = await Promise.all([
        getSupplierPaymentRequest(target.recordId),
        listSupplierPaymentRequestPayments(target.recordId, {
          page: target.paymentPage,
          pageSize: 20,
        }),
      ]);
      if (!isCurrent()) return null;
      setDetail(nextDetail);
      setPayments(nextPayments);
      setRefreshRequired(false);
      return nextDetail;
    } catch (caught) {
      if (isCurrent()) {
        setError(errorMessage(caught, "付款申请详情加载失败"));
      }
      return null;
    } finally {
      if (isCurrent()) setLoading(false);
    }
  }, []);

  useEffect(() => {
    requestVersion.current += 1;
    setDetail(null);
    setPayments(emptyPayments);
    setPaymentPage(1);
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
  }, [open, paymentPage, recordId, reload]);

  const current = detail?.payment_request ?? null;
  const invoiceBlocked = detail?.allocations.some(
    ({ invoice_required_before_payment }) => invoice_required_before_payment,
  ) ?? false;
  const actions = current
    ? paymentRequestActions({ ...current, invoiceBlocked }, permissions)
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

  async function refreshLatest(
    failureMessage = "最新数据刷新失败，请手动重试刷新。",
  ) {
    const latest = await reload();
    const outcome = paymentRequestRefreshOutcome(latest);
    setRefreshRequired(outcome.refreshRequired);
    if (outcome.status === "failed") {
      setError(failureMessage);
      return null;
    }
    if (outcome.releaseAttempt && !command.pending) {
      onPendingChange(null);
    }
    if (outcome.closeDialogs && !command.pending) {
      setReviewOpen(false);
      setPaymentOpen(false);
    }
    if (outcome.notifyChanged) onChanged(outcome.latest.payment_request);
    return outcome.latest;
  }

  async function handleCommandError(caught: unknown) {
    const conflict = paymentRequestConflictMessage(errorCode(caught));
    const message = conflict ?? errorMessage(caught, "付款申请操作失败");
    setError(message);
    if (conflict) {
      setError(`${message} 正在刷新最新数据。`);
      const refreshFailure = `${message} 自动刷新失败，请手动重试刷新。`;
      const latest = await refreshLatest(refreshFailure);
      if (latest) {
        setError(`${message} 已刷新最新数据。`);
      } else {
        return new Error(refreshFailure);
      }
    }
    return new Error(message);
  }

  async function applySuccess(result: SupplierPaymentCommandResult) {
    onChanged(result.payment_request);
    // Compare the live view, not the request captured when replay began.
    const isCurrent = () => visibleView.current.open && visibleView.current.recordId === result.payment_request.id;
    if (isCurrent()) {
      setDetail((currentDetail) => isCurrent() && currentDetail?.payment_request.id === result.payment_request.id
        ? { ...currentDetail, payment_request: result.payment_request }
        : currentDetail);
      setRefreshRequired(true);
      const latest = await reload();
      if (isCurrent()) {
        if (latest) onChanged(latest.payment_request);
        else setError("操作已成功，但最新详情刷新失败，请手动刷新最新数据。");
      }
    }
    window.dispatchEvent(new CustomEvent("supplier-payment-command", {
      detail: {
        requestId: result.payment_request.id,
        ...supplierPaymentCommandRefresh(result.payment_request),
      },
    }));
    router.refresh();
  }

  async function runReviewCommand() {
    if (command.pending) { await retryCommand(); return; }
    if (!current || resourcePending || !actions.includes(reviewAction)) return;
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
    onPendingChange(current.id);
    setError(null);
    const outcome = await command.execute(reviewAction, current.id, commandPayload, current);
    if (outcome?.type === "accepted") {
      setReviewOpen(false);
      onPendingChange(null);
      await applySuccess(outcome.result);
      toast.success(commandSuccess[reviewAction]);
    } else if (outcome?.type === "rejected") {
      onPendingChange(null);
      await handleCommandError(Object.assign(new Error(outcome.message), { code: outcome.code }));
    }
  }

  async function retryCommand(): Promise<SupplierPaymentCommandResult | null> {
    if (!command.pending) return null;
    const kind = command.pending.kind;
    const allowed = kind === "pay" ? permissions.canPay : kind === "approve" || kind === "reject" ? permissions.canApprove : permissions.canManage;
    if (!canManagePayableDestination(command.pending.destination, allowed, permissions.canManageWarehouses ?? false)) {
      command.setError("当前账号没有原采购去向的操作权限；原请求仍保留。");
      return null;
    }
    const outcome = await command.retry();
    if (outcome?.type === "accepted") {
      onPendingChange(null);
      setReviewOpen(false);
      await applySuccess(outcome.result);
      toast.success("原请求结果已确认");
      return outcome.result;
    }
    if (outcome?.type === "rejected") {
      onPendingChange(null);
      await handleCommandError(Object.assign(new Error(outcome.message), { code: outcome.code }));
    }
    return null;
  }

  async function runPayment(
    payload: SupplierPaymentConfirmInput,
  ): Promise<SupplierPaymentCommandResult> {
    if (!current || resourcePending || !actions.includes("pay")) throw new RangeError("付款申请正在处理或当前不可付款");
    onPendingChange(current.id);
    const outcome = await command.execute("pay", current.id, payload, current);
    if (outcome?.type === "accepted") {
      onPendingChange(null);
      await applySuccess(outcome.result);
      return outcome.result;
    }
    if (outcome?.type === "rejected") {
      onPendingChange(null);
      throw await handleCommandError(Object.assign(new Error(outcome.message), { code: outcome.code }));
    }
    throw new RangeError("付款结果尚未确认，请使用原请求重试，不要重新登记。");
  }

  return (
    <>
      {command.pending && !open ? <StatusAlert tone="warning">
        原付款申请 {command.pending.requestNo ?? "（历史本地请求）"} 的操作结果未确认，原请求身份已保留。
        <Button variant="outline" disabled={command.busy} onClick={() => void retryCommand()}>使用原请求重试操作</Button>
        {command.error}
      </StatusAlert> : null}
      <Sheet open={open} onOpenChange={(nextOpen) => {
        if (!nextOpen && command.busy) return;
        onOpenChange(nextOpen);
      }}>
        <SheetContent className="w-[min(96vw,72rem)] max-w-none gap-0 overflow-hidden p-0 sm:max-w-6xl">
          <SheetHeader className="shrink-0 border-b p-4 pr-12">
            <SheetTitle>付款申请详情</SheetTitle>
            <SheetDescription>查看应付分配、状态版本、付款记录和凭证。</SheetDescription>
          </SheetHeader>
          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            <div className="flex flex-col gap-4">
              {command.pending ? <StatusAlert tone="warning">
                原付款申请 {command.pending.requestNo ?? "（历史本地请求）"} 的操作尚未确认。
                可关闭当前详情，再使用列表提示中的原请求重试；读取详情不会确认该操作。
              </StatusAlert> : null}
              {error || command.error ? <StatusAlert>{error || command.error}</StatusAlert> : null}
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
            <Button type="button" variant="outline" disabled={command.busy} onClick={() => onOpenChange(false)}>
              关闭
            </Button>
            {actions.map((action) => action === "edit" ? (
              <Button
                key={action}
                type="button"
                variant="outline"
                disabled={resourcePending || loading || refreshRequired || !command.ready}
                onClick={() => detail && onEdit(detail)}
              >
                编辑草稿
              </Button>
            ) : (
              <Button
                key={action}
                type="button"
                variant={action === "reject" || action === "cancel" || action === "close" ? "destructive" : "default"}
                disabled={resourcePending || loading || refreshRequired || !command.ready}
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
        busy={command.busy}
        frozen={attempt !== null}
        error={error || command.error}
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
        retryBusy={command.busy}
        onRetry={command.pending?.kind === "pay" ? retryCommand : undefined}
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
