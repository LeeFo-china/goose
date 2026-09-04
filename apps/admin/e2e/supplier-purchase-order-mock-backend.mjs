import { createServer } from "node:http";

import {
  currentServiceAccessSummary,
  ids,
  initialCatalog,
  now,
  project,
  relationship,
  session,
} from "./supplier-purchase-order-mock-fixture.mjs";

const port = Number.parseInt(
  process.env.SUPPLIER_PURCHASE_ORDER_MOCK_BACKEND_PORT || "3997",
  10,
);
const MOCK_REQUEST_ID = "supplier-purchase-order-mock-request";
const BUSINESS_ERRORS = {
  SUPPLIER_IDEMPOTENCY_CONFLICT: [409, "幂等键已用于其他供应商操作"],
  SUPPLIER_PURCHASE_ORDER_NOT_FOUND: [404, "供应商采购单不存在"],
  SUPPLIER_PURCHASE_ORDER_ITEM_NOT_FOUND: [404, "供应商采购单明细不存在"],
  SUPPLIER_PURCHASE_ORDER_VERSION_CONFLICT: [
    409,
    "采购单版本已变化，请刷新后重试",
  ],
  SUPPLIER_PURCHASE_ORDER_STATE_CONFLICT: [
    409,
    "采购单当前状态不允许该操作",
  ],
  SUPPLIER_PURCHASE_ORDER_PRICE_CHANGED: [
    409,
    "采购价格已变化，请重新确认采购单",
  ],
  SUPPLIER_PURCHASE_ORDER_FULFILLMENT_NOT_CONFIRMED: [
    409,
    "供应商采购单尚未确认履约",
  ],
  SUPPLIER_PURCHASE_ORDER_FULFILLMENT_ALREADY_CONFIRMED: [
    409,
    "供应商采购单已确认履约",
  ],
  SUPPLIER_PURCHASE_ORDER_FULFILLMENT_STATE_CONFLICT: [
    409,
    "采购履约当前状态不允许该操作",
  ],
  SUPPLIER_PURCHASE_ORDER_FULFILLMENT_VERSION_CONFLICT: [
    409,
    "采购履约版本已变化，请刷新后重试",
  ],
  SUPPLIER_PURCHASE_ORDER_SHIPMENT_ID_CONFLICT: [
    409,
    "采购发货记录编号已存在",
  ],
  SUPPLIER_PURCHASE_ORDER_RECEIPT_ID_CONFLICT: [
    409,
    "采购收货记录编号已存在",
  ],
  SUPPLIER_PURCHASE_ORDER_FULFILLMENT_STARTED: [
    409,
    "采购履约已开始，不能取消采购单",
  ],
  SUPPLIER_PURCHASE_ORDER_OVER_SHIPPED: [
    409,
    "本次发货数量超过采购数量",
  ],
  SUPPLIER_PURCHASE_ORDER_OVER_RECEIVED: [
    409,
    "本次收货数量超过累计发货数量",
  ],
};

let state;
reset();

function reset(scenario = "empty") {
  state = {
    catalog: initialCatalog(),
    order: null,
    items: [],
    fulfillment: null,
    itemFulfillments: [],
    shipments: [],
    receipts: [],
    journal: [],
    idempotency: new Map(),
    priceChangeTriggered: false,
  };
  if (scenario === "legacy-draft") seedLegacyDraft();
}

function sendJson(response, status, payload) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(payload));
}

function sendData(response, data, status = 200) {
  sendJson(response, status, { success: true, data });
}

function sendError(response, status, code, message, details) {
  sendJson(response, status, {
    success: false,
    code,
    message,
    requestId: MOCK_REQUEST_ID,
    ...(details === undefined ? {} : { details }),
  });
}

function sendBusinessError(response, code, details) {
  const definition = BUSINESS_ERRORS[code];
  if (!definition) throw new TypeError(`Unknown mock business error: ${code}`);
  sendError(response, definition[0], code, definition[1], details);
}

function validationIssue(path, message) {
  return { code: "custom", path, message };
}

function sendControllerValidation(response, issue) {
  const field = issue.path.join(".");
  sendError(
    response,
    400,
    "VALIDATION_ERROR",
    field ? `字段 [${field}] 校验失败: ${issue.message}` : issue.message,
    [issue],
  );
}

function parsePagination(url) {
  const rawPage = url.searchParams.get("page") ?? "1";
  const rawPageSize = url.searchParams.get("pageSize") ?? "20";
  const page = Number(rawPage);
  const pageSize = Number(rawPageSize);
  if (
    !Number.isSafeInteger(page) ||
    page < 1 ||
    !Number.isSafeInteger(pageSize) ||
    pageSize < 1 ||
    pageSize > 100
  ) {
    return null;
  }
  return { page, pageSize };
}

function sendPage(response, url, records, searchableFields = []) {
  const pagination = parsePagination(url);
  if (!pagination) {
    sendError(
      response,
      400,
      "VALIDATION_ERROR",
      "分页参数必须为正整数，且 pageSize 不得超过 100",
    );
    return;
  }
  const keyword = (url.searchParams.get("keyword") || "").trim().toLowerCase();
  const filtered = keyword
    ? records.filter((record) =>
      searchableFields.some((field) =>
        String(record[field] ?? "").toLowerCase().includes(keyword)
      )
    )
    : records;
  const start = (pagination.page - 1) * pagination.pageSize;
  sendData(response, {
    list: filtered.slice(start, start + pagination.pageSize),
    pagination: {
      ...pagination,
      total: filtered.length,
      totalPages: filtered.length
        ? Math.ceil(filtered.length / pagination.pageSize)
        : 0,
    },
  });
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => {
      try {
        const text = Buffer.concat(chunks).toString("utf8");
        resolve(text ? JSON.parse(text) : {});
      } catch (error) {
        reject(error);
      }
    });
  });
}

function idempotencyKey(request) {
  const value = request.headers["idempotency-key"];
  return Array.isArray(value) ? value[0] : value ?? null;
}

function requireIdempotency(request, response) {
  const key = idempotencyKey(request);
  if (key?.trim() && key.trim().length <= 120) return key.trim();
  sendError(
    response,
    400,
    "VALIDATION_ERROR",
    "缺少有效的 Idempotency-Key",
  );
  return null;
}

function fingerprint(url, payload) {
  return `${url.pathname}:${JSON.stringify(payload)}`;
}

function replayIdempotent(
  response,
  key,
  fingerprintValue,
  markReplay = false,
  attempt = null,
) {
  const previous = state.idempotency.get(key);
  if (!previous) return false;
  if (previous.fingerprint !== fingerprintValue) {
    if (attempt) {
      sendCommandError(response, attempt, "SUPPLIER_IDEMPOTENCY_CONFLICT");
    } else {
      sendBusinessError(response, "SUPPLIER_IDEMPOTENCY_CONFLICT");
    }
    return true;
  }
  const payload = structuredClone(previous.payload);
  if (markReplay && payload?.success && payload.data) {
    payload.data.idempotent = true;
  }
  if (attempt) finishCommandAttempt(attempt, "idempotent_replay");
  sendJson(response, previous.status, payload);
  return true;
}

