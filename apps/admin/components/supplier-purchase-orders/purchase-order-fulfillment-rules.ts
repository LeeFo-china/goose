import type { PurchaseOrderStatus } from "./purchase-order-types";
import type {
  FulfillmentValidationError,
  PurchaseOrderFulfillment,
  PurchaseOrderFulfillmentDetail,
  PurchaseOrderItemFulfillment,
  PurchaseOrderReceiptPayload,
  PurchaseOrderShipmentPayload,
  ReceiptDraft,
  ReceiptLineDraft,
  ShipmentDraft,
  ShipmentLineDraft,
} from "./purchase-order-fulfillment-types";

export type PurchaseOrderFulfillmentAction = "confirm" | "ship" | "receive";

const QUANTITY_SCALE = 4;
const QUANTITY_FACTOR = BigInt(10_000);
const ZERO_QUANTITY = BigInt(0);
const MAX_QUANTITY_UNITS = BigInt("999999999999999999");
const MAX_EVENT_LINES = 100;

const TERMINAL_FULFILLMENT_STATUSES = new Set<
  PurchaseOrderFulfillment["status"]
>(["received", "received_with_variance", "cancelled"]);

export function fulfillmentActions(
  detail: Pick<
    PurchaseOrderFulfillmentDetail,
    "fulfillment" | "item_fulfillments"
  >,
  canManage: boolean,
  orderStatus: PurchaseOrderStatus,
): PurchaseOrderFulfillmentAction[] {
  if (!canManage || orderStatus !== "submitted") return [];
  if (!detail.fulfillment) return ["confirm"];
  if (TERMINAL_FULFILLMENT_STATUSES.has(detail.fulfillment.status)) return [];

  const actions: PurchaseOrderFulfillmentAction[] = [];
  if (detail.item_fulfillments.some((item) =>
    remainingUnits(item.ordered_quantity, item.shipped_quantity) >
      ZERO_QUANTITY
  )) {
    actions.push("ship");
  }
  if (detail.item_fulfillments.some((item) =>
    remainingUnits(item.shipped_quantity, item.received_quantity) >
      ZERO_QUANTITY
  )) {
    actions.push("receive");
  }
  return actions;
}

export function shipmentRemaining(
  item: Pick<
    PurchaseOrderItemFulfillment,
    "ordered_quantity" | "shipped_quantity"
  >,
): string {
  return remainingQuantity(item.ordered_quantity, item.shipped_quantity);
}

export function receiptRemaining(
  item: Pick<
    PurchaseOrderItemFulfillment,
    "shipped_quantity" | "received_quantity"
  >,
): string {
  return remainingQuantity(item.shipped_quantity, item.received_quantity);
}

export function validateShipmentLines(
  lines: readonly ShipmentLineDraft[],
  items: readonly PurchaseOrderItemFulfillment[],
): FulfillmentValidationError[] {
  const errors = lineCountErrors(lines.length, "发货");
  if (lines.length > MAX_EVENT_LINES) return errors;

  const itemById = fulfillmentItemMap(items);
  const seen = new Set<string>();
  lines.forEach((line, index) => {
    const path = `items.${index}`;
    const normalizedId = line.purchaseOrderItemId.toLowerCase();
    addDuplicateError(errors, seen, normalizedId, path);
    const quantity = parseQuantity(
      line.quantity,
      false,
      `${path}.quantity`,
      errors,
    );
    const item = itemById.get(normalizedId);
    if (!item) {
      errors.push({
        path: `${path}.purchase_order_item_id`,
        message: "采购单明细不存在",
      });
      return;
    }
    if (quantity !== null) {
      addRemainingError(
        errors,
        quantity,
        shipmentRemaining(item),
        path,
        "发货",
      );
    }
  });
  return errors;
}

