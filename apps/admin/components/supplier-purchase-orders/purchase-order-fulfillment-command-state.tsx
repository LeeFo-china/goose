"use client";

import { useCallback, useEffect, useState } from "react";

import type {
  SupplierCommandAttempt,
  SupplierResourceCommandAttempt,
} from "@/components/supplier-products/supplier-command-attempt";
import { useAdminSessionScope } from "@/components/layout/admin-session-scope";
import { Field, FieldError } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { TableCell } from "@/components/ui/table";

import {
  clearPersistedFrozenCommand,
  type FrozenCommand,
  type FrozenCommandKind,
  getBrowserFrozenCommandStorage,
  persistFrozenCommand,
  restoreFrozenCommand,
} from "./purchase-order-fulfillment-ui-state";
import type {
  FulfillmentValidationError,
  PurchaseOrderReceiptPayload,
  ReceiptLineDraft,
} from "./purchase-order-fulfillment-types";

export function useFrozenCommandSession<
  Payload,
  Attempt extends SupplierCommandAttempt,
>(
  orderId: string,
  kind: FrozenCommandKind,
) {
  const sessionScope = useAdminSessionScope();
  const identity = sessionScope
    ? `${sessionScope.storageScope}:${kind}:${orderId}`
    : null;
  const [storedState, setStoredState] = useState<{
    identity: string;
    command: FrozenCommand<Payload, Attempt> | null;
  } | null>(null);
  const command = identity && storedState?.identity === identity
    ? storedState.command
    : null;

  useEffect(() => {
    if (!identity || !sessionScope) {
      setStoredState(null);
      return;
    }
    setStoredState({
      identity,
      command: restoreFrozenCommand(
        getBrowserFrozenCommandStorage(),
        sessionScope,
        orderId,
        kind,
      ),
    });
  }, [identity, kind, orderId, sessionScope]);

  const saveCommand = useCallback((
    next: FrozenCommand<Payload, Attempt> | null,
    resourcePath = orderId,
  ) => {
    if (!identity || !sessionScope) {
      setStoredState(null);
      return;
    }
    const storage = getBrowserFrozenCommandStorage();
    if (next) persistFrozenCommand(storage, sessionScope, kind, next);
    else {
      clearPersistedFrozenCommand(
        storage,
        sessionScope,
        resourcePath,
        kind,
      );
    }
    setStoredState({ identity, command: next });
  }, [identity, kind, orderId, sessionScope]);

  return [command, saveCommand] as const;
}

export type ReceiptLineInputs = {
  acceptedQuantity: string;
  rejectedQuantity: string;
  varianceReason: string;
};

export function emptyReceiptLineInputs(): ReceiptLineInputs {
  return { acceptedQuantity: "", rejectedQuantity: "", varianceReason: "" };
}

export function receiptDraftFromFrozenCommand(
  command: FrozenCommand<
    PurchaseOrderReceiptPayload,
    SupplierResourceCommandAttempt
  > | null,
) {
  if (!command) return null;
  return {
    receiptNo: command.payload.receipt_no,
    receivedAt: command.payload.received_at,
    remark: command.payload.remark ?? "",
    lineInputs: Object.fromEntries(command.payload.items.map((item) => [
      item.purchase_order_item_id,
      {
        acceptedQuantity: String(item.accepted_quantity),
        rejectedQuantity: String(item.rejected_quantity),
        varianceReason: item.variance_reason ?? "",
      },
    ])),
  };
}

export function PurchaseOrderReceiptQuantityField({
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
  const error = receiptLineError(errors, lines, itemId, path);
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

export function receiptLineError(
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