function rememberIdempotent(key, fingerprintValue, status, payload) {
  state.idempotency.set(key, {
    fingerprint: fingerprintValue,
    status,
    payload: structuredClone(payload),
  });
}

function recordCommand(request, url, payload, outcome) {
  const entry = {
    method: request.method,
    path: url.pathname,
    idempotencyKey: idempotencyKey(request),
    payload: structuredClone(payload),
    outcome,
  };
  state.journal.push(entry);
  return entry;
}

function finishCommandAttempt(attempt, outcome) {
  attempt.outcome = outcome;
}

function sendCommandError(response, attempt, code, details) {
  finishCommandAttempt(attempt, code);
  sendBusinessError(response, code, details);
}

function orderWithReferences(order = state.order) {
  return order
    ? {
      ...structuredClone(order),
      fulfillment_status: orderListFulfillmentStatus(order),
      project: {
        id: project.id,
        name: project.name,
        status: project.status,
      },
      supplier: structuredClone(relationship.supplier),
      purchase_requisition: null,
    }
    : null;
}

function orderListFulfillmentStatus(order = state.order) {
  if (!order) return "unconfirmed";
  if (order.status === "cancelled") return "cancelled";
  return state.fulfillment?.status ?? "unconfirmed";
}

const QUANTITY_FACTOR = 10_000n;
const RATE_FACTOR = 1_000_000n;

function parseFixedDecimal(value, scale) {
  const match = /^(\d+)(?:\.(\d+))?$/.exec(String(value));
  if (!match || (match[2]?.length ?? 0) > scale) return null;
  return BigInt(match[1]) * 10n ** BigInt(scale) +
    BigInt((match[2] || "").padEnd(scale, "0") || "0");
}

function roundPositive(numerator, denominator) {
  return (numerator + denominator / 2n) / denominator;
}

function moneyText(cents) {
  return `${cents / 100n}.${String(cents % 100n).padStart(2, "0")}`;
}

function moneyCents(value) {
  const cents = parseFixedDecimal(value, 2);
  if (cents === null) throw new TypeError(`Invalid fixture money: ${value}`);
  return cents;
}

function computeAmounts(catalogItem, quantity) {
  const quantityValue = typeof quantity === "bigint"
    ? quantity
    : parseFixedDecimal(quantity, 4);
  const unitPrice = parseFixedDecimal(catalogItem.unit_price, 2);
  const taxRate = parseFixedDecimal(catalogItem.tax_rate, 6);
  if (quantityValue === null || unitPrice === null || taxRate === null) {
    throw new TypeError("Invalid fixture amount input");
  }
  const gross = roundPositive(quantityValue * unitPrice, QUANTITY_FACTOR);
  const subtotal = catalogItem.tax_inclusive
    ? roundPositive(gross * RATE_FACTOR, RATE_FACTOR + taxRate)
    : gross;
  const tax = catalogItem.tax_inclusive
    ? gross - subtotal
    : roundPositive(subtotal * taxRate, RATE_FACTOR);
  const total = subtotal + tax;
  return {
    subtotal: moneyText(subtotal),
    tax: moneyText(tax),
    total: moneyText(total),
  };
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TERMINAL_FULFILLMENT_STATUSES = new Set([
  "received",
  "received_with_variance",
  "cancelled",
]);

function optionalText(value, maximum) {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  if (normalized.length > maximum) return undefined;
  return normalized || null;
}

function validDateTime(value) {
  return typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/
      .test(value) &&
    !Number.isNaN(new Date(value).getTime());
}

function quantityUnits(value, allowZero) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const text = String(value);
  const match = /^(\d{1,14})(?:\.(\d{1,4}))?$/.exec(text);
  if (!match) return null;
  const units = BigInt(match[1]) * QUANTITY_FACTOR +
    BigInt((match[2] || "").padEnd(4, "0") || "0");
  if ((!allowZero && units === 0n) || units >= 1_000_000_000_000_000_000n) {
    return null;
  }
  return units;
}

function storedUnits(value) {
  const match = /^(\d+)(?:\.(\d{1,4}))?$/.exec(String(value));
  if (!match) throw new TypeError(`Invalid fixture quantity: ${value}`);
  return BigInt(match[1]) * QUANTITY_FACTOR +
    BigInt((match[2] || "").padEnd(4, "0") || "0");
}

function quantityText(units) {
  const whole = units / QUANTITY_FACTOR;
  const decimal = String(units % QUANTITY_FACTOR).padStart(4, "0")
    .replace(/0+$/, "");
  return decimal ? `${whole}.${decimal}` : String(whole);
}

function objectShapeIssue(value, required, optional = []) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return validationIssue([], "请求参数必须是对象");
  }
  const keys = Object.keys(value);
  const missing = required.find((key) => !keys.includes(key));
  if (missing) return validationIssue([missing], "必填字段缺失");
  const allowed = new Set([...required, ...optional]);
  const unknown = keys.find((key) => !allowed.has(key));
  return unknown
    ? validationIssue([], `无法识别的字段: ${unknown}`)
    : null;
}

function validateOrderId(orderId) {
  return UUID_PATTERN.test(orderId)
    ? null
    : validationIssue(["id"], "无效的供应商采购单 ID");
}

function expectedVersionIssue(value, path = ["expected_version"]) {
  return Number.isSafeInteger(value) && value > 0
    ? null
    : validationIssue(path, "版本号必须是正整数");
}

function coerceExpectedVersion(payload, allowZero = false) {
  const value = Number(payload.expected_version);
  if (
    !Number.isSafeInteger(value) ||
    (allowZero ? value < 0 : value <= 0)
  ) {
    return validationIssue(
      ["expected_version"],
      allowZero ? "版本号不能为负数" : "版本号必须是正整数",
    );
  }
  payload.expected_version = value;
  return null;
}

function validateOptionalText(value, maximum, path) {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") return validationIssue(path, "必须是字符串");
  return value.trim().length <= maximum
    ? null
    : validationIssue(path, `不能超过 ${maximum} 个字符`);
}

function validateRequiredText(value, minimum, maximum, path) {
  if (typeof value !== "string") return validationIssue(path, "必须是字符串");
  const length = value.trim().length;
  if (length < minimum) return validationIssue(path, "不能为空");
  return length <= maximum
    ? null
    : validationIssue(path, `不能超过 ${maximum} 个字符`);
}

function validateFulfillmentDateTime(value, path) {
  return validDateTime(value)
    ? null
    : validationIssue(path, "履约时间格式无效");
}

function validateConfirmBody(payload) {
  return objectShapeIssue(
    payload,
    ["expected_version", "confirmed_at"],
    ["remark"],
  ) ||
    expectedVersionIssue(payload.expected_version) ||
    validateFulfillmentDateTime(payload.confirmed_at, ["confirmed_at"]) ||
    validateOptionalText(payload.remark, 500, ["remark"]);
}