export function validateReceiptLines(
  lines: readonly ReceiptLineDraft[],
  items: readonly PurchaseOrderItemFulfillment[],
): FulfillmentValidationError[] {
  const errors = lineCountErrors(lines.length, "收货");
  if (lines.length > MAX_EVENT_LINES) return errors;

  const itemById = fulfillmentItemMap(items);
  const seen = new Set<string>();
  lines.forEach((line, index) => {
    validateReceiptLine(line, index, itemById, seen, errors);
  });
  return errors;
}

export function toShipmentPayload(input: ShipmentDraft): PurchaseOrderShipmentPayload {
  return {
    id: input.id,
    expected_fulfillment_version: input.expectedFulfillmentVersion,
    shipment_no: input.shipmentNo.trim(),
    carrier_name: optionalText(input.carrierName),
    tracking_no: optionalText(input.trackingNo),
    shipped_at: input.shippedAt,
    remark: optionalText(input.remark),
    items: input.lines.map((line) => ({
      purchase_order_item_id: line.purchaseOrderItemId,
      quantity: Number(line.quantity),
    })),
  };
}

export function toReceiptPayload(input: ReceiptDraft): PurchaseOrderReceiptPayload {
  return {
    id: input.id,
    expected_fulfillment_version: input.expectedFulfillmentVersion,
    receipt_no: input.receiptNo.trim(),
    received_at: input.receivedAt,
    remark: optionalText(input.remark),
    items: input.lines.map((line) => ({
      purchase_order_item_id: line.purchaseOrderItemId,
      accepted_quantity: Number(line.acceptedQuantity),
      rejected_quantity: Number(line.rejectedQuantity),
      variance_reason: optionalText(line.varianceReason),
    })),
  };
}

function validateReceiptLine(
  line: ReceiptLineDraft,
  index: number,
  itemById: Map<string, PurchaseOrderItemFulfillment>,
  seen: Set<string>,
  errors: FulfillmentValidationError[],
) {
  const path = `items.${index}`;
  const normalizedId = line.purchaseOrderItemId.toLowerCase();
  addDuplicateError(errors, seen, normalizedId, path);
  const accepted = parseQuantity(
    line.acceptedQuantity,
    true,
    `${path}.accepted_quantity`,
    errors,
  );
  const rejected = parseQuantity(
    line.rejectedQuantity,
    true,
    `${path}.rejected_quantity`,
    errors,
  );
  const item = itemById.get(normalizedId);
  if (!item) {
    errors.push({
      path: `${path}.purchase_order_item_id`,
      message: "采购单明细不存在",
    });
  }
  if (accepted === null || rejected === null) return;

  const total = accepted + rejected;
  if (total === ZERO_QUANTITY) {
    errors.push({ path, message: "本次收货数量必须大于 0" });
  } else if (item) {
    addRemainingError(errors, total, receiptRemaining(item), path, "收货");
  }
  validateVarianceReason(line, rejected, path, errors);
}

function validateVarianceReason(
  line: ReceiptLineDraft,
  rejected: bigint,
  path: string,
  errors: FulfillmentValidationError[],
) {
  const reason = line.varianceReason;
  const trimmedReason = reason?.trim() ?? "";
  if (rejected > ZERO_QUANTITY && !trimmedReason) {
    errors.push({
      path: `${path}.variance_reason`,
      message: "存在拒收数量时必须填写差异原因",
    });
  } else if (rejected === ZERO_QUANTITY && trimmedReason) {
    errors.push({
      path: `${path}.variance_reason`,
      message: "无拒收数量时差异原因必须为空",
    });
  }
  if (trimmedReason.length > 500) {
    errors.push({
      path: `${path}.variance_reason`,
      message: "差异原因不能超过 500 个字符",
    });
  }
}

