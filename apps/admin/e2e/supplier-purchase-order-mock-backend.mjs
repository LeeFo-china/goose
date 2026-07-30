import { createServer } from "node:http";

import {
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

let state;
reset();

function reset() {
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
    ...(details === undefined ? {} : { details }),
  });
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
    "IDEMPOTENCY_KEY_REQUIRED",
    "Idempotency-Key 必须为 1 到 120 个字符",
  );
  return null;
}

function fingerprint(url, payload) {
  return `${url.pathname}:${JSON.stringify(payload)}`;
}

function replayIdempotent(response, key, fingerprintValue, markReplay = false) {
  const previous = state.idempotency.get(key);
  if (!previous) return false;
  if (previous.fingerprint !== fingerprintValue) {
    sendError(
      response,
      409,
      "IDEMPOTENCY_KEY_REUSED",
      "Idempotency-Key 已用于其他请求",
    );
    return true;
  }
  const payload = structuredClone(previous.payload);
  if (markReplay && payload?.success && payload.data) {
    payload.data.idempotent = true;
  }
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
  state.journal.push({
    method: request.method,
    path: url.pathname,
    idempotencyKey: idempotencyKey(request),
    payload: structuredClone(payload),
    outcome,
  });
}

function orderWithReferences(order = state.order) {
  return order
    ? {
      ...structuredClone(order),
      project: {
        id: project.id,
        name: project.name,
        status: project.status,
      },
      supplier: structuredClone(relationship.supplier),
    }
    : null;
}

function money(value) {
  return Number(value).toFixed(2);
}

function computeAmounts(catalogItem, quantity) {
  const total = Number(catalogItem.unit_price) * quantity;
  const subtotal = catalogItem.tax_inclusive
    ? total / (1 + Number(catalogItem.tax_rate))
    : total;
  const tax = catalogItem.tax_inclusive
    ? total - subtotal
    : subtotal * Number(catalogItem.tax_rate);
  return {
    subtotal: money(subtotal),
    tax: money(tax),
    total: money(catalogItem.tax_inclusive ? total : subtotal + tax),
  };
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TERMINAL_FULFILLMENT_STATUSES = new Set([
  "received",
  "received_with_variance",
  "cancelled",
]);

function hasExactKeys(value, expected) {
  return value && typeof value === "object" && !Array.isArray(value) &&
    Object.keys(value).sort().join(",") === [...expected].sort().join(",");
}

function hasAllowedKeys(value, required, optional = []) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const keys = Object.keys(value);
  const allowed = new Set([...required, ...optional]);
  return required.every((key) => keys.includes(key)) &&
    keys.every((key) => allowed.has(key));
}

function optionalText(value, maximum) {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  if (normalized.length > maximum) return undefined;
  return normalized || null;
}

function requiredText(value, maximum) {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized && normalized.length <= maximum ? normalized : null;
}

function validDateTime(value) {
  return typeof value === "string" && value.trim() &&
    !Number.isNaN(new Date(value).getTime());
}

function quantityUnits(value, allowZero) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const text = String(value);
  const match = /^(\d{1,14})(?:\.(\d{1,4}))?$/.exec(text);
  if (!match) return null;
  const units = BigInt(match[1]) * 10_000n +
    BigInt((match[2] || "").padEnd(4, "0") || "0");
  if ((!allowZero && units === 0n) || units >= 1_000_000_000_000_000_000n) {
    return null;
  }
  return units;
}

function storedUnits(value) {
  const match = /^(\d+)(?:\.(\d{1,4}))?$/.exec(String(value));
  if (!match) throw new Error(`Invalid fixture quantity: ${value}`);
  return BigInt(match[1]) * 10_000n +
    BigInt((match[2] || "").padEnd(4, "0") || "0");
}