function validateShipmentBody(payload) {
  const headerIssue = objectShapeIssue(
    payload,
    [
      "id",
      "expected_fulfillment_version",
      "shipment_no",
      "shipped_at",
      "items",
    ],
    ["carrier_name", "tracking_no", "remark"],
  );
  if (headerIssue) return headerIssue;
  if (!UUID_PATTERN.test(payload.id)) {
    return validationIssue(["id"], "无效的发货 ID");
  }
  const versionIssue = expectedVersionIssue(
    payload.expected_fulfillment_version,
    ["expected_fulfillment_version"],
  );
  if (versionIssue) return versionIssue;
  const textIssue =
    validateRequiredText(payload.shipment_no, 1, 80, ["shipment_no"]) ||
    validateOptionalText(payload.carrier_name, 100, ["carrier_name"]) ||
    validateOptionalText(payload.tracking_no, 120, ["tracking_no"]) ||
    validateFulfillmentDateTime(payload.shipped_at, ["shipped_at"]) ||
    validateOptionalText(payload.remark, 500, ["remark"]);
  if (textIssue) return textIssue;
  if (
    !Array.isArray(payload.items) ||
    payload.items.length < 1 ||
    payload.items.length > 100
  ) {
    return validationIssue(["items"], "发货明细数量必须为 1 到 100 行");
  }
  const seen = new Set();
  for (const [index, line] of payload.items.entries()) {
    const path = ["items", index];
    const shapeIssue = objectShapeIssue(
      line,
      ["purchase_order_item_id", "quantity"],
    );
    if (shapeIssue) return { ...shapeIssue, path: [...path, ...shapeIssue.path] };
    const itemId = typeof line.purchase_order_item_id === "string"
      ? line.purchase_order_item_id.toLowerCase()
      : "";
    if (!UUID_PATTERN.test(itemId)) {
      return validationIssue(
        [...path, "purchase_order_item_id"],
        "无效的供应商采购单明细 ID",
      );
    }
    if (seen.has(itemId)) {
      return validationIssue(
        [...path, "purchase_order_item_id"],
        "同一采购单明细不能重复添加",
      );
    }
    seen.add(itemId);
    if (quantityUnits(line.quantity, false) === null) {
      return validationIssue([...path, "quantity"], "履约数量无效");
    }
  }
  return null;
}

function validateReceiptBody(payload) {
  const headerIssue = objectShapeIssue(
    payload,
    [
      "id",
      "expected_fulfillment_version",
      "receipt_no",
      "received_at",
      "items",
    ],
    ["remark"],
  );
  if (headerIssue) return headerIssue;
  if (!UUID_PATTERN.test(payload.id)) {
    return validationIssue(["id"], "无效的收货 ID");
  }
  const versionIssue = expectedVersionIssue(
    payload.expected_fulfillment_version,
    ["expected_fulfillment_version"],
  );
  if (versionIssue) return versionIssue;
  const textIssue =
    validateRequiredText(payload.receipt_no, 1, 80, ["receipt_no"]) ||
    validateFulfillmentDateTime(payload.received_at, ["received_at"]) ||
    validateOptionalText(payload.remark, 500, ["remark"]);
  if (textIssue) return textIssue;
  if (
    !Array.isArray(payload.items) ||
    payload.items.length < 1 ||
    payload.items.length > 100
  ) {
    return validationIssue(["items"], "收货明细数量必须为 1 到 100 行");
  }
  const seen = new Set();
  for (const [index, line] of payload.items.entries()) {
    const path = ["items", index];
    const shapeIssue = objectShapeIssue(
      line,
      [
        "purchase_order_item_id",
        "accepted_quantity",
        "rejected_quantity",
      ],
      ["variance_reason"],
    );
    if (shapeIssue) return { ...shapeIssue, path: [...path, ...shapeIssue.path] };
    const itemId = typeof line.purchase_order_item_id === "string"
      ? line.purchase_order_item_id.toLowerCase()
      : "";
    if (!UUID_PATTERN.test(itemId)) {
      return validationIssue(
        [...path, "purchase_order_item_id"],
        "无效的供应商采购单明细 ID",
      );
    }
    if (seen.has(itemId)) {
      return validationIssue(
        [...path, "purchase_order_item_id"],
        "同一采购单明细不能重复添加",
      );
    }
    seen.add(itemId);
    const accepted = quantityUnits(line.accepted_quantity, true);
    const rejected = quantityUnits(line.rejected_quantity, true);
    if (accepted === null || rejected === null) {
      return validationIssue(path, "履约数量无效");
    }
    if (accepted + rejected === 0n) {
      return validationIssue(path, "本次收货数量必须大于 0");
    }
    const reasonIssue = validateOptionalText(
      line.variance_reason,
      500,
      [...path, "variance_reason"],
    );
    if (reasonIssue) return reasonIssue;
    const reason = typeof line.variance_reason === "string"
      ? line.variance_reason.trim()
      : line.variance_reason;
    if (rejected > 0n && !reason) {
      return validationIssue(
        [...path, "variance_reason"],
        "存在拒收数量时必须填写差异原因",
      );
    }
    if (rejected === 0n && reason != null) {
      return validationIssue(
        [...path, "variance_reason"],
        "无拒收数量时差异原因必须为空",
      );
    }
  }
  return null;
}

function validateCancelBody(payload) {
  return objectShapeIssue(payload, ["expected_version", "reason"]) ||
    coerceExpectedVersion(payload) ||
    validateRequiredText(payload.reason, 2, 500, ["reason"]);
}

function validateDraftBody(payload) {
  const shapeIssue = objectShapeIssue(
    payload,
    ["project_id", "tenant_supplier_id", "expected_version", "items"],
    ["expected_delivery_date", "remark"],
  );
  if (shapeIssue) return shapeIssue;
  if (!UUID_PATTERN.test(payload.project_id)) {
    return validationIssue(["project_id"], "无效的项目 ID");
  }
  if (!UUID_PATTERN.test(payload.tenant_supplier_id)) {
    return validationIssue(
      ["tenant_supplier_id"],
      "无效的租户供应商关系 ID",
    );
  }
  const versionIssue = coerceExpectedVersion(payload, true);
  if (versionIssue) return versionIssue;
  if (
    payload.expected_delivery_date != null &&
    (
      typeof payload.expected_delivery_date !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(payload.expected_delivery_date)
    )
  ) {
    return validationIssue(
      ["expected_delivery_date"],
      "预计交付日期格式无效",
    );
  }
  if (payload.remark != null) {
    const remarkIssue = validateRequiredText(
      payload.remark,
      1,
      1000,
      ["remark"],
    );
    if (remarkIssue) return remarkIssue;
  }
  if (
    !Array.isArray(payload.items) ||
    payload.items.length < 1 ||
    payload.items.length > 100
  ) {
    return validationIssue(["items"], "采购单明细数量必须为 1 到 100 行");
  }
  const seen = new Set();
  for (const [index, line] of payload.items.entries()) {
    const path = ["items", index];
    const lineShapeIssue = objectShapeIssue(
      line,
      ["supplier_sku_id", "quantity"],
    );
    if (lineShapeIssue) {
      return {
        ...lineShapeIssue,
        path: [...path, ...lineShapeIssue.path],
      };
    }
    const skuId = typeof line.supplier_sku_id === "string"
      ? line.supplier_sku_id.toLowerCase()
      : "";
    if (!UUID_PATTERN.test(skuId)) {
      return validationIssue(
        [...path, "supplier_sku_id"],
        "无效的供应商 SKU ID",
      );
    }
    if (seen.has(skuId)) {
      return validationIssue(
        [...path, "supplier_sku_id"],
        "同一 SKU 不能重复添加",
      );
    }
    seen.add(skuId);
    if (quantityUnits(line.quantity, false) === null) {
      return validationIssue([...path, "quantity"], "采购数量无效");
    }
  }
  return null;
}

