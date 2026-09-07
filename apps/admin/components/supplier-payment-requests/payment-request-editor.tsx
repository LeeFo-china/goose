"use client";

import { useEffect, useMemo, useState } from "react";

import { StatusAlert } from "@/components/admin/status-alert";
import type { SupplierPayable } from "@/components/supplier-payables/payable-types";
import { payableDestination, payableDestinationLabel, canManagePayableDestination } from "../supplier-payables/payable-destination";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";

import { usePaymentRequestCommand } from "./use-payment-request-command";
import type { runPaymentRequestCommand } from "./payment-request-command";
import {
  decimalFromCents,
  errorMessage,
  formatPaymentMoney,
  mergePaymentRequestDraftLines,
  moneyCents,
  paymentRequestConflictMessage,
  paymentRequestSaveFailureKind,
  type PaymentRequestDraftLine,
} from "./payment-request-page-utils";
import type {
  SupplierPaymentRequest,
  SupplierPaymentRequestDetail,
} from "./payment-request-types";
import { shortPaymentId } from "./payment-request-ui";

export function PaymentRequestEditor({
  open,
  payables,
  detail,
  canManageWarehouses,
  supplierName,
  pending,
  onOpenChange,
  onPendingChange,
  onSaved,
  onReloadFacts,
  onInvalidated,
}: {
  open: boolean;
  payables: SupplierPayable[];
  detail: SupplierPaymentRequestDetail | null;
  canManageWarehouses: boolean;
  supplierName?: string;
  pending: boolean;
  onOpenChange: (open: boolean) => void;
  onPendingChange: (requestId: string | null) => void;
  onSaved: (request: SupplierPaymentRequest) => void;
  onReloadFacts: (
    requestId: string | null,
    payableEventIds: string[],
  ) => Promise<{
    detail: SupplierPaymentRequestDetail | null;
    payables: SupplierPayable[];
  }>;
  onInvalidated: (message: string) => void;
}) {
  const [draftId, setDraftId] = useState("");
  const [reason, setReason] = useState("");
  const [remark, setRemark] = useState("");
  const [lines, setLines] = useState<PaymentRequestDraftLine[]>([]);
  const command = usePaymentRequestCommand("draft");
  const attempt = command.pending?.command.attempt ?? null;
  const saving = command.busy;
  const [refreshingFacts, setRefreshingFacts] = useState(false);
  const [recovery, setRecovery] = useState<
    "reload_facts" | "retry_same_attempt" | null
  >(null);
  const [error, setError] = useState<string | null>(null);
  const request = detail?.payment_request ?? null;
  const destinationFacts = request ?? payables[0];
  const destination = destinationFacts ? payableDestination(destinationFacts) : null;
  const canManageDestination = destinationFacts && canManagePayableDestination(destinationFacts, true, canManageWarehouses);
  const tenantSupplierId = request?.tenant_supplier_id ??
    payables[0]?.tenant_supplier_id ?? "";

  useEffect(() => {
    if (!open) return;
    setDraftId(request?.id ?? crypto.randomUUID());
    setReason(request?.reason ?? "");
    setRemark(request?.remark ?? "");
    setLines(request
      ? mergePaymentRequestDraftLines(detail!, payables)
      : payables.map((payable) => ({
        payableEventId: payable.id,
        source: `${payable.purchase_order_no} / ${payable.receipt_no}`,
        dueAt: payable.due_at,
        available: payable.available_to_request_amount,
        amount: payable.available_to_request_amount,
      })));
  }, [detail, open, payables, request]);

  useEffect(() => {
    if (!open) return;
    setRefreshingFacts(false);
    setRecovery(null);
    setError(null);
  }, [open, request?.id]);

  const total = useMemo(() => {
    try {
      return decimalFromCents(lines.reduce(
        (sum, line) => sum + moneyCents(line.amount),
        BigInt(0),
      ));
    } catch {
      return "-";
    }
  }, [lines]);
  const frozen = saving || refreshingFacts || pending || attempt !== null || recovery === "reload_facts";

  async function saveDraft(retrySameAttempt = false) {
    if (retrySameAttempt) {
      if (!command.pending || saving || !canManagePayableDestination(command.pending.destination, true, canManageWarehouses)) return;
      await handleSaveOutcome(await command.retry());
      return;
    }
    if (!destination || !canManageDestination) return;
    if (!draftId || saving || refreshingFacts || recovery === "reload_facts" || !command.ready) return;
    if (retrySameAttempt ? !attempt : pending || attempt !== null) return;
    const trimmedReason = reason.trim();
    if (!trimmedReason) {
      setError("申请原因不能为空");
      return;
    }
    if (lines.length < 1 || lines.length > 100) {
      setError("付款申请分配必须为 1 至 100 行");
      return;
    }
    try {
      lines.forEach((line) => {
        const amount = moneyCents(line.amount);
        if (amount <= BigInt(0)) {
          throw new RangeError("本次申请金额必须大于 0");
        }
        if (amount > moneyCents(line.available)) {
          throw new RangeError("本次申请金额不能超过可申请余额");
        }
      });
    } catch (caught) {
      setError(errorMessage(caught, "申请金额无效"));
      return;
    }
    const basePayload = {
      ...destination,
      tenant_supplier_id: tenantSupplierId,
      reason: trimmedReason,
      remark: remark.trim() || null,
      allocations: lines.map((line) => ({
        payable_event_id: line.payableEventId,
        requested_amount: line.amount,
      })),
    };
    setError(null);
    onPendingChange(draftId);
    const outcome = await command.execute(request ? "update" : "create", draftId,
      { id: draftId, expected_version: request?.version ?? 0, ...basePayload }, destination);
    await handleSaveOutcome(outcome);
  }

  async function handleSaveOutcome(outcome: Awaited<ReturnType<typeof runPaymentRequestCommand>> | null) {
    if (!outcome) return;
    if (outcome.type === "accepted") {
      onPendingChange(null);
      onSaved(outcome.result.payment_request);
      onOpenChange(false);
      return;
    }
    if (outcome.type === "uncertain") {
      setRecovery("retry_same_attempt");
      setError("保存结果暂未确认。请使用相同请求身份重试保存，避免产生重复申请。");
      return;
    }
    onPendingChange(null);
      const code = outcome.code;
      const conflict = paymentRequestConflictMessage(code);
      const nextRecovery = paymentRequestSaveFailureKind(
        code,
        outcome.status,
      );
      if (nextRecovery === "reload_facts") {
        setRecovery(nextRecovery);
        const message = conflict ?? "付款申请事实已变化，请重新加载。";
        setError(`${message} 正在重新加载申请详情与应付事实。`);
        await reloadFacts(message);
      } else if (nextRecovery === "retry_same_attempt") {
        setRecovery(nextRecovery);
        setError(
          "保存结果暂未确认。请使用相同请求身份重试保存，避免产生重复申请。",
        );
      } else {
        setRecovery(null);
        setError(outcome.message);
      }
  }

  async function reloadFacts(message: string) {
    setRefreshingFacts(true);
    try {
      const next = await onReloadFacts(
        request?.id ?? null,
        lines.map(({ payableEventId }) => payableEventId),
      );
      if (request && !next.detail) {
        throw new RangeError("付款申请详情未返回");
      }
      if (next.detail && next.detail.payment_request.status !== "draft") {
        setRecovery(null);
        onPendingChange(null);
        onInvalidated(
          `付款申请状态已变为 ${next.detail.payment_request.status}，已退出草稿编辑。`,
        );
        return;
      }
      setLines(next.detail
        ? mergePaymentRequestDraftLines(next.detail, next.payables)
        : next.payables.map((payable) => ({
          payableEventId: payable.id,
          source: `${payable.purchase_order_no} / ${payable.receipt_no}`,
          dueAt: payable.due_at,
          available: payable.available_to_request_amount,
          amount: payable.available_to_request_amount,
        })));
      if (next.detail) {
        setReason(next.detail.payment_request.reason);
        setRemark(next.detail.payment_request.remark ?? "");
      }
      setRecovery(null);
      onPendingChange(null);
      setError(`${message} 已刷新最新事实，请重新确认金额后保存。`);
    } catch (caught) {
      setRecovery("reload_facts");
      setError(
        `${message} 自动刷新失败：${errorMessage(caught, "申请详情或应付事实加载失败")}。请手动重试刷新。`,
      );
    } finally {
      setRefreshingFacts(false);
    }
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen && frozen) return;
    onOpenChange(nextOpen);
  }

  return (<>
    {command.pending && !open ? <StatusAlert tone="warning">
      有一笔付款申请保存结果未确认，原申请和请求身份已保留。
      <Button variant="outline" disabled={saving} onClick={() => void saveDraft(true)}>使用相同请求身份重试保存</Button>
      {command.error}
    </StatusAlert> : null}
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent className="w-[min(96vw,68rem)] max-w-none gap-0 overflow-hidden p-0 sm:max-w-5xl">
        <SheetHeader className="shrink-0 border-b p-4 pr-12">
          <SheetTitle>{request ? "编辑付款申请草稿" : "创建付款申请"}</SheetTitle>
          <SheetDescription>
            金额与范围均以重新获取的服务端应付事实为准，保存结果由服务端重新汇总。
          </SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <FieldGroup>
            {error || command.error ? <StatusAlert>{error || command.error}</StatusAlert> : null}
            {attempt ? (
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={saving}
                  onClick={() => void saveDraft(true)}
                >
                  {saving ? <Spinner data-icon="inline-start" /> : null}
                  使用相同请求身份重试保存
                </Button>
              </div>
            ) : null}
            {recovery === "reload_facts" ? (
              <Button
                type="button"
                variant="outline"
                disabled={refreshingFacts || saving}
                onClick={() => void reloadFacts("付款申请事实需要刷新。")}
              >
                {refreshingFacts ? <Spinner data-icon="inline-start" /> : null}
                重试刷新申请与应付事实
              </Button>
            ) : null}
            <FieldGroup className="grid gap-4 md:grid-cols-2">
              <ReadOnlyField label="采购去向" value={destinationFacts ? payableDestinationLabel(destinationFacts) : "采购去向不可用"} />
              <ReadOnlyField label="供应商" value={supplierName ?? shortPaymentId(tenantSupplierId)} />
              <Field data-invalid={!reason.trim()}>
                <FieldLabel htmlFor="payment-request-reason">申请原因</FieldLabel>
                <Input
                  id="payment-request-reason"
                  value={reason}
                  maxLength={500}
                  disabled={frozen}
                  aria-invalid={!reason.trim()}
                  onChange={(event) => setReason(event.target.value)}
                />
                <FieldError>{!reason.trim() ? "申请原因不能为空" : undefined}</FieldError>
              </Field>
              <Field>
                <FieldLabel htmlFor="payment-request-remark">备注</FieldLabel>
                <Textarea
                  id="payment-request-remark"
                  value={remark}
                  maxLength={500}
                  disabled={frozen}
                  onChange={(event) => setRemark(event.target.value)}
                />
              </Field>
            </FieldGroup>
            <div className="overflow-hidden rounded-md border">
              <Table containerClassName="max-w-full overflow-x-auto">
                <TableHeader>
                  <TableRow>
                    <TableHead>收货来源</TableHead>
                    <TableHead>到期日</TableHead>
                    <TableHead className="text-right">可申请</TableHead>
                    <TableHead className="w-48 text-right">本次申请</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lines.map((line, index) => (
                    <TableRow key={line.payableEventId}>
                      <TableCell className="font-mono text-xs">{line.source}</TableCell>
                      <TableCell>{new Date(line.dueAt).toLocaleDateString("zh-CN")}</TableCell>
                      <TableCell className="text-right font-mono">
                        {formatPaymentMoney(line.available)}
                      </TableCell>
                      <TableCell>
                        <Input
                          value={line.amount}
                          inputMode="decimal"
                          disabled={frozen}
                          aria-label={`本次申请 ${index + 1}`}
                          onChange={(event) => setLines((current) => current.map(
                            (item, itemIndex) => itemIndex === index
                              ? { ...item, amount: event.target.value }
                              : item,
                          ))}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <p className="text-right text-sm font-medium">
              申请总额（服务端保存结果）：{request
                ? formatPaymentMoney(request.requested_amount)
                : total === "-" ? "-" : formatPaymentMoney(total)}
            </p>
          </FieldGroup>
        </div>
        <SheetFooter className="shrink-0 border-t p-4">
          <Button type="button" variant="outline" disabled={frozen} onClick={() => handleOpenChange(false)}>
            取消
          </Button>
          <Button type="button" disabled={frozen || !canManageDestination} onClick={() => void saveDraft()}>
            {saving ? <Spinner data-icon="inline-start" /> : null}
            保存草稿
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet></>
  );
}

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <Field data-disabled>
      <FieldLabel>{label}</FieldLabel>
      <Input value={value} disabled readOnly />
    </Field>
  );
}