function quantityText(units) {
  const whole = units / 10_000n;
  const decimal = String(units % 10_000n).padStart(4, "0")
    .replace(/0+$/, "");
  return decimal ? `${whole}.${decimal}` : String(whole);
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

function fulfillmentFailure(response, message, code = "VALIDATION_ERROR") {
  sendError(response, code === "VALIDATION_ERROR" ? 400 : 409, code, message);
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
  const payload = await readBody(request);
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
      "SUPPLIER_PURCHASE_ORDER_INVALID_STATE",
      "当前采购单状态不允许保存草稿",
    );
  }
  if (
    payload.project_id !== project.id ||
    payload.tenant_supplier_id !== relationship.id ||
    !Array.isArray(payload.items) ||
    payload.items.length < 1 ||
    payload.items.length > 100
  ) {
    return sendError(response, 400, "VALIDATION_ERROR", "采购单草稿参数无效");
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
    (sum, item) => sum + Number(item.subtotal_amount),
    0,
  );
  const tax = nextItems.reduce(
    (sum, item) => sum + Number(item.tax_amount),
    0,
  );
  const total = nextItems.reduce(
    (sum, item) => sum + Number(item.total_amount),
    0,
  );
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
    subtotal_amount: money(subtotal),
    tax_amount: money(tax),
    total_amount: money(total),
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
  const payload = await readBody(request);
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
      "SUPPLIER_PURCHASE_ORDER_INVALID_STATE",
      "只有草稿采购单可以提交",
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
      message: "采购价格已变化，请重新保存草稿刷新价格",
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
      "采购价格已变化，请重新保存草稿刷新价格",
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
  const payload = await readBody(request);
  const fingerprintValue = fingerprint(url, payload);
  if (replayIdempotent(response, key, fingerprintValue)) return;
  if (
    !state.order ||
    state.order.id !== orderId ||
    !["draft", "submitted"].includes(state.order.status)
  ) {
    return sendError(
      response,
      409,
      "SUPPLIER_PURCHASE_ORDER_INVALID_STATE",
      "当前采购单状态不允许取消",
    );
  }
  if (!validateExpectedVersion(response, payload.expected_version)) return;
  if (state.shipments.length > 0) {
    return sendError(
      response,
      409,
      "SUPPLIER_PURCHASE_ORDER_FULFILLMENT_STARTED",
      "采购履约已经开始，不能取消采购单",
    );
  }
  if (typeof payload.reason !== "string" || payload.reason.trim().length < 2) {
    return sendError(response, 400, "VALIDATION_ERROR", "请填写取消原因");
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
  recordCommand(request, url, payload, "cancelled");
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
  const payload = await readBody(request);
  const fingerprintValue = fingerprint(url, payload);
  if (replayIdempotent(response, key, fingerprintValue, true)) return;
  if (!state.order || state.order.id !== orderId) {
    return sendError(response, 404, "NOT_FOUND", "采购单不存在");
  }
  if (state.order.tenant_id !== ids.tenant || state.order.status !== "submitted") {
    return fulfillmentFailure(
      response,
      "只有已提交采购单可以记录供应商确认",
      "SUPPLIER_PURCHASE_ORDER_INVALID_STATE",
    );
  }
  if (state.fulfillment) {
    return fulfillmentFailure(
      response,
      "供应商确认已经记录",
      "SUPPLIER_PURCHASE_ORDER_FULFILLMENT_EXISTS",
    );
  }
  if (
    !hasAllowedKeys(
      payload,
      ["expected_version", "confirmed_at"],
      ["remark"],
    ) ||
    !Number.isSafeInteger(payload.expected_version) ||
    !validDateTime(payload.confirmed_at)
  ) {
    return fulfillmentFailure(response, "供应商确认参数无效");
  }
  if (payload.expected_version !== state.order.version) {
    return fulfillmentFailure(
      response,
      "采购单版本已变化",
      "SUPPLIER_PURCHASE_ORDER_VERSION_CONFLICT",
    );
  }
  const remark = optionalText(payload.remark, 500);
  if (remark === undefined) {
    return fulfillmentFailure(response, "供应商确认备注无效");
  }

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
  recordCommand(request, url, payload, "confirmed");
  const responsePayload = {
    success: true,
    data: fulfillmentCommandData("confirmed"),
  };
  rememberIdempotent(key, fingerprintValue, 200, responsePayload);
  sendJson(response, 200, responsePayload);
}