function validateSubmitBody(payload) {
  return objectShapeIssue(payload, ["expected_version"]) ||
    coerceExpectedVersion(payload);
}

function deriveFulfillmentStatus() {
  const items = state.itemFulfillments;
  if (items.every((item) =>
    storedUnits(item.received_quantity) === storedUnits(item.ordered_quantity)
  )) {
    return items.some((item) => storedUnits(item.rejected_quantity) > 0n)
      ? "received_with_variance"
      : "received";
  }
  if (items.some((item) => storedUnits(item.received_quantity) > 0n)) {
    return "partially_received";
  }
  if (items.every((item) =>
    storedUnits(item.shipped_quantity) === storedUnits(item.ordered_quantity)
  )) {
    return "shipped";
  }
  return items.some((item) => storedUnits(item.shipped_quantity) > 0n)
    ? "partially_shipped"
    : "confirmed";
}

function fulfillmentCommandData(status, idempotent = false) {
  return {
    status,
    idempotent,
    purchase_order: structuredClone(state.order),
    fulfillment: structuredClone(state.fulfillment),
    version: state.fulfillment.version,
  };
}

function acceptedAmountTotals() {
  const subtotal = state.itemFulfillments.reduce(
    (sum, item) => sum + moneyCents(item.accepted_subtotal_amount),
    0n,
  );
  const tax = state.itemFulfillments.reduce(
    (sum, item) => sum + moneyCents(item.accepted_tax_amount),
    0n,
  );
  return {
    subtotal_amount: moneyText(subtotal),
    tax_amount: moneyText(tax),
    total_amount: moneyText(subtotal + tax),
  };
}

function buildItem(catalogItem, quantity, lineNo, orderId) {
  const amounts = computeAmounts(catalogItem, quantity);
  return {
    id: `${orderId.slice(0, -2)}${String(lineNo).padStart(2, "0")}`,
    tenant_id: ids.tenant,
    supplier_id: ids.supplier,
    supplier_purchase_order_id: orderId,
    line_no: lineNo,
    supplier_product_id: catalogItem.supplier_product_id,
    supplier_sku_id: catalogItem.supplier_sku_id,
    supplier_price_list_id: catalogItem.supplier_price_list_id,
    supplier_price_list_item_id: catalogItem.supplier_price_list_item_id,
    product_code_snapshot: catalogItem.product_code,
    product_name_snapshot: catalogItem.product_name,
    sku_code_snapshot: catalogItem.sku_code,
    sku_name_snapshot: catalogItem.sku_name,
    specification_snapshot: catalogItem.specification,
    model_snapshot: catalogItem.model,
    purchase_unit_id: catalogItem.purchase_unit_id,
    purchase_unit_code_snapshot: catalogItem.purchase_unit_code,
    purchase_unit_name_snapshot: catalogItem.purchase_unit_name,
    purchase_unit_symbol_snapshot: catalogItem.purchase_unit_symbol,
    base_unit_id: catalogItem.base_unit_id,
    base_unit_code_snapshot: catalogItem.base_unit_code,
    base_unit_name_snapshot: catalogItem.base_unit_name,
    base_unit_symbol_snapshot: catalogItem.base_unit_symbol,
    base_unit_conversion: catalogItem.base_unit_conversion,
    price_list_code_snapshot: catalogItem.price_list_code,
    price_list_version_snapshot: catalogItem.price_list_version,
    price_effective_from_snapshot: catalogItem.effective_from,
    price_effective_until_snapshot: catalogItem.effective_until,
    quantity: String(quantity),
    unit_price: catalogItem.unit_price,
    tax_rate: catalogItem.tax_rate,
    tax_inclusive: catalogItem.tax_inclusive,
    subtotal_amount: amounts.subtotal,
    tax_amount: amounts.tax,
    total_amount: amounts.total,
    created_at: now,
    updated_at: now,
  };
}

function seedLegacyDraft() {
  const [tile, grout] = state.catalog;
  if (!tile || !grout) throw new TypeError("Legacy draft catalog is missing");
  const items = [
    buildItem(tile, 2.5, 1, ids.legacyOrder),
    buildItem(grout, 1.3333, 2, ids.legacyOrder),
  ];
  const subtotal = items.reduce(
    (sum, item) => sum + moneyCents(item.subtotal_amount),
    0n,
  );
  const tax = items.reduce(
    (sum, item) => sum + moneyCents(item.tax_amount),
    0n,
  );
  state.order = {
    id: ids.legacyOrder,
    tenant_id: ids.tenant,
    project_id: project.id,
    tenant_supplier_id: relationship.id,
    supplier_id: ids.supplier,
    order_no: "PO-E2E-0001",
    status: "draft",
    currency: "CNY",
    expected_delivery_date: null,
    remark: "E2E 历史采购单草稿",
    priced_at: now,
    subtotal_amount: moneyText(subtotal),
    tax_amount: moneyText(tax),
    total_amount: moneyText(subtotal + tax),
    purchase_requisition_id: null,
    version: 1,
    created_by_employee_id: ids.employee,
    updated_by_employee_id: ids.employee,
    submitted_by_employee_id: null,
    submitted_at: null,
    cancelled_by_employee_id: null,
    cancelled_at: null,
    cancel_reason: null,
    created_at: now,
    updated_at: now,
  };
  state.items = items;
}

function validateExpectedVersion(response, expectedVersion) {
  const currentVersion = state.order?.version ?? 0;
  if (expectedVersion === currentVersion) return true;
  sendError(
    response,
    409,
    "SUPPLIER_PURCHASE_ORDER_VERSION_CONFLICT",
    "采购单版本已变化",
    {
      current_version: currentVersion,
      current_status: state.order?.status ?? null,
    },
  );
  return false;
}