function parseQuantity(
  value: string,
  allowZero: boolean,
  path: string,
  errors: FulfillmentValidationError[],
): bigint | null {
  const text = value.trim();
  if (/^-/.test(text)) {
    errors.push({
      path,
      message: allowZero ? "履约数量不能小于 0" : "履约数量必须大于 0",
    });
    return null;
  }
  const matched = /^(\d+)(?:\.(\d+))?$/.exec(text);
  if (!matched) {
    errors.push({ path, message: "履约数量必须是有效数字" });
    return null;
  }
  const decimals = matched[2] ?? "";
  if (decimals.length > QUANTITY_SCALE) {
    errors.push({ path, message: "履约数量最多保留 4 位小数" });
    return null;
  }
  const units = BigInt(matched[1]!) * QUANTITY_FACTOR +
    BigInt(decimals.padEnd(QUANTITY_SCALE, "0") || "0");
  if ((!allowZero && units === ZERO_QUANTITY) || units < ZERO_QUANTITY) {
    errors.push({ path, message: "履约数量必须大于 0" });
    return null;
  }
  if (units > MAX_QUANTITY_UNITS) {
    errors.push({ path, message: "履约数量超过数据库上限" });
    return null;
  }
  if (parseStoredQuantity(String(Number(text))) !== units) {
    errors.push({ path, message: "履约数量无法按 4 位小数安全提交" });
    return null;
  }
  return units;
}

function addRemainingError(
  errors: FulfillmentValidationError[],
  quantity: bigint,
  remaining: string,
  path: string,
  operation: "发货" | "收货",
) {
  const remainingUnits = parseStoredQuantity(remaining) ?? ZERO_QUANTITY;
  if (quantity > remainingUnits) {
    errors.push({
      path: operation === "收货" ? path : `${path}.quantity`,
      message: `${operation}数量不能超过剩余可${operation === "发货" ? "发" : "收"}数量 ${remaining}`,
    });
  }
}

function lineCountErrors(
  count: number,
  operation: "发货" | "收货",
): FulfillmentValidationError[] {
  if (count === 0) {
    return [{ path: "items", message: `${operation}至少需要一个明细` }];
  }
  if (count > MAX_EVENT_LINES) {
    return [{
      path: "items",
      message: `${operation}明细不能超过 ${MAX_EVENT_LINES} 行`,
    }];
  }
  return [];
}

function addDuplicateError(
  errors: FulfillmentValidationError[],
  seen: Set<string>,
  normalizedId: string,
  path: string,
) {
  if (seen.has(normalizedId)) {
    errors.push({
      path: `${path}.purchase_order_item_id`,
      message: "同一采购单明细不能重复添加",
    });
  }
  seen.add(normalizedId);
}

function fulfillmentItemMap(items: readonly PurchaseOrderItemFulfillment[]) {
  return new Map(
    items.map((item) => [
      item.supplier_purchase_order_item_id.toLowerCase(),
      item,
    ]),
  );
}

function remainingQuantity(total: string, used: string): string {
  return formatQuantity(remainingUnits(total, used));
}

function remainingUnits(total: string, used: string): bigint {
  const totalUnits = parseStoredQuantity(total);
  const usedUnits = parseStoredQuantity(used);
  if (totalUnits === null || usedUnits === null || usedUnits >= totalUnits) {
    return ZERO_QUANTITY;
  }
  return totalUnits - usedUnits;
}

function parseStoredQuantity(value: string): bigint | null {
  const matched = /^(\d+)(?:\.(\d{1,4}))?$/.exec(value);
  if (!matched) return null;
  return BigInt(matched[1]!) * QUANTITY_FACTOR +
    BigInt((matched[2] ?? "").padEnd(QUANTITY_SCALE, "0") || "0");
}

function formatQuantity(units: bigint): string {
  const integer = units / QUANTITY_FACTOR;
  const decimals = (units % QUANTITY_FACTOR).toString()
    .padStart(QUANTITY_SCALE, "0")
    .replace(/0+$/, "");
  return decimals ? `${integer}.${decimals}` : integer.toString();
}

function optionalText(value: string | null | undefined): string | null {
  return value?.trim() || null;
}