function requireActiveFulfillment(response, orderId, expectedVersion) {
  if (
    !state.order ||
    state.order.id !== orderId ||
    state.order.tenant_id !== ids.tenant
  ) {
    sendError(response, 404, "NOT_FOUND", "采购单不存在");
    return false;
  }
  if (!state.fulfillment || state.fulfillment.version !== expectedVersion) {
    fulfillmentFailure(
      response,
      "采购履约版本已变化",
      "SUPPLIER_PURCHASE_ORDER_FULFILLMENT_VERSION_CONFLICT",
    );
    return false;
  }
  if (TERMINAL_FULFILLMENT_STATUSES.has(state.fulfillment.status)) {
    fulfillmentFailure(
      response,
      "当前采购履约状态不允许继续登记",
      "SUPPLIER_PURCHASE_ORDER_FULFILLMENT_INVALID_STATE",
    );
    return false;
  }
  return true;
}

function parseShipmentPayload(payload, response) {
  if (
    !hasAllowedKeys(
      payload,
      [
        "id",
        "expected_fulfillment_version",
        "shipment_no",
        "shipped_at",
        "items",
      ],
      ["carrier_name", "tracking_no", "remark"],
    ) ||
    !UUID_PATTERN.test(payload.id) ||
    !Number.isSafeInteger(payload.expected_fulfillment_version) ||
    !requiredText(payload.shipment_no, 80) ||
    optionalText(payload.carrier_name, 100) === undefined ||
    optionalText(payload.tracking_no, 120) === undefined ||
    optionalText(payload.remark, 500) === undefined ||
    !validDateTime(payload.shipped_at) ||
    !Array.isArray(payload.items) ||
    payload.items.length < 1 ||
    payload.items.length > 100
  ) {
    fulfillmentFailure(response, "发货参数无效");
    return null;
  }
  if (
    state.shipments.some((shipment) =>
      shipment.id === payload.id ||
      shipment.shipment_no === payload.shipment_no.trim()
    )
  ) {
    fulfillmentFailure(
      response,
      "发货记录 ID 或发货编号重复",
      "SUPPLIER_PURCHASE_ORDER_SHIPMENT_CONFLICT",
    );
    return null;
  }
  const itemById = new Map(state.itemFulfillments.map((item) =>
    [item.supplier_purchase_order_item_id.toLowerCase(), item]
  ));
  const seen = new Set();
  const lines = [];
  for (const line of payload.items) {
    const itemId = typeof line?.purchase_order_item_id === "string"
      ? line.purchase_order_item_id.toLowerCase()
      : "";
    const quantity = quantityUnits(line?.quantity, false);
    const item = itemById.get(itemId);
    if (
      !hasExactKeys(line, ["purchase_order_item_id", "quantity"]) ||
      !UUID_PATTERN.test(itemId) ||
      seen.has(itemId) ||
      !item ||
      quantity === null ||
      quantity >
        storedUnits(item.ordered_quantity) - storedUnits(item.shipped_quantity)
    ) {
      fulfillmentFailure(response, "发货明细无效或超过剩余可发数量");
      return null;
    }
    seen.add(itemId);
    lines.push({ item, quantity });
  }
  return lines;
}