async function saveDraft(request, response, url, orderId) {
  const key = requireIdempotency(request, response);
  if (!key) return;
  const pathIssue = validateOrderId(orderId);
  if (pathIssue) return sendControllerValidation(response, pathIssue);
  const payload = await readBody(request);
  const bodyIssue = validateDraftBody(payload);
  if (bodyIssue) return sendControllerValidation(response, bodyIssue);
  const fingerprintValue = fingerprint(url, payload);
  if (replayIdempotent(response, key, fingerprintValue)) return;
  if (!validateExpectedVersion(response, payload.expected_version)) return;
  if (
    state.order &&
    (state.order.id !== orderId || state.order.status !== "draft")
  ) {
    return sendError(
      response,
      409,
      "SUPPLIER_PURCHASE_ORDER_STATE_CONFLICT",
      BUSINESS_ERRORS.SUPPLIER_PURCHASE_ORDER_STATE_CONFLICT[1],
    );
  }
  if (
    payload.project_id !== project.id ||
    payload.tenant_supplier_id !== relationship.id
  ) {
    return sendControllerValidation(
      response,
      validationIssue([], "采购单关联参数无效"),
    );
  }
  const seenSkuIds = new Set();
  const nextItems = [];
  for (const [index, line] of payload.items.entries()) {
    const allowedKeys = Object.keys(line).sort().join(",");
    const catalogItem = state.catalog.find(
      ({ supplier_sku_id: skuId }) => skuId === line.supplier_sku_id,
    );
    if (
      allowedKeys !== "quantity,supplier_sku_id" ||
      !catalogItem ||
      seenSkuIds.has(line.supplier_sku_id) ||
      typeof line.quantity !== "number" ||
      !Number.isFinite(line.quantity) ||
      line.quantity <= 0
    ) {
      return sendError(
        response,
        400,
        "VALIDATION_ERROR",
        "采购单明细参数无效",
      );
    }
    seenSkuIds.add(line.supplier_sku_id);
    nextItems.push(buildItem(catalogItem, line.quantity, index + 1, orderId));
  }

  const subtotal = nextItems.reduce(
    (sum, item) => sum + moneyCents(item.subtotal_amount),
    0n,
  );
  const tax = nextItems.reduce(
    (sum, item) => sum + moneyCents(item.tax_amount),
    0n,
  );
  const total = subtotal + tax;
  const version = (state.order?.version ?? 0) + 1;
  state.order = {
    id: orderId,
    tenant_id: ids.tenant,
    project_id: project.id,
    tenant_supplier_id: relationship.id,
    supplier_id: ids.supplier,
    order_no: "PO-E2E-0001",
    status: "draft",
    currency: "CNY",
    expected_delivery_date: payload.expected_delivery_date ?? null,
    remark: payload.remark ?? null,
    priced_at: now,
    subtotal_amount: moneyText(subtotal),
    tax_amount: moneyText(tax),
    total_amount: moneyText(total),
    purchase_requisition_id: null,
    version,
    created_by_employee_id: ids.employee,
    updated_by_employee_id: ids.employee,
    submitted_by_employee_id: null,
    submitted_at: null,
    cancelled_by_employee_id: null,
    cancelled_at: null,
    cancel_reason: null,
    created_at: now,
    updated_at: now,
  };
  state.items = nextItems;
  recordCommand(request, url, payload, "saved");
  const responsePayload = {
    success: true,
    data: {
      status: "saved",
      idempotent: false,
      purchase_order: structuredClone(state.order),
      version,
    },
  };
  rememberIdempotent(key, fingerprintValue, 200, responsePayload);
  sendJson(response, 200, responsePayload);
}

async function submitOrder(request, response, url, orderId) {
  const key = requireIdempotency(request, response);
  if (!key) return;
  const pathIssue = validateOrderId(orderId);
  if (pathIssue) return sendControllerValidation(response, pathIssue);
  const payload = await readBody(request);
  const bodyIssue = validateSubmitBody(payload);
  if (bodyIssue) return sendControllerValidation(response, bodyIssue);
  const fingerprintValue = fingerprint(url, payload);
  if (replayIdempotent(response, key, fingerprintValue)) return;
  if (
    !state.order ||
    state.order.id !== orderId ||
    state.order.status !== "draft"
  ) {
    return sendError(
      response,
      409,
      "SUPPLIER_PURCHASE_ORDER_STATE_CONFLICT",
      BUSINESS_ERRORS.SUPPLIER_PURCHASE_ORDER_STATE_CONFLICT[1],
    );
  }
  if (!validateExpectedVersion(response, payload.expected_version)) return;

  if (!state.priceChangeTriggered) {
    state.priceChangeTriggered = true;
    state.catalog[0] = {
      ...state.catalog[0],
      unit_price: "12.00",
      price_list_version: 2,
      supplier_price_list_item_id:
        "22000000-0000-4000-8000-000000000016",
    };
    recordCommand(request, url, payload, "price_changed");
    const responsePayload = {
      success: false,
      code: "SUPPLIER_PURCHASE_ORDER_PRICE_CHANGED",
      message: BUSINESS_ERRORS.SUPPLIER_PURCHASE_ORDER_PRICE_CHANGED[1],
      requestId: MOCK_REQUEST_ID,
    };
    rememberIdempotent(key, fingerprintValue, 409, responsePayload);
    return sendJson(response, 409, responsePayload);
  }

  const stale = state.items.some((item) => {
    const catalogItem = state.catalog.find(
      ({ supplier_sku_id: skuId }) => skuId === item.supplier_sku_id,
    );
    return !catalogItem ||
      catalogItem.supplier_price_list_item_id !==
        item.supplier_price_list_item_id ||
      catalogItem.unit_price !== item.unit_price;
  });
  if (stale) {
    return sendError(
      response,
      409,
      "SUPPLIER_PURCHASE_ORDER_PRICE_CHANGED",
      BUSINESS_ERRORS.SUPPLIER_PURCHASE_ORDER_PRICE_CHANGED[1],
    );
  }

  state.order.status = "submitted";
  state.order.version += 1;
  state.order.submitted_by_employee_id = ids.employee;
  state.order.submitted_at = now;
  state.order.updated_at = now;
  recordCommand(request, url, payload, "submitted");
  const responsePayload = {
    success: true,
    data: {
      status: "submitted",
      idempotent: false,
      purchase_order: structuredClone(state.order),
      version: state.order.version,
    },
  };
  rememberIdempotent(key, fingerprintValue, 200, responsePayload);
  sendJson(response, 200, responsePayload);
}

async function cancelOrder(request, response, url, orderId) {
  const key = requireIdempotency(request, response);
  if (!key) return;
  const pathIssue = validateOrderId(orderId);
  if (pathIssue) return sendControllerValidation(response, pathIssue);
  const payload = await readBody(request);
  const bodyIssue = validateCancelBody(payload);
  if (bodyIssue) return sendControllerValidation(response, bodyIssue);
  const attempt = recordCommand(request, url, payload, "attempted");
  const fingerprintValue = fingerprint(url, payload);
  if (replayIdempotent(
    response,
    key,
    fingerprintValue,
    true,
    attempt,
  )) return;
  if (!state.order || state.order.id !== orderId) {
    return sendCommandError(
      response,
      attempt,
      "SUPPLIER_PURCHASE_ORDER_NOT_FOUND",
    );
  }
  if (!["draft", "submitted"].includes(state.order.status)) {
    return sendCommandError(
      response,
      attempt,
      "SUPPLIER_PURCHASE_ORDER_STATE_CONFLICT",
    );
  }
  if (payload.expected_version !== state.order.version) {
    return sendCommandError(
      response,
      attempt,
      "SUPPLIER_PURCHASE_ORDER_VERSION_CONFLICT",
      { current_version: state.order.version },
    );
  }
  if (state.shipments.length > 0) {
    return sendCommandError(
      response,
      attempt,
      "SUPPLIER_PURCHASE_ORDER_FULFILLMENT_STARTED",
    );
  }
  state.order.status = "cancelled";
  state.order.version += 1;
  state.order.cancelled_by_employee_id = ids.employee;
  state.order.cancelled_at = now;
  state.order.cancel_reason = payload.reason.trim();
  state.order.updated_at = now;
  if (state.fulfillment) {
    state.fulfillment.status = "cancelled";
    state.fulfillment.version += 1;
    state.fulfillment.updated_at = now;
  }
  finishCommandAttempt(attempt, "cancelled");
  const responsePayload = {
    success: true,
    data: {
      status: "cancelled",
      idempotent: false,
      purchase_order: structuredClone(state.order),
      version: state.order.version,
    },
  };
  rememberIdempotent(key, fingerprintValue, 200, responsePayload);
  sendJson(response, 200, responsePayload);
}

