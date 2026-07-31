"use client";

import { useEffect, useMemo, useState } from "react";
import { Trash2, Upload } from "lucide-react";

import {
  getEvidenceImagePreviewSrc,
  MAX_UPLOAD_FILES,
  uploadEvidenceImages,
} from "@/components/expenses/expense-mutation-shared";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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

import { buildPaymentPayload } from "./payment-dialog-rules";
import {
  decimalFromCents,
  errorMessage,
  formatPaymentMoney,
  moneyCents,
} from "./payment-request-page-utils";
import type {
  SupplierPaymentCommandResult,
  SupplierPaymentConfirmInput,
  SupplierPaymentMethod,
  SupplierPaymentRequestDetail,
} from "./payment-request-types";
import {
  paymentMethodLabels,
  paymentRequestStatusMeta,
  shortPaymentId,
} from "./payment-request-ui";

type PaymentLine = {
  allocationId: string;
  payableEventId: string;
  source: string;
  remaining: string;
  amount: string;
};

export function PaymentDialog({
  open,
  request,
  projectName,
  supplierName,
  pending,
  onOpenChange,
  onAbandon,
  onConfirm,
}: {
  open: boolean;
  request: SupplierPaymentRequestDetail | null;
  projectName?: string;
  supplierName?: string;
  pending: boolean;
  onOpenChange: (open: boolean) => void;
  onAbandon: () => void;
  onConfirm: (
    payload: SupplierPaymentConfirmInput,
  ) => Promise<SupplierPaymentCommandResult>;
}) {
  const [paymentId, setPaymentId] = useState("");
  const [paymentMethod, setPaymentMethod] =
    useState<SupplierPaymentMethod>("bank_transfer");
  const [paymentReference, setPaymentReference] = useState("");
  const [paidAt, setPaidAt] = useState("");
  const [paymentAmount, setPaymentAmount] = useState("0.00");
  const [remark, setRemark] = useState("");
  const [evidenceImages, setEvidenceImages] = useState<string[]>([]);
  const [lines, setLines] = useState<PaymentLine[]>([]);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paymentNo, setPaymentNo] = useState<string | null>(null);
  const requestId = request?.payment_request.id ?? null;

  useEffect(() => {
    if (!open || !request) return;
    const nextLines = request.allocations.map((allocation) => {
      const remaining = decimalFromCents(
        moneyCents(allocation.requested_amount) -
          moneyCents(allocation.paid_amount),
      );
      return {
        allocationId: allocation.id,
        payableEventId: allocation.payable_event_id,
        source: `${shortPaymentId(allocation.supplier_purchase_order_id)} / ${shortPaymentId(allocation.receipt_id)}`,
        remaining,
        amount: remaining,
      };
    }).filter(({ remaining }) => moneyCents(remaining) > BigInt(0));
    const total = nextLines.reduce(
      (sum, line) => sum + moneyCents(line.amount),
      BigInt(0),
    );
    setPaymentId(crypto.randomUUID());
    setPaymentMethod("bank_transfer");
    setPaymentReference("");
    setPaidAt(new Date().toISOString().slice(0, 16));
    setPaymentAmount(decimalFromCents(total));
    setRemark("");
    setEvidenceImages([]);
    setLines(nextLines);
    setUploading(false);
    setSubmitting(false);
    setError(null);
    setPaymentNo(null);
  }, [open, requestId]);

  const invoiceBlocked = request?.allocations.some(
    ({ invoice_required_before_payment }) => invoice_required_before_payment,
  ) ?? false;
  const allocatedTotal = useMemo(() => {
    try {
      return decimalFromCents(lines.reduce(
        (sum, line) => sum + moneyCents(line.amount),
        BigInt(0),
      ));
    } catch {
      return "-";
    }
  }, [lines]);
  const busy = pending || uploading || submitting;

  async function handleFiles(fileList: FileList | null) {
    const files = Array.from(fileList ?? []);
    if (!files.length) return;
    if (evidenceImages.length + files.length > MAX_UPLOAD_FILES) {
      setError(`付款凭证最多上传 ${MAX_UPLOAD_FILES} 张`);
      return;
    }
    setUploading(true);
    setError(null);
    try {
      const uploaded = await uploadEvidenceImages(files);
      setEvidenceImages((current) => [...current, ...uploaded]);
    } catch (caught) {
      setError(errorMessage(caught, "付款凭证上传失败"));
    } finally {
      setUploading(false);
    }
  }

  async function submitPayment() {
    if (!request || busy || invoiceBlocked) return;
    setSubmitting(true);
    setError(null);
    try {
      const payload = buildPaymentPayload({
        request,
        paymentId,
        paymentMethod,
        paymentReference,
        paidAt: new Date(paidAt).toISOString(),
        paymentAmount,
        evidenceImages,
        remark,
        allocations: lines.map((line) => ({
          payment_request_allocation_id: line.allocationId,
          payable_event_id: line.payableEventId,
          amount: line.amount,
        })),
      });
      const result = await onConfirm(payload);
      if (!("payment" in result)) throw new RangeError("付款结果缺少付款事实");
      setPaymentNo(result.payment.payment_no);
    } catch (caught) {
      setError(errorMessage(caught, "供应商付款确认失败"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => {
      if (!nextOpen && busy) return;
      onOpenChange(nextOpen);
    }}>
      <DialogContent className="max-h-[92vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>确认供应商付款</DialogTitle>
          <DialogDescription>
            {request
              ? `${request.payment_request.request_no} · ${
                projectName ?? shortPaymentId(request.payment_request.project_id)
              } · ${
                supplierName ?? shortPaymentId(
                  request.payment_request.tenant_supplier_id,
                )
              } · 申请金额 ${
                formatPaymentMoney(request.payment_request.requested_amount)
              } · 状态版本 ${
                paymentRequestStatusMeta[request.payment_request.status].label
              } v${request.payment_request.version}`
              : "按付款申请剩余金额登记付款。"}
          </DialogDescription>
        </DialogHeader>
        {invoiceBlocked ? (
          <Alert variant="destructive">
            <AlertTitle>发票门禁阻断付款</AlertTitle>
            <AlertDescription>
              该申请任一应付来源要求付款前发票，正式发票能力满足前不能确认付款。
            </AlertDescription>
          </Alert>
        ) : null}
        {paymentNo ? (
          <Alert>
            <AlertTitle>付款成功</AlertTitle>
            <AlertDescription>付款号：{paymentNo}</AlertDescription>
          </Alert>
        ) : null}
        {error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}
        {!paymentNo && request ? (
          <FieldGroup>
            <FieldGroup className="grid gap-4 md:grid-cols-2">
              <Field>
                <FieldLabel>付款方式</FieldLabel>
                <Select value={paymentMethod} disabled={busy} onValueChange={(value) =>
                  setPaymentMethod(value as SupplierPaymentMethod)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {Object.entries(paymentMethodLabels).map(([value, label]) => (
                        <SelectItem key={value} value={value}>{label}</SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
              <Field data-invalid={!paymentReference.trim()}>
                <FieldLabel htmlFor="supplier-payment-reference">付款流水号</FieldLabel>
                <Input
                  id="supplier-payment-reference"
                  value={paymentReference}
                  maxLength={200}
                  disabled={busy}
                  aria-invalid={!paymentReference.trim()}
                  onChange={(event) => setPaymentReference(event.target.value)}
                />
                <FieldError>{!paymentReference.trim() ? "付款流水号不能为空" : undefined}</FieldError>
              </Field>
              <Field>
                <FieldLabel htmlFor="supplier-payment-paid-at">付款时间</FieldLabel>
                <Input
                  id="supplier-payment-paid-at"
                  type="datetime-local"
                  value={paidAt}
                  disabled={busy}
                  onChange={(event) => setPaidAt(event.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="supplier-payment-amount">本次付款金额</FieldLabel>
                <Input
                  id="supplier-payment-amount"
                  value={paymentAmount}
                  inputMode="decimal"
                  disabled={busy}
                  onChange={(event) => setPaymentAmount(event.target.value)}
                />
              </Field>
            </FieldGroup>
            <div className="overflow-hidden rounded-md border">
              <Table containerClassName="max-w-full overflow-x-auto">
                <TableHeader>
                  <TableRow>
                    <TableHead>采购/收货来源</TableHead>
                    <TableHead className="text-right">申请剩余</TableHead>
                    <TableHead className="w-48 text-right">本次分配</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lines.map((line, index) => (
                    <TableRow key={line.allocationId}>
                      <TableCell className="font-mono text-xs">{line.source}</TableCell>
                      <TableCell className="text-right font-mono">{formatPaymentMoney(line.remaining)}</TableCell>
                      <TableCell>
                        <Input
                          value={line.amount}
                          inputMode="decimal"
                          disabled={busy}
                          aria-label={`本次付款分配 ${index + 1}`}
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
            <p className="text-right text-sm text-muted-foreground">
              当前分配合计：{allocatedTotal === "-" ? "-" : formatPaymentMoney(allocatedTotal)}
            </p>
            <Field data-invalid={evidenceImages.length === 0}>
              <FieldLabel htmlFor="supplier-payment-evidence">付款凭证（1–9 张）</FieldLabel>
              <Input
                id="supplier-payment-evidence"
                type="file"
                accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
                multiple
                disabled={busy || evidenceImages.length >= MAX_UPLOAD_FILES}
                aria-invalid={evidenceImages.length === 0}
                onChange={(event) => {
                  void handleFiles(event.target.files);
                  event.target.value = "";
                }}
              />
              {uploading ? <span className="text-xs text-muted-foreground"><Upload /> 正在上传凭证</span> : null}
              <FieldError>{evidenceImages.length === 0 ? "至少需要一张付款凭证" : undefined}</FieldError>
              {evidenceImages.length ? (
                <div className="grid gap-2 sm:grid-cols-3">
                  {evidenceImages.map((image, index) => (
                    <div key={image} className="overflow-hidden rounded-md border">
                      <img src={getEvidenceImagePreviewSrc(image)} alt={`付款凭证 ${index + 1}`} className="h-24 w-full object-cover" />
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        disabled={busy}
                        onClick={() => setEvidenceImages((current) => current.filter((_, itemIndex) => itemIndex !== index))}
                      >
                        <Trash2 data-icon="inline-start" /> 删除
                      </Button>
                    </div>
                  ))}
                </div>
              ) : null}
            </Field>
            <Field data-invalid={paymentMethod === "other" && !remark.trim()}>
              <FieldLabel htmlFor="supplier-payment-remark">
                备注{paymentMethod === "other" ? "（必填）" : ""}
              </FieldLabel>
              <Textarea
                id="supplier-payment-remark"
                value={remark}
                maxLength={500}
                disabled={busy}
                aria-invalid={paymentMethod === "other" && !remark.trim()}
                onChange={(event) => setRemark(event.target.value)}
              />
            </Field>
          </FieldGroup>
        ) : null}
        <DialogFooter>
          {pending && !submitting ? (
            <Button type="button" variant="outline" onClick={onAbandon}>
              放弃本次重试并刷新
            </Button>
          ) : null}
          <Button type="button" variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>
            {paymentNo ? "完成" : "返回"}
          </Button>
          {!paymentNo && !invoiceBlocked ? (
            <Button type="button" disabled={busy} onClick={() => void submitPayment()}>
              {busy ? <Spinner data-icon="inline-start" /> : null}
              确认付款
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