async function createShipment(request, response, url, orderId) {
  const key = requireIdempotency(request, response);
  if (!key) return;
  const payload = await readBody(request);
  const fingerprintValue = fingerprint(url, payload);
  if (replayIdempotent(response, key, fingerprintValue, true)) return;
  const lines = parseShipmentPayload(payload, response);
  if (!lines || !requireActiveFulfillment(
    response,
    orderId,
    payload.expected_fulfillment_version,
  )) return;

  const shipmentItems = lines.map(({ item, quantity }) => {
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
  recordCommand(request, url, payload, "shipment_created");
  const responsePayload = {
    success: true,
    data: fulfillmentCommandData("shipment_created"),
  };
  rememberIdempotent(key, fingerprintValue, 200, responsePayload);
  sendJson(response, 200, responsePayload);
}

function parseReceiptPayload(payload, response) {
  if (
    !hasAllowedKeys(
      payload,
      [
        "id",
        "expected_fulfillment_version",
        "receipt_no",
        "received_at",
        "items",
      ],
      ["remark"],
    ) ||
    !UUID_PATTERN.test(payload.id) ||
    !Number.isSafeInteger(payload.expected_fulfillment_version) ||
    !requiredText(payload.receipt_no, 80) ||
    optionalText(payload.remark, 500) === undefined ||
    !validDateTime(payload.received_at) ||
    !Array.isArray(payload.items) ||
    payload.items.length < 1 ||
    payload.items.length > 100
  ) {
    fulfillmentFailure(response, "收货参数无效");
    return null;
  }
  if (
    state.receipts.some((receipt) =>
      receipt.id === payload.id ||
      receipt.receipt_no === payload.receipt_no.trim()
    )
  ) {
    fulfillmentFailure(
      response,
      "收货记录 ID 或收货编号重复",
      "SUPPLIER_PURCHASE_ORDER_RECEIPT_CONFLICT",
    );
    return null;
  }
  const itemById = new Map(state.itemFulfillments.map((item) =>
    [item.supplier_purchase_order_item_id.toLowerCase(), item]
  ));
  const seen = new Set();
  const lines = [];
  for (const line of payload.items) {
    const itemId = typeof line?.purchase_order_item_id === "string"
      ? line.purchase_order_item_id.toLowerCase()
      : "";
    const accepted = quantityUnits(line?.accepted_quantity, true);
    const rejected = quantityUnits(line?.rejected_quantity, true);
    const reason = optionalText(line?.variance_reason, 500);
    const item = itemById.get(itemId);
    const total = accepted === null || rejected === null
      ? null
      : accepted + rejected;
    if (
      !hasAllowedKeys(
        line,
        [
          "purchase_order_item_id",
          "accepted_quantity",
          "rejected_quantity",
        ],
        ["variance_reason"],
      ) ||
      !UUID_PATTERN.test(itemId) ||
      seen.has(itemId) ||
      !item ||
      accepted === null ||
      rejected === null ||
      total === null ||
      total === 0n ||
      total >
        storedUnits(item.shipped_quantity) - storedUnits(item.received_quantity) ||
      reason === undefined ||
      (rejected > 0n && reason === null) ||
      (rejected === 0n && reason !== null)
    ) {
      fulfillmentFailure(
        response,
        "收货明细无效、超过剩余可收数量或拒收原因无效",
      );
      return null;
    }
    seen.add(itemId);
    lines.push({ item, accepted, rejected, reason });
  }
  return lines;
}

async function createReceipt(request, response, url, orderId) {
  const key = requireIdempotency(request, response);
  if (!key) return;
  const payload = await readBody(request);
  const fingerprintValue = fingerprint(url, payload);
  if (replayIdempotent(response, key, fingerprintValue, true)) return;
  const lines = parseReceiptPayload(payload, response);
  if (!lines || !requireActiveFulfillment(
    response,
    orderId,
    payload.expected_fulfillment_version,
  )) return;

  const receiptItems = lines.map(({ item, accepted, rejected, reason }) => {
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
      Number(item.accepted_quantity),
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
  });
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
  recordCommand(request, url, payload, "receipt_created");
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
      reset();
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
      const projectId = url.searchParams.get("projectId");
      const tenantSupplierId = url.searchParams.get("tenantSupplierId");
      if (status) records = records.filter((order) => order.status === status);
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
        return sendError(response, 404, "NOT_FOUND", "采购单不存在");
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
        return sendError(response, 404, "NOT_FOUND", "采购单不存在");
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
        return sendError(response, 404, "NOT_FOUND", "采购单不存在");
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
        return sendError(response, 404, "NOT_FOUND", "采购单不存在");
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
        return sendError(response, 404, "NOT_FOUND", "采购单不存在");
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