async function confirmFulfillment(request, response, url, orderId) {
  const key = requireIdempotency(request, response);
  if (!key) return;
  const pathIssue = validateOrderId(orderId);
  if (pathIssue) return sendControllerValidation(response, pathIssue);
  const payload = await readBody(request);
  const bodyIssue = validateConfirmBody(payload);
  if (bodyIssue) return sendControllerValidation(response, bodyIssue);
  const attempt = recordCommand(request, url, payload, "attempted");
  const fingerprintValue = fingerprint(url, payload);
  if (replayIdempotent(
    response,
    key,
    fingerprintValue,
    true,
    attempt,
  )) return;
  if (!state.order || state.order.id !== orderId) {
    return sendCommandError(
      response,
      attempt,
      "SUPPLIER_PURCHASE_ORDER_NOT_FOUND",
    );
  }
  if (state.order.tenant_id !== ids.tenant || state.order.status !== "submitted") {
    return sendCommandError(
      response,
      attempt,
      "SUPPLIER_PURCHASE_ORDER_STATE_CONFLICT",
    );
  }
  if (payload.expected_version !== state.order.version) {
    return sendCommandError(
      response,
      attempt,
      "SUPPLIER_PURCHASE_ORDER_VERSION_CONFLICT",
    );
  }
  if (state.fulfillment) {
    return sendCommandError(
      response,
      attempt,
      "SUPPLIER_PURCHASE_ORDER_FULFILLMENT_ALREADY_CONFIRMED",
    );
  }
  const remark = optionalText(payload.remark, 500);

  state.fulfillment = {
    id: ids.fulfillment,
    tenant_id: ids.tenant,
    supplier_purchase_order_id: orderId,
    status: "confirmed",
    confirmed_at: new Date(payload.confirmed_at).toISOString(),
    confirmed_by_employee_id: ids.employee,
    confirmation_remark: remark,
    version: 1,
    created_at: now,
    updated_at: now,
  };
  state.itemFulfillments = state.items.map((item) => ({
    tenant_id: ids.tenant,
    supplier_purchase_order_fulfillment_id: ids.fulfillment,
    supplier_purchase_order_item_id: item.id,
    ordered_quantity: item.quantity,
    shipped_quantity: "0",
    received_quantity: "0",
    accepted_quantity: "0",
    rejected_quantity: "0",
    accepted_subtotal_amount: "0.00",
    accepted_tax_amount: "0.00",
    accepted_total_amount: "0.00",
    updated_at: now,
  }));
  finishCommandAttempt(attempt, "confirmed");
  const responsePayload = {
    success: true,
    data: fulfillmentCommandData("confirmed"),
  };
  rememberIdempotent(key, fingerprintValue, 200, responsePayload);
  sendJson(response, 200, responsePayload);
}

function requireActiveFulfillment(
  response,
  attempt,
  orderId,
  expectedVersion,
) {
  if (
    !state.order ||
    state.order.id !== orderId ||
    state.order.tenant_id !== ids.tenant
  ) {
    sendCommandError(
      response,
      attempt,
      "SUPPLIER_PURCHASE_ORDER_NOT_FOUND",
    );
    return false;
  }
  if (state.order.status !== "submitted") {
    sendCommandError(
      response,
      attempt,
      "SUPPLIER_PURCHASE_ORDER_STATE_CONFLICT",
    );
    return false;
  }
  if (!state.fulfillment) {
    sendCommandError(
      response,
      attempt,
      "SUPPLIER_PURCHASE_ORDER_FULFILLMENT_NOT_CONFIRMED",
    );
    return false;
  }
  if (TERMINAL_FULFILLMENT_STATUSES.has(state.fulfillment.status)) {
    sendCommandError(
      response,
      attempt,
      "SUPPLIER_PURCHASE_ORDER_FULFILLMENT_STATE_CONFLICT",
    );
    return false;
  }
  if (state.fulfillment.version !== expectedVersion) {
    sendCommandError(
      response,
      attempt,
      "SUPPLIER_PURCHASE_ORDER_FULFILLMENT_VERSION_CONFLICT",
    );
    return false;
  }
  return true;
}

function parseShipmentLines(payload) {
  const itemById = new Map(state.itemFulfillments.map((item) =>
    [item.supplier_purchase_order_item_id.toLowerCase(), item]
  ));
  const lines = [];
  for (const line of payload.items) {
    const itemId = line.purchase_order_item_id.toLowerCase();
    const quantity = quantityUnits(line?.quantity, false);
    if (quantity === null) throw new TypeError("Validated shipment quantity");
    const item = itemById.get(itemId);
    if (!item) {
      return { errorCode: "SUPPLIER_PURCHASE_ORDER_ITEM_NOT_FOUND" };
    }
    if (
      quantity >
      storedUnits(item.ordered_quantity) - storedUnits(item.shipped_quantity)
    ) {
      return { errorCode: "SUPPLIER_PURCHASE_ORDER_OVER_SHIPPED" };
    }
    lines.push({ item, quantity });
  }
  return { lines };
}

async function createShipment(request, response, url, orderId) {
  const key = requireIdempotency(request, response);
  if (!key) return;
  const pathIssue = validateOrderId(orderId);
  if (pathIssue) return sendControllerValidation(response, pathIssue);
  const payload = await readBody(request);
  const bodyIssue = validateShipmentBody(payload);
  if (bodyIssue) return sendControllerValidation(response, bodyIssue);
  const attempt = recordCommand(request, url, payload, "attempted");
  const fingerprintValue = fingerprint(url, payload);
  if (replayIdempotent(
    response,
    key,
    fingerprintValue,
    true,
    attempt,
  )) return;
  if (!requireActiveFulfillment(
    response,
    attempt,
    orderId,
    payload.expected_fulfillment_version,
  )) return;
  const parsed = parseShipmentLines(payload);
  if (parsed.errorCode) {
    return sendCommandError(response, attempt, parsed.errorCode);
  }
  if (
    state.shipments.some((shipment) =>
      shipment.id === payload.id ||
      shipment.shipment_no === payload.shipment_no.trim()
    )
  ) {
    return sendCommandError(
      response,
      attempt,
      "SUPPLIER_PURCHASE_ORDER_SHIPMENT_ID_CONFLICT",
    );
  }

  const shipmentItems = parsed.lines.map(({ item, quantity }) => {
    item.shipped_quantity = quantityText(
      storedUnits(item.shipped_quantity) + quantity,
    );
    item.updated_at = now;
    return {
      tenant_id: ids.tenant,
      shipment_id: payload.id,
      supplier_purchase_order_item_id:
        item.supplier_purchase_order_item_id,
      quantity: quantityText(quantity),
    };
  });
  state.shipments.push({
    id: payload.id,
    tenant_id: ids.tenant,
    supplier_purchase_order_id: orderId,
    shipment_no: payload.shipment_no.trim(),
    carrier_name: optionalText(payload.carrier_name, 100),
    tracking_no: optionalText(payload.tracking_no, 120),
    shipped_at: new Date(payload.shipped_at).toISOString(),
    remark: optionalText(payload.remark, 500),
    created_by_employee_id: ids.employee,
    created_at: now,
    items: shipmentItems,
  });
  state.fulfillment.status = deriveFulfillmentStatus();
  state.fulfillment.version += 1;
  state.fulfillment.updated_at = now;
  finishCommandAttempt(attempt, "shipment_created");
  const responsePayload = {
    success: true,
    data: fulfillmentCommandData("shipment_created"),
  };
  rememberIdempotent(key, fingerprintValue, 200, responsePayload);
  sendJson(response, 200, responsePayload);
}

