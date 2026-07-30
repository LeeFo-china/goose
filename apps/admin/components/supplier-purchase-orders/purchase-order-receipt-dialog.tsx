"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { StatusAlert } from "@/components/admin/status-alert";
import {
  resolveSupplierCommandAttempt,
  type SupplierResourceCommandAttempt,
} from "@/components/supplier-products/supplier-command-attempt";
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
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
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

import { createPurchaseOrderReceipt } from "./purchase-order-fulfillment-api";
import {
  receiptRemaining,
  toReceiptPayload,
} from "./purchase-order-fulfillment-rules";
import {
  commandRetryMessage,
  refreshAfterCommand,
  shouldClearCommandAttempt,
} from "./purchase-order-fulfillment-ui-state";
import type {
  FulfillmentValidationError,
  PurchaseOrderFulfillment,
  PurchaseOrderItemFulfillment,
  ReceiptLineDraft,
} from "./purchase-order-fulfillment-types";
import type { PurchaseOrderItem } from "./purchase-order-types";

const VALIDATION_ID = "00000000-0000-4000-8000-000000000000";
type ReceiptLineInputs = {
  acceptedQuantity: string;
  rejectedQuantity: string;
  varianceReason: string;
};

export function PurchaseOrderReceiptDialog({
  open,
  orderId,
  fulfillment,
  items,
  purchaseOrderItems,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  orderId: string;
  fulfillment: PurchaseOrderFulfillment;
  items: PurchaseOrderItemFulfillment[];
  purchaseOrderItems: PurchaseOrderItem[];
  onOpenChange: (open: boolean) => void;
  onSaved: () => Promise<boolean>;
}) {
  const availableItems = useMemo(
    () => items.filter((item) => receiptRemaining(item) !== "0"),
    [items],
  );
  const [receiptNo, setReceiptNo] = useState("");
  const [receivedAt, setReceivedAt] = useState("");
  const [remark, setRemark] = useState("");
  const [lineInputs, setLineInputs] =
    useState<Record<string, ReceiptLineInputs>>({});
  const [errors, setErrors] = useState<FulfillmentValidationError[]>([]);
  const [commandError, setCommandError] = useState<string | null>(null);
  const [attempt, setAttempt] =
    useState<SupplierResourceCommandAttempt | null>(null);
  const [busy, setBusy] = useState(false);
  function resetDraft() {
    setReceiptNo("");
    setReceivedAt(toLocalDateTime(new Date()));
    setRemark("");
    setLineInputs({});
    setErrors([]);
    setCommandError(null);
  }
  useEffect(() => {
    if (!open || attempt) return;
    resetDraft();
  }, [open]);
  function abandonAttempt() {
    setAttempt(null);
    resetDraft();
  }
  const purchaseItemById = useMemo(
    () => new Map(purchaseOrderItems.map((item) => [item.id, item])),
    [purchaseOrderItems],
  );
  const enteredLines = selectedLines(availableItems, lineInputs);
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const headerErrors = validateHeader(receiptNo, receivedAt);
    const lines = enteredLines;
    const receivedAtIso = toIsoDateTime(receivedAt);
    const result = toReceiptPayload({
      id: VALIDATION_ID,
      expectedFulfillmentVersion: fulfillment.version,
      receiptNo,
      receivedAt: receivedAtIso ?? "",
      remark,
      lines,
    }, items);
    if (!result.ok) {
      setErrors([...headerErrors, ...result.errors]);
      return;
    }
    if (headerErrors.length || !receivedAtIso) {
      setErrors(headerErrors);
      return;
    }
    const { id: _validationId, ...attemptPayload } = result.payload;
    const nextAttempt = resolveSupplierCommandAttempt(attempt, {
      scope: "purchase-order:create-receipt",
      resourcePath: orderId,
      payload: attemptPayload,
      allocateResourceId: true,
    });
    setAttempt(nextAttempt);
    setErrors([]);
    setCommandError(null);
    setBusy(true);
    try {
      await createPurchaseOrderReceipt(orderId, {
        ...result.payload,
        id: nextAttempt.resourceId,
      }, nextAttempt.idempotencyKey);
      setAttempt(null);
      toast.success("采购收货记录已登记");
      onOpenChange(false);
    } catch (caught) {
      const message = errorMessage(caught, "登记采购收货失败");
      setCommandError(message);
      toast.error(commandRetryMessage(caught, message));
      if (shouldClearCommandAttempt(caught)) setAttempt(null);
      if (errorCode(caught).includes("VERSION_CONFLICT")) {
        onOpenChange(false);
        await refreshAfterCommand(onSaved);
      }
      setBusy(false);
      return;
    }
    setBusy(false);
    const refreshed = await refreshAfterCommand(onSaved);
    if (!refreshed) toast.error("收货记录已提交，但刷新失败，请手动刷新");
  }

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => {
      if (!busy) onOpenChange(nextOpen);
    }}>
      <DialogContent className="max-h-[90vh] max-w-6xl overflow-y-auto">
        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>登记采购收货</DialogTitle>
            <DialogDescription>
              接受与拒收之和不得超过已发未收数量，拒收时必须填写差异原因。
            </DialogDescription>
          </DialogHeader>
          {commandError ? <StatusAlert>{commandError}</StatusAlert> : null}
          {attempt ? (
            <StatusAlert tone="warning">
              上次请求结果不确定，草稿与请求标识已保留；重试会复用原请求标识。
              <Button type="button" variant="outline" size="sm" className="mt-2"
                onClick={abandonAttempt}>
                放弃本次尝试
              </Button>
            </StatusAlert>
          ) : null}
          <FieldGroup>
            <FieldSet>
              <FieldLegend variant="label">收货信息</FieldLegend>
              <FieldGroup className="grid gap-4 md:grid-cols-2">
              <Field data-invalid={Boolean(fieldError(errors, "receipt_no"))}>
                <FieldLabel htmlFor="purchase-order-receipt-no">
                  收货编号
                </FieldLabel>
                <Input
                  id="purchase-order-receipt-no"
                  value={receiptNo}
                  maxLength={80}
                  required
                  disabled={busy}
                  aria-invalid={Boolean(fieldError(errors, "receipt_no"))}
                  aria-describedby="purchase-order-receipt-no-error"
                  onChange={(event) => setReceiptNo(event.target.value)}
                />
                <FieldError id="purchase-order-receipt-no-error">
                  {fieldError(errors, "receipt_no")}</FieldError>
              </Field>
              <Field data-invalid={Boolean(fieldError(errors, "received_at"))}>
                <FieldLabel htmlFor="purchase-order-received-at">
                  收货时间
                </FieldLabel>
                <Input
                  id="purchase-order-received-at"
                  type="datetime-local"
                  value={receivedAt}
                  required
                  disabled={busy}
                  aria-invalid={Boolean(fieldError(errors, "received_at"))}
                  aria-describedby="purchase-order-received-at-error"
                  onChange={(event) => setReceivedAt(event.target.value)}
                />
                <FieldError id="purchase-order-received-at-error">
                  {fieldError(errors, "received_at")}</FieldError>
              </Field>
              </FieldGroup>
            </FieldSet>
            <Field>
              <FieldLabel htmlFor="purchase-order-receipt-remark">
                收货备注
              </FieldLabel>
              <Textarea
                id="purchase-order-receipt-remark"
                value={remark}
                maxLength={500}
                disabled={busy}
                onChange={(event) => setRemark(event.target.value)}
              />
            </Field>
            <FieldSet>
              <FieldLegend variant="label">本次收货明细</FieldLegend>
              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="min-w-52">采购明细</TableHead>
                      <TableHead className="text-right">
                        剩余可收
                      </TableHead>
                      <TableHead className="min-w-32">接受</TableHead>
                      <TableHead className="min-w-32">拒收</TableHead>
                      <TableHead className="min-w-52">差异原因</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {availableItems.map((item, index) => {
                      const itemId = item.supplier_purchase_order_item_id;
                      const purchaseItem = purchaseItemById.get(itemId);
                      const remaining_quantity = receiptRemaining(item);
                      const values = lineInputs[itemId] ?? emptyLineInputs();
                      const varianceError = lineError(
                        errors,
                        enteredLines,
                        itemId,
                        "variance_reason",
                      );
                      return (
                        <TableRow key={itemId}>
                          <TableCell>
                            <div className="font-medium">
                              {purchaseItem?.product_name_snapshot ?? itemId}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {purchaseItem?.sku_name_snapshot ??
                                `明细 ${index + 1}`}
                            </div>
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {remaining_quantity}
                          </TableCell>
                          <ReceiptQuantityField
                            label={`接受数量 ${index + 1}`}
                            itemId={itemId}
                            path="accepted_quantity"
                            value={values.acceptedQuantity}
                            maximum={remaining_quantity}
                            disabled={busy}
                            errors={errors}
                            lines={enteredLines}
                            onChange={(value) =>
                              updateLine(setLineInputs, itemId, {
                                acceptedQuantity: value,
                              })}
                          />
                          <ReceiptQuantityField
                            label={`拒收数量 ${index + 1}`}
                            itemId={itemId}
                            path="rejected_quantity"
                            value={values.rejectedQuantity}
                            maximum={remaining_quantity}
                            disabled={busy}
                            errors={errors}
                            lines={enteredLines}
                            onChange={(value) =>
                              updateLine(setLineInputs, itemId, {
                                rejectedQuantity: value,
                              })}
                          />
                          <TableCell>
                            <Field data-invalid={Boolean(varianceError)}>
                              <Input
                                aria-label={`差异原因 ${index + 1}`}
                                aria-describedby={`receipt-variance-error-${itemId}`}
                                value={values.varianceReason}
                                maxLength={500}
                                disabled={busy}
                                aria-invalid={Boolean(varianceError)}
                                onChange={(event) =>
                                  updateLine(setLineInputs, itemId, {
                                    varianceReason: event.target.value,
                                  })}
                              />
                              <FieldError id={`receipt-variance-error-${itemId}`}>
                                {varianceError}</FieldError>
                            </Field>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
              <FieldError id="purchase-order-receipt-items-error">
                {fieldError(errors, "items")}</FieldError>
            </FieldSet>
          </FieldGroup>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => onOpenChange(false)}
            >
              取消
            </Button>
            <Button type="submit" disabled={busy || !availableItems.length}>
              {busy ? <Spinner data-icon="inline-start" /> : null}
              登记收货
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ReceiptQuantityField({
  label,
  itemId,
  path,
  value,
  maximum,
  disabled,
  errors,
  lines,
  onChange,
}: {
  label: string;
  itemId: string;
  path: "accepted_quantity" | "rejected_quantity";
  value: string;
  maximum: string;
  disabled: boolean;
  errors: FulfillmentValidationError[];
  lines: ReceiptLineDraft[];
  onChange: (value: string) => void;
}) {
  const error = lineError(errors, lines, itemId, path);
  const errorId = `receipt-${path}-error-${itemId}`;
  return (
    <TableCell>
      <Field data-invalid={Boolean(error)}>
        <Input
          aria-label={label}
          aria-describedby={errorId}
          type="number"
          inputMode="decimal"
          min="0"
          max={maximum}
          step="0.0001"
          value={value}
          placeholder="0"
          disabled={disabled}
          aria-invalid={Boolean(error)}
          onChange={(event) => onChange(event.target.value)}
        />
        <FieldError id={errorId}>{error}</FieldError>
      </Field>
    </TableCell>
  );
}

function selectedLines(
  items: PurchaseOrderItemFulfillment[],
  inputs: Record<string, ReceiptLineInputs>,
): ReceiptLineDraft[] {
  return items.flatMap((item) => {
    const values = inputs[item.supplier_purchase_order_item_id];
    if (!values || ![
      values.acceptedQuantity,
      values.rejectedQuantity,
      values.varianceReason,
    ].some((value) => value.trim())) return [];
    return [{
      purchaseOrderItemId: item.supplier_purchase_order_item_id,
      ...values,
    }];
  });
}

function updateLine(
  setter: React.Dispatch<React.SetStateAction<Record<string, ReceiptLineInputs>>>,
  itemId: string,
  patch: Partial<ReceiptLineInputs>,
) {
  setter((current) => ({
    ...current,
    [itemId]: { ...(current[itemId] ?? emptyLineInputs()), ...patch },
  }));
}

function emptyLineInputs(): ReceiptLineInputs {
  return { acceptedQuantity: "", rejectedQuantity: "", varianceReason: "" };
}

function validateHeader(receiptNo: string, receivedAt: string) {
  const errors: FulfillmentValidationError[] = [];
  if (!receiptNo.trim()) {
    errors.push({ path: "receipt_no", message: "请填写收货编号" });
  }
  if (!toIsoDateTime(receivedAt)) {
    errors.push({ path: "received_at", message: "请选择有效的收货时间" });
  }
  return errors;
}

function fieldError(errors: FulfillmentValidationError[], path: string) {
  return errors.find((error) => error.path === path)?.message;
}

function lineError(
  errors: FulfillmentValidationError[],
  lines: ReceiptLineDraft[],
  itemId: string,
  suffix: string,
) {
  const index = lines.findIndex((line) => line.purchaseOrderItemId === itemId);
  if (index < 0) return undefined;
  return errors.find((error) =>
    error.path === `items.${index}.${suffix}` ||
    error.path === `items.${index}`
  )?.message;
}

function toLocalDateTime(date: Date) {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function toIsoDateTime(value: string) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

function errorCode(error: unknown) {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return "";
  }
  return typeof error.code === "string" ? error.code : "";
}
