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

import { createPurchaseOrderShipment } from "./purchase-order-fulfillment-api";
import {
  shipmentRemaining,
  toShipmentPayload,
} from "./purchase-order-fulfillment-rules";
import type {
  FulfillmentValidationError,
  PurchaseOrderFulfillment,
  PurchaseOrderItemFulfillment,
} from "./purchase-order-fulfillment-types";
import type { PurchaseOrderItem } from "./purchase-order-types";

const VALIDATION_ID = "00000000-0000-4000-8000-000000000000";

export function PurchaseOrderShipmentDialog({
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
  onSaved: () => Promise<void>;
}) {
  const availableItems = useMemo(
    () => items.filter((item) => shipmentRemaining(item) !== "0"),
    [items],
  );
  const [shipmentNo, setShipmentNo] = useState("");
  const [shippedAt, setShippedAt] = useState("");
  const [carrierName, setCarrierName] = useState("");
  const [trackingNo, setTrackingNo] = useState("");
  const [remark, setRemark] = useState("");
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<FulfillmentValidationError[]>([]);
  const [commandError, setCommandError] = useState<string | null>(null);
  const [attempt, setAttempt] =
    useState<SupplierResourceCommandAttempt | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setShipmentNo("");
    setShippedAt(toLocalDateTime(new Date()));
    setCarrierName("");
    setTrackingNo("");
    setRemark("");
    setQuantities({});
    setErrors([]);
    setCommandError(null);
    setAttempt(null);
  }, [open]);

  const purchaseItemById = useMemo(
    () => new Map(purchaseOrderItems.map((item) => [item.id, item])),
    [purchaseOrderItems],
  );
  const enteredLines = selectedShipmentLines(availableItems, quantities);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const headerErrors = validateHeader(shipmentNo, shippedAt);
    const lines = enteredLines;
    const shippedAtIso = toIsoDateTime(shippedAt);
    const result = toShipmentPayload({
      id: VALIDATION_ID,
      expectedFulfillmentVersion: fulfillment.version,
      shipmentNo,
      carrierName,
      trackingNo,
      shippedAt: shippedAtIso ?? "",
      remark,
      lines,
    }, items);
    if (!result.ok) {
      setErrors([...headerErrors, ...result.errors]);
      return;
    }
    if (headerErrors.length || !shippedAtIso) {
      setErrors(headerErrors);
      return;
    }

    const { id: _validationId, ...attemptPayload } = result.payload;
    const nextAttempt = resolveSupplierCommandAttempt(attempt, {
      scope: "purchase-order:create-shipment",
      resourcePath: orderId,
      payload: attemptPayload,
      allocateResourceId: true,
    });
    setAttempt(nextAttempt);
    setErrors([]);
    setCommandError(null);
    setBusy(true);
    try {
      await createPurchaseOrderShipment(orderId, {
        ...result.payload,
        id: nextAttempt.resourceId,
      }, nextAttempt.idempotencyKey);
      setAttempt(null);
      toast.success("采购发货记录已登记");
      onOpenChange(false);
      await onSaved();
    } catch (caught) {
      const message = errorMessage(caught, "登记采购发货失败");
      setCommandError(message);
      toast.error(retryMessage(caught, message));
      if (shouldClearAttempt(caught)) setAttempt(null);
      if (errorCode(caught).includes("VERSION_CONFLICT")) {
        onOpenChange(false);
        await onSaved();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => {
      if (!busy) onOpenChange(nextOpen);
    }}>
      <DialogContent className="max-h-[90vh] max-w-5xl overflow-y-auto">
        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>登记采购发货</DialogTitle>
            <DialogDescription>
              仅登记本次实际发货数量，金额继续以后端采购快照计算。
            </DialogDescription>
          </DialogHeader>
          {commandError ? <StatusAlert>{commandError}</StatusAlert> : null}
          <FieldGroup>
            <FieldGroup className="grid gap-4 md:grid-cols-2">
              <Field data-invalid={Boolean(fieldError(errors, "shipment_no"))}>
                <FieldLabel htmlFor="purchase-order-shipment-no">
                  发货编号
                </FieldLabel>
                <Input
                  id="purchase-order-shipment-no"
                  value={shipmentNo}
                  maxLength={80}
                  required
                  disabled={busy}
                  aria-invalid={Boolean(fieldError(errors, "shipment_no"))}
                  onChange={(event) => setShipmentNo(event.target.value)}
                />
                <FieldError>{fieldError(errors, "shipment_no")}</FieldError>
              </Field>
              <Field data-invalid={Boolean(fieldError(errors, "shipped_at"))}>
                <FieldLabel htmlFor="purchase-order-shipped-at">
                  发货时间
                </FieldLabel>
                <Input
                  id="purchase-order-shipped-at"
                  type="datetime-local"
                  value={shippedAt}
                  required
                  disabled={busy}
                  aria-invalid={Boolean(fieldError(errors, "shipped_at"))}
                  onChange={(event) => setShippedAt(event.target.value)}
                />
                <FieldError>{fieldError(errors, "shipped_at")}</FieldError>
              </Field>
              <Field>
                <FieldLabel htmlFor="purchase-order-carrier-name">
                  承运方
                </FieldLabel>
                <Input
                  id="purchase-order-carrier-name"
                  value={carrierName}
                  maxLength={100}
                  disabled={busy}
                  onChange={(event) => setCarrierName(event.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="purchase-order-tracking-no">
                  运单号
                </FieldLabel>
                <Input
                  id="purchase-order-tracking-no"
                  value={trackingNo}
                  maxLength={120}
                  disabled={busy}
                  onChange={(event) => setTrackingNo(event.target.value)}
                />
              </Field>
            </FieldGroup>
            <Field>
              <FieldLabel htmlFor="purchase-order-shipment-remark">
                发货备注
              </FieldLabel>
              <Textarea
                id="purchase-order-shipment-remark"
                value={remark}
                maxLength={500}
                disabled={busy}
                onChange={(event) => setRemark(event.target.value)}
              />
            </Field>
            <Field data-invalid={Boolean(fieldError(errors, "items"))}>
              <FieldLabel>本次发货明细</FieldLabel>
              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="min-w-56">采购明细</TableHead>
                      <TableHead className="text-right">
                        剩余可发
                      </TableHead>
                      <TableHead className="min-w-40">本次发货</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {availableItems.map((item, index) => {
                      const itemId = item.supplier_purchase_order_item_id;
                      const purchaseItem = purchaseItemById.get(itemId);
                      const remaining_quantity = shipmentRemaining(item);
                      const quantityError = lineError(
                        errors,
                        enteredLines,
                        itemId,
                        "quantity",
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
                          <TableCell>
                            <Field data-invalid={Boolean(quantityError)}>
                              <Input
                                aria-label={`本次发货数量 ${index + 1}`}
                                type="number"
                                inputMode="decimal"
                                min="0.0001"
                                max={remaining_quantity}
                                step="0.0001"
                                value={quantities[itemId] ?? ""}
                                placeholder="0"
                                disabled={busy}
                                aria-invalid={Boolean(quantityError)}
                                onChange={(event) =>
                                  setQuantities((current) => ({
                                    ...current,
                                    [itemId]: event.target.value,
                                  }))}
                              />
                              <FieldError>{quantityError}</FieldError>
                            </Field>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
              <FieldError>{fieldError(errors, "items")}</FieldError>
            </Field>
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
              登记发货
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function validateHeader(shipmentNo: string, shippedAt: string) {
  const errors: FulfillmentValidationError[] = [];
  if (!shipmentNo.trim()) {
    errors.push({ path: "shipment_no", message: "请填写发货编号" });
  }
  if (!toIsoDateTime(shippedAt)) {
    errors.push({ path: "shipped_at", message: "请选择有效的发货时间" });
  }
  return errors;
}

function selectedShipmentLines(
  items: PurchaseOrderItemFulfillment[],
  quantities: Record<string, string>,
) {
  return items
    .filter((item) =>
      (quantities[item.supplier_purchase_order_item_id] ?? "").trim()
    )
    .map((item) => ({
      purchaseOrderItemId: item.supplier_purchase_order_item_id,
      quantity: quantities[item.supplier_purchase_order_item_id] ?? "",
    }));
}

function fieldError(errors: FulfillmentValidationError[], path: string) {
  return errors.find((error) => error.path === path)?.message;
}

function lineError(
  errors: FulfillmentValidationError[],
  lines: Array<{ purchaseOrderItemId: string }>,
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

function isUncertainFailure(error: unknown) {
  if (typeof error !== "object" || error === null || !("status" in error)) {
    return true;
  }
  return typeof error.status !== "number" || error.status >= 500;
}

function shouldClearAttempt(error: unknown) {
  return !isUncertainFailure(error);
}

function errorCode(error: unknown) {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return "";
  }
  return typeof error.code === "string" ? error.code : "";
}

function retryMessage(error: unknown, message: string) {
  return isUncertainFailure(error)
    ? `${message}，可直接重试，系统会复用本次请求标识`
    : message;
}