function parseReceiptLines(payload) {
  const itemById = new Map(state.itemFulfillments.map((item) =>
    [item.supplier_purchase_order_item_id.toLowerCase(), item]
  ));
  const lines = [];
  for (const line of payload.items) {
    const itemId = line.purchase_order_item_id.toLowerCase();
    const accepted = quantityUnits(line?.accepted_quantity, true);
    const rejected = quantityUnits(line?.rejected_quantity, true);
    const reason = optionalText(line?.variance_reason, 500);
    if (accepted === null || rejected === null || reason === undefined) {
      throw new TypeError("Validated receipt line");
    }
    const total = accepted + rejected;
    const item = itemById.get(itemId);
    if (!item) {
      return { errorCode: "SUPPLIER_PURCHASE_ORDER_ITEM_NOT_FOUND" };
    }
    if (
      total >
        storedUnits(item.shipped_quantity) - storedUnits(item.received_quantity)
    ) {
      return { errorCode: "SUPPLIER_PURCHASE_ORDER_OVER_RECEIVED" };
    }
    lines.push({ item, accepted, rejected, reason });
  }
  return { lines };
}

async function createReceipt(request, response, url, orderId) {
  const key = requireIdempotency(request, response);
  if (!key) return;
  const pathIssue = validateOrderId(orderId);
  if (pathIssue) return sendControllerValidation(response, pathIssue);
  const payload = await readBody(request);
  const bodyIssue = validateReceiptBody(payload);
  if (bodyIssue) return sendControllerValidation(response, bodyIssue);
  const attempt = recordCommand(request, url, payload, "attempted");
  const fingerprintValue = fingerprint(url, payload);
  if (replayIdempotent(
    response,
    key,
    fingerprintValue,
    true,
    attempt,
  )) return;
  if (!requireActiveFulfillment(
    response,
    attempt,
    orderId,
    payload.expected_fulfillment_version,
  )) return;
  const parsed = parseReceiptLines(payload);
  if (parsed.errorCode) {
    return sendCommandError(response, attempt, parsed.errorCode);
  }
  if (
    state.receipts.some((receipt) =>
      receipt.id === payload.id ||
      receipt.receipt_no === payload.receipt_no.trim()
    )
  ) {
    return sendCommandError(
      response,
      attempt,
      "SUPPLIER_PURCHASE_ORDER_RECEIPT_ID_CONFLICT",
    );
  }

  const receiptItems = parsed.lines.map(
    ({ item, accepted, rejected, reason }) => {
      item.accepted_quantity = quantityText(
        storedUnits(item.accepted_quantity) + accepted,
      );
      item.rejected_quantity = quantityText(
        storedUnits(item.rejected_quantity) + rejected,
      );
      item.received_quantity = quantityText(
        storedUnits(item.received_quantity) + accepted + rejected,
      );
      const orderItem = state.items.find(({ id }) =>
        id === item.supplier_purchase_order_item_id
      );
      const amounts = computeAmounts(
        orderItem,
        storedUnits(item.accepted_quantity),
      );
      item.accepted_subtotal_amount = amounts.subtotal;
      item.accepted_tax_amount = amounts.tax;
      item.accepted_total_amount = amounts.total;
      item.updated_at = now;
      return {
        tenant_id: ids.tenant,
        receipt_id: payload.id,
        supplier_purchase_order_item_id:
          item.supplier_purchase_order_item_id,
        accepted_quantity: quantityText(accepted),
        rejected_quantity: quantityText(rejected),
        variance_reason: reason,
      };
    },
  );
  state.receipts.push({
    id: payload.id,
    tenant_id: ids.tenant,
    supplier_purchase_order_id: orderId,
    receipt_no: payload.receipt_no.trim(),
    received_at: new Date(payload.received_at).toISOString(),
    remark: optionalText(payload.remark, 500),
    received_by_employee_id: ids.employee,
    created_at: now,
    items: receiptItems,
  });
  state.fulfillment.status = deriveFulfillmentStatus();
  state.fulfillment.version += 1;
  state.fulfillment.updated_at = now;
  finishCommandAttempt(attempt, "receipt_created");
  const responsePayload = {
    success: true,
    data: fulfillmentCommandData("receipt_created"),
  };
  rememberIdempotent(key, fingerprintValue, 200, responsePayload);
  sendJson(response, 200, responsePayload);
}

function orderedEvents(records, field) {
  return [...records].sort((left, right) =>
    new Date(right[field]).getTime() - new Date(left[field]).getTime() ||
    right.id.localeCompare(left.id)
  );
}

