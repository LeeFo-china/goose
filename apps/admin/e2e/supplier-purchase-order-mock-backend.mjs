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
  if (key?.trim()) return key.trim();
  sendError(
    response,
    400,
    "IDEMPOTENCY_KEY_REQUIRED",
    "缺少 Idempotency-Key",
  );
  return null;
}

function fingerprint(url, payload) {
  return `${url.pathname}:${JSON.stringify(payload)}`;
}

function replayIdempotent(response, key, fingerprintValue) {
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
  sendJson(response, previous.status, previous.payload);
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
  if (typeof payload.reason !== "string" || payload.reason.trim().length < 2) {
    return sendError(response, 400, "VALIDATION_ERROR", "请填写取消原因");
  }
  state.order.status = "cancelled";
  state.order.version += 1;
  state.order.cancelled_by_employee_id = ids.employee;
  state.order.cancelled_at = now;
  state.order.cancel_reason = payload.reason.trim();
  state.order.updated_at = now;
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
