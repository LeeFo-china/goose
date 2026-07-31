"use client";

import { useEffect, useMemo, useState } from "react";

import { StatusAlert } from "@/components/admin/status-alert";
import { resolveSupplierCommandAttempt, type SupplierCommandAttempt } from "@/components/supplier-products/supplier-command-attempt";
import type { SupplierPayable } from "@/components/supplier-payables/payable-types";
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

import {
  createSupplierPaymentRequestDraft,
  updateSupplierPaymentRequestDraft,
} from "./payment-request-api";
import {
  decimalFromCents,
  errorCode,
  errorMessage,
  formatPaymentMoney,
  moneyCents,
  paymentRequestConflictMessage,
} from "./payment-request-page-utils";
import type {
  SupplierPaymentRequest,
  SupplierPaymentRequestDetail,
} from "./payment-request-types";
import { shortPaymentId } from "./payment-request-ui";

type DraftLine = {
  allocationId?: string;
  payableEventId: string;
  source: string;
  dueAt: string;
  available: string;
  amount: string;
};

export function PaymentRequestEditor({
  open,
  payables,
  detail,
  projectName,
  supplierName,
  pending,
  onOpenChange,
  onPendingChange,
  onSaved,
  onRefresh,
}: {
  open: boolean;
  payables: SupplierPayable[];
  detail: SupplierPaymentRequestDetail | null;
  projectName?: string;
  supplierName?: string;
  pending: boolean;
  onOpenChange: (open: boolean) => void;
  onPendingChange: (requestId: string | null) => void;
  onSaved: (request: SupplierPaymentRequest) => void;
  onRefresh: () => void;
}) {
  const [draftId, setDraftId] = useState("");
  const [reason, setReason] = useState("");
  const [remark, setRemark] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [attempt, setAttempt] = useState<SupplierCommandAttempt | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const request = detail?.payment_request ?? null;
  const projectId = request?.project_id ?? payables[0]?.project_id ?? "";
  const tenantSupplierId = request?.tenant_supplier_id ??
    payables[0]?.tenant_supplier_id ?? "";

  useEffect(() => {
    if (!open) return;
    setDraftId(request?.id ?? crypto.randomUUID());
    setReason(request?.reason ?? "");
    setRemark(request?.remark ?? "");
    setLines(request
      ? detail!.allocations.map((allocation) => ({
        allocationId: allocation.id,
        payableEventId: allocation.payable_event_id,
        source: `${shortPaymentId(allocation.supplier_purchase_order_id)} / ${shortPaymentId(allocation.receipt_id)}`,
        dueAt: allocation.due_at,
        available: allocation.payable_amount,
        amount: allocation.requested_amount,
      }))
      : payables.map((payable) => ({
        payableEventId: payable.id,
        source: `${payable.purchase_order_no} / ${payable.receipt_no}`,
        dueAt: payable.due_at,
        available: payable.available_to_request_amount,
        amount: payable.available_to_request_amount,
      })));
    setAttempt(null);
    setSaving(false);
    setError(null);
  }, [detail, open, payables, request]);

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
  const frozen = saving || pending || attempt !== null;

  async function saveDraft() {
    if (frozen || !draftId) return;
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
      project_id: projectId,
      tenant_supplier_id: tenantSupplierId,
      reason: trimmedReason,
      remark: remark.trim() || null,
      allocations: lines.map((line) => ({
        payable_event_id: line.payableEventId,
        requested_amount: line.amount,
      })),
    };
    const nextAttempt = resolveSupplierCommandAttempt(attempt, {
      scope: request ? "payment-request:update" : "payment-request:create",
      resourcePath: draftId,
      payload: { ...basePayload, expected_version: request?.version ?? 0 },
    });
    setAttempt(nextAttempt);
    setSaving(true);
    setError(null);
    onPendingChange(draftId);
    let saved = false;
    try {
      const result = request
        ? await updateSupplierPaymentRequestDraft(request.id, {
          id: request.id,
          expected_version: request.version,
          ...basePayload,
        }, nextAttempt.idempotencyKey)
        : await createSupplierPaymentRequestDraft({
          id: draftId,
          expected_version: 0,
          ...basePayload,
        }, nextAttempt.idempotencyKey);
      setAttempt(null);
      saved = true;
      onSaved(result.payment_request);
      onOpenChange(false);
    } catch (caught) {
      const conflict = paymentRequestConflictMessage(errorCode(caught));
      setError(conflict ?? errorMessage(caught, "付款申请草稿保存失败"));
    } finally {
      setSaving(false);
      if (saved) onPendingChange(null);
    }
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen && frozen) return;
    onOpenChange(nextOpen);
  }

  return (
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
            {error ? <StatusAlert>{error}</StatusAlert> : null}
            {attempt ? (
              <Button
                type="button"
                variant="outline"
                disabled={saving}
                onClick={() => {
                  setAttempt(null);
                  onPendingChange(null);
                  onRefresh();
                }}
              >
                放弃本次重试并刷新
              </Button>
            ) : null}
            <FieldGroup className="grid gap-4 md:grid-cols-2">
              <ReadOnlyField label="项目" value={projectName ?? shortPaymentId(projectId)} />
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
          <Button type="button" disabled={frozen} onClick={() => void saveDraft()}>
            {saving ? <Spinner data-icon="inline-start" /> : null}
            保存草稿
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
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