const server = createServer(async (request, response) => {
  const url = new URL(
    request.url || "/",
    `http://${request.headers.host || `127.0.0.1:${port}`}`,
  );
  try {
    if (request.method === "GET" && url.pathname === "/health") {
      return sendData(response, {});
    }
    if (request.method === "POST" && url.pathname === "/__test/reset") {
      await readBody(request);
      reset(url.searchParams.get("scenario") ?? "empty");
      return sendData(response, {});
    }
    if (request.method === "GET" && url.pathname === "/__test/journal") {
      return sendJson(response, 200, {
        journal: structuredClone(state.journal),
      });
    }
    if (request.method === "GET" && url.pathname === "/__test/state") {
      return sendJson(response, 200, {
        order: orderWithReferences(),
        fulfillment: structuredClone(state.fulfillment),
        item_fulfillments: structuredClone(state.itemFulfillments),
        accepted_amounts: acceptedAmountTotals(),
        shipments: structuredClone(state.shipments),
        receipts: structuredClone(state.receipts),
      });
    }
    if (request.method === "POST" && url.pathname === "/admin/auth/login") {
      await readBody(request);
      return sendData(response, session);
    }
    if (request.method === "GET" && url.pathname === "/admin/auth/me") {
      return sendData(response, session);
    }
    if (
      request.method === "GET" &&
      url.pathname === "/employee/service-access"
    ) {
      return sendData(response, currentServiceAccessSummary());
    }
    if (
      request.method === "GET" &&
      url.pathname === "/supplier-purchase-order-project-options"
    ) {
      const projectOptions = [
        project,
        ...Array.from({ length: 100 }, (_, index) => ({
          ...project,
          id: `23000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
          name: `E2E 分页项目 ${index + 1}`,
        })),
      ];
      return sendPage(response, url, projectOptions, ["name"]);
    }
    if (
      request.method === "GET" &&
      url.pathname === "/supplier-purchase-order-supplier-options"
    ) {
      return sendPage(response, url, [{
        tenant_supplier_id: relationship.id,
        supplier_id: relationship.supplier_id,
        relationship_status: relationship.relationship_status,
        default_currency: relationship.default_currency,
        supplier: {
          id: relationship.supplier.id,
          code: relationship.supplier.code,
          name: relationship.supplier.name,
          legal_name: relationship.supplier.legal_name,
        },
      }]);
    }
    if (
      request.method === "GET" &&
      url.pathname === "/supplier-purchase-order-catalog"
    ) {
      if (url.searchParams.get("tenantSupplierId") !== relationship.id) {
        return sendError(
          response,
          400,
          "VALIDATION_ERROR",
          "合作供应商参数无效",
        );
      }
      return sendPage(
        response,
        url,
        state.catalog,
        ["product_code", "product_name", "sku_code", "sku_name"],
      );
    }
    if (
      request.method === "GET" &&
      url.pathname === "/supplier-purchase-orders"
    ) {
      let records = state.order ? [orderWithReferences()] : [];
      const status = url.searchParams.get("status");
      const fulfillmentStatus = url.searchParams.get("fulfillmentStatus");
      const projectId = url.searchParams.get("projectId");
      const tenantSupplierId = url.searchParams.get("tenantSupplierId");
      if (status) records = records.filter((order) => order.status === status);
      if (fulfillmentStatus) {
        records = records.filter((order) =>
          (
            fulfillmentStatus === "awaiting_receipt"
              ? ["partially_shipped", "shipped"].includes(
                order.fulfillment_status,
              )
              : order.fulfillment_status === fulfillmentStatus
          ) &&
          (
            fulfillmentStatus !== "unconfirmed" ||
            order.status === "submitted"
          )
        );
      }
      if (projectId) {
        records = records.filter((order) => order.project_id === projectId);
      }
      if (tenantSupplierId) {
        records = records.filter(
          (order) => order.tenant_supplier_id === tenantSupplierId,
        );
      }
      return sendPage(response, url, records, ["order_no"]);
    }
    const fulfillmentDetail = url.pathname.match(
      /^\/supplier-purchase-orders\/([^/]+)\/fulfillment$/,
    );
    if (request.method === "GET" && fulfillmentDetail) {
      if (
        !state.order ||
        decodeURIComponent(fulfillmentDetail[1]) !== state.order.id
      ) {
        return sendBusinessError(
          response,
          "SUPPLIER_PURCHASE_ORDER_NOT_FOUND",
        );
      }
      return sendData(response, {
        fulfillment: structuredClone(state.fulfillment),
        item_fulfillments: structuredClone(state.itemFulfillments),
      });
    }
    const confirmation = url.pathname.match(
      /^\/supplier-purchase-orders\/([^/]+)\/confirm-fulfillment$/,
    );
    if (request.method === "POST" && confirmation) {
      return confirmFulfillment(
        request,
        response,
        url,
        decodeURIComponent(confirmation[1]),
      );
    }
    const shipmentEvents = url.pathname.match(
      /^\/supplier-purchase-orders\/([^/]+)\/shipments$/,
    );
    if (request.method === "GET" && shipmentEvents) {
      if (
        !state.order ||
        decodeURIComponent(shipmentEvents[1]) !== state.order.id
      ) {
        return sendBusinessError(
          response,
          "SUPPLIER_PURCHASE_ORDER_NOT_FOUND",
        );
      }
      return sendPage(
        response,
        url,
        orderedEvents(state.shipments, "shipped_at"),
      );
    }
    if (request.method === "POST" && shipmentEvents) {
      return createShipment(
        request,
        response,
        url,
        decodeURIComponent(shipmentEvents[1]),
      );
    }
    const receiptEvents = url.pathname.match(
      /^\/supplier-purchase-orders\/([^/]+)\/receipts$/,
    );
    if (request.method === "GET" && receiptEvents) {
      if (
        !state.order ||
        decodeURIComponent(receiptEvents[1]) !== state.order.id
      ) {
        return sendBusinessError(
          response,
          "SUPPLIER_PURCHASE_ORDER_NOT_FOUND",
        );
      }
      return sendPage(
        response,
        url,
        orderedEvents(state.receipts, "received_at"),
      );
    }
    if (request.method === "POST" && receiptEvents) {
      return createReceipt(
        request,
        response,
        url,
        decodeURIComponent(receiptEvents[1]),
      );
    }
    const itemList = url.pathname.match(
      /^\/supplier-purchase-orders\/([^/]+)\/items$/,
    );
    if (request.method === "GET" && itemList) {
      if (!state.order || decodeURIComponent(itemList[1]) !== state.order.id) {
        return sendBusinessError(
          response,
          "SUPPLIER_PURCHASE_ORDER_NOT_FOUND",
        );
      }
      return sendPage(response, url, state.items);
    }
    const saveDraftMatch = url.pathname.match(
      /^\/supplier-purchase-orders\/([^/]+)\/save-draft$/,
    );
    if (request.method === "POST" && saveDraftMatch) {
      return saveDraft(
        request,
        response,
        url,
        decodeURIComponent(saveDraftMatch[1]),
      );
    }
    const submitMatch = url.pathname.match(
      /^\/supplier-purchase-orders\/([^/]+)\/submit$/,
    );
    if (request.method === "POST" && submitMatch) {
      return submitOrder(
        request,
        response,
        url,
        decodeURIComponent(submitMatch[1]),
      );
    }
    const cancelMatch = url.pathname.match(
      /^\/supplier-purchase-orders\/([^/]+)\/cancel$/,
    );
    if (request.method === "POST" && cancelMatch) {
      return cancelOrder(
        request,
        response,
        url,
        decodeURIComponent(cancelMatch[1]),
      );
    }
    const orderDetail = url.pathname.match(
      /^\/supplier-purchase-orders\/([^/]+)$/,
    );
    if (request.method === "GET" && orderDetail) {
      if (!state.order || decodeURIComponent(orderDetail[1]) !== state.order.id) {
        return sendBusinessError(
          response,
          "SUPPLIER_PURCHASE_ORDER_NOT_FOUND",
        );
      }
      return sendData(response, orderWithReferences());
    }
    if (request.method === "GET" && url.pathname === "/notifications/summary") {
      return sendData(response, { unread_count: 0 });
    }
    if (request.method === "GET" && url.pathname === "/notifications") {
      return sendPage(response, url, []);
    }
    sendError(
      response,
      404,
      "MOCK_ROUTE_NOT_FOUND",
      `Mock route not found: ${request.method} ${url.pathname}`,
    );
  } catch (error) {
    sendError(
      response,
      500,
      "MOCK_INTERNAL_ERROR",
      error instanceof Error ? error.message : "Mock backend failed",
    );
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`[supplier-purchase-order-mock] listening on ${port}`);
});

let shuttingDown = false;
function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 2_000).unref();
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
