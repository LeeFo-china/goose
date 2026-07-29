import { createServer } from "node:http";

const port = Number.parseInt(
  process.env.SUPPLIER_PRODUCT_PRICING_MOCK_BACKEND_PORT || "3996",
  10,
);
const now = "2026-07-29T00:00:00.000Z";
const ids = {
  tenant: "21000000-0000-4000-8000-000000000001",
  relationship: "21000000-0000-4000-8000-000000000002",
  supplier: "21000000-0000-4000-8000-000000000003",
  category: "21000000-0000-4000-8000-000000000004",
  brand: "21000000-0000-4000-8000-000000000005",
  unit: "21000000-0000-4000-8000-000000000006",
};
const category = {
  id: ids.category,
  code: "TILE",
  name: "瓷砖分类",
  status: "active",
};
const brand = {
  id: ids.brand,
  code: "E2E-BRAND",
  name: "E2E 品牌",
  status: "active",
};
const unit = {
  id: ids.unit,
  code: "SQM",
  name: "平方米",
  symbol: "㎡",
  status: "active",
};
const session = {
  user_id: "21000000-0000-4000-8000-000000000010",
  login_channel: "admin_web",
  employee: {
    id: "21000000-0000-4000-8000-000000000011",
    name: "采购管理员",
    phone: "18637605353",
    status: "active",
    tenant_department_id: null,
    department_name: "采购部",
    post_id: null,
    post_name: "采购经理",
    avatar: null,
  },
  tenant: {
    id: ids.tenant,
    name: "E2E 装修公司",
    slug: "supplier-product-e2e",
    status: "active",
  },
  roles: ["tenant_admin"],
  permissions: [
    { code: "supplier.view", scope: "all" },
    { code: "supplier.product.view", scope: "all" },
    { code: "supplier.product.manage", scope: "all" },
    { code: "supplier.cost-price.view", scope: "all" },
    { code: "supplier.cost-price.manage", scope: "all" },
  ],
  token: "supplier-product-pricing-token",
  expires_at: "2099-12-31T23:59:59+08:00",
};

let state;
let mutations;
reset();

function reset() {
  state = { products: [], skus: [], priceLists: [], items: [] };
  mutations = [];
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

function page(list, url) {
  const pageNumber = Math.max(1, Number(url.searchParams.get("page")) || 1);
  const pageSize = Math.min(
    100,
    Math.max(1, Number(url.searchParams.get("pageSize")) || 20),
  );
  const keyword = (url.searchParams.get("keyword") || "").toLowerCase();
  const filtered = keyword
    ? list.filter((record) =>
      [record.name, record.product_code, record.price_list_code]
        .filter(Boolean)
        .some((value) => value.toLowerCase().includes(keyword))
    )
    : list;
  const start = (pageNumber - 1) * pageSize;
  return {
    list: filtered.slice(start, start + pageSize),
    pagination: {
      page: pageNumber,
      pageSize,
      total: filtered.length,
      totalPages: filtered.length ? Math.ceil(filtered.length / pageSize) : 0,
    },
  };
}

function readBody(request) {
  return new Promise((resolve) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => {
      const text = Buffer.concat(chunks).toString("utf8");
      resolve(text ? JSON.parse(text) : {});
    });
  });
}

function idempotencyKey(request) {
  const value = request.headers["idempotency-key"];
  return Array.isArray(value) ? value[0] : value ?? null;
}

function requireIdempotency(request, response) {
  if (idempotencyKey(request)?.trim()) return true;
  sendJson(response, 400, {
    success: false,
    code: "IDEMPOTENCY_KEY_REQUIRED",
    message: "缺少 Idempotency-Key",
  });
  return false;
}

function recordMutation(request, url, payload) {
  mutations.push({
    method: request.method,
    path: url.pathname,
    idempotencyKey: idempotencyKey(request),
    payload: structuredClone(payload),
  });
}

function notFound(response, message) {
  sendJson(response, 404, {
    success: false,
    code: "NOT_FOUND",
    message,
  });
}

function conflict(response, record, field = "version") {
  sendJson(response, 409, {
    success: false,
    code: "SUPPLIER_VERSION_CONFLICT",
    message: "数据版本已变化",
    details: {
      current_version: record[field],
      current_status: record.status ?? record.lifecycle_status,
    },
  });
}

function relationship() {
  return {
    id: ids.relationship,
    tenant_id: ids.tenant,
    supplier_id: ids.supplier,
    relationship_status: "active",
    settlement_term_days: 30,
    credit_limit_minor: 0,
    invoice_required_before_payment: true,
    default_currency: "CNY",
    default_tax_inclusive: true,
    tenant_owner_employee_id: null,
    started_at: now,
    ended_at: null,
    remark: null,
    version: 1,
    created_at: now,
    updated_at: now,
    contract_health: "valid",
    supplier: {
      id: ids.supplier,
      code: "E2E-SUPPLIER",
      name: "E2E 建材供应商",
      legal_name: "E2E 建材供应商有限公司",
      supplier_type: "manufacturer",
      onboarding_status: "approved",
      operational_status: "active",
      version: 1,
    },
  };
}

async function createProduct(request, response, url, productId) {
  if (!requireIdempotency(request, response)) return;
  const payload = await readBody(request);
  state.products.push({
    id: productId,
    supplier_id: ids.supplier,
    product_code: payload.product_code,
    name: payload.name,
    description: payload.description,
    status: "draft",
    version: 1,
    category,
    brand,
    updated_at: now,
  });
  recordMutation(request, url, payload);
  sendData(response, {
    status: "created",
    idempotent: false,
    product: { id: productId },
    version: 1,
  }, 201);
}

async function createSku(request, response, url, productId, skuId) {
  if (!requireIdempotency(request, response)) return;
  const payload = await readBody(request);
  state.skus.push({
    id: skuId,
    supplier_id: ids.supplier,
    supplier_product_id: productId,
    sku_code: payload.sku_code,
    name: payload.name,
    specification: payload.specification,
    model: payload.model,
    purchase_unit_id: ids.unit,
    base_unit_id: ids.unit,
    base_unit_conversion: "1.000000",
    batch_managed: payload.batch_managed,
    color_managed: payload.color_managed,
    serial_managed: payload.serial_managed,
    status: "draft",
    version: 1,
    purchase_unit: unit,
    base_unit: unit,
    updated_at: now,
  });
  recordMutation(request, url, payload);
  sendData(response, {
    status: "created",
    idempotent: false,
    sku: { id: skuId },
    version: 1,
  }, 201);
}

async function mutateStatus(request, response, url, kind, id, action) {
  if (!requireIdempotency(request, response)) return;
  const payload = await readBody(request);
  const records = kind === "product" ? state.products : state.skus;
  const record = records.find((item) => item.id === id);
  if (!record) return notFound(response, "供应商主数据不存在");
  if (payload.expected_version !== record.version) {
    return conflict(response, record);
  }
  record.status = action === "activate" ? "active" : "inactive";
  record.version += 1;
  record.updated_at = now;
  recordMutation(request, url, payload);
  sendData(response, {
    status: "updated",
    idempotent: false,
    [kind]: { id, status: record.status },
    version: record.version,
  });
}

async function createPriceList(request, response, url, priceListId) {
  if (!requireIdempotency(request, response)) return;
  const payload = await readBody(request);
  state.priceLists.push({
    id: priceListId,
    supplier_id: ids.supplier,
    price_list_code: payload.price_list_code,
    version_number: 1,
    scope_type: "default",
    name: payload.name,
    currency: payload.currency,
    lifecycle_status: "draft",
    effective_from: payload.effective_from,
    effective_until: payload.effective_until,
    supersedes_price_list_id: null,
    published_at: null,
    row_version: 1,
    updated_at: now,
  });
  recordMutation(request, url, payload);
  sendData(response, {
    status: "created",
    price_list: { id: priceListId },
    version: 1,
  }, 201);
}

async function upsertPriceItem(
  request,
  response,
  url,
  priceListId,
  itemId,
) {
  if (!requireIdempotency(request, response)) return;
  const payload = await readBody(request);
  const priceList = state.priceLists.find(({ id }) => id === priceListId);
  const sku = state.skus.find(({ id }) => id === payload.supplier_sku_id);
  if (!priceList || !sku) return notFound(response, "价格簿或 SKU 不存在");
  if (payload.expected_version !== priceList.row_version) {
    return conflict(response, priceList, "row_version");
  }
  state.items.push({
    id: itemId,
    supplier_id: ids.supplier,
    supplier_price_list_id: priceListId,
    supplier_sku_id: sku.id,
    minimum_quantity: "1",
    maximum_quantity: null,
    purchase_unit_id: ids.unit,
    base_unit_id: ids.unit,
    base_unit_conversion: "1.000000",
    unit_price: Number(payload.unit_price).toFixed(2),
    tax_rate: Number(payload.tax_rate).toFixed(6),
    tax_inclusive: payload.tax_inclusive,
    sku: {
      id: sku.id,
      sku_code: sku.sku_code,
      name: sku.name,
      status: sku.status,
    },
    purchase_unit: unit,
    base_unit: unit,
    updated_at: now,
  });
  priceList.row_version += 1;
  recordMutation(request, url, payload);
  sendData(response, {
    status: "updated",
    price_list: { id: priceListId },
    item: { id: itemId },
    version: priceList.row_version,
  });
}

async function publishPriceList(request, response, url, priceListId) {
  if (!requireIdempotency(request, response)) return;
  const payload = await readBody(request);
  const priceList = state.priceLists.find(({ id }) => id === priceListId);
  if (!priceList) return notFound(response, "价格簿不存在");
  if (payload.expected_version !== priceList.row_version) {
    return conflict(response, priceList, "row_version");
  }
  priceList.lifecycle_status = "published";
  priceList.published_at = now;
  priceList.row_version += 1;
  recordMutation(request, url, payload);
  sendData(response, {
    status: "published",
    price_list: { id: priceListId },
    version: priceList.row_version,
  });
}

const server = createServer(async (request, response) => {
  const url = new URL(
    request.url || "/",
    `http://${request.headers.host || `127.0.0.1:${port}`}`,
  );
  if (request.method === "GET" && url.pathname === "/health") {
    return sendData(response, {});
  }
  if (request.method === "POST" && url.pathname === "/__test/reset") {
    await readBody(request);
    reset();
    return sendData(response, {});
  }
  if (request.method === "GET" && url.pathname === "/__test/mutations") {
    return sendJson(response, 200, { mutations });
  }
  if (request.method === "POST" && url.pathname === "/admin/auth/login") {
    await readBody(request);
    return sendData(response, session);
  }
  if (request.method === "GET" && url.pathname === "/admin/auth/me") {
    return sendData(response, session);
  }
  if (request.method === "GET" && url.pathname === "/suppliers") {
    return sendData(response, page([relationship()], url));
  }
  if (request.method === "GET" && url.pathname === "/catalog/categories") {
    return sendData(response, page([category], url));
  }
  if (request.method === "GET" && url.pathname === "/catalog/brands") {
    return sendData(response, page([brand], url));
  }
  if (request.method === "GET" && url.pathname === "/catalog/units") {
    return sendData(response, page([unit], url));
  }
  if (request.method === "GET" && url.pathname === "/supplier-products") {
    return sendData(response, page(state.products, url));
  }
  if (request.method === "GET" && url.pathname === "/supplier-price-lists") {
    return sendData(response, page(state.priceLists, url));
  }
  const skuList = url.pathname.match(/^\/supplier-products\/([^/]+)\/skus$/);
  if (request.method === "GET" && skuList) {
    const productId = decodeURIComponent(skuList[1]);
    return sendData(
      response,
      page(state.skus.filter((sku) => sku.supplier_product_id === productId), url),
    );
  }
  const itemList = url.pathname.match(
    /^\/supplier-price-lists\/([^/]+)\/items$/,
  );
  if (request.method === "GET" && itemList) {
    const priceListId = decodeURIComponent(itemList[1]);
    return sendData(
      response,
      page(
        state.items.filter(
          (item) => item.supplier_price_list_id === priceListId,
        ),
        url,
      ),
    );
  }
  const skuCreate = url.pathname.match(
    /^\/supplier-products\/([^/]+)\/skus\/([^/]+)$/,
  );
  if (request.method === "POST" && skuCreate) {
    return createSku(
      request,
      response,
      url,
      decodeURIComponent(skuCreate[1]),
      decodeURIComponent(skuCreate[2]),
    );
  }
  const skuMutation = url.pathname.match(
    /^\/supplier-products\/[^/]+\/skus\/([^/]+)\/(activate|deactivate)$/,
  );
  if (request.method === "POST" && skuMutation) {
    return mutateStatus(
      request,
      response,
      url,
      "sku",
      decodeURIComponent(skuMutation[1]),
      skuMutation[2],
    );
  }
  const productMutation = url.pathname.match(
    /^\/supplier-products\/([^/]+)\/(activate|deactivate)$/,
  );
  if (request.method === "POST" && productMutation) {
    return mutateStatus(
      request,
      response,
      url,
      "product",
      decodeURIComponent(productMutation[1]),
      productMutation[2],
    );
  }
  const productCreate = url.pathname.match(/^\/supplier-products\/([^/]+)$/);
  if (request.method === "POST" && productCreate) {
    return createProduct(
      request,
      response,
      url,
      decodeURIComponent(productCreate[1]),
    );
  }
  const itemMutation = url.pathname.match(
    /^\/supplier-price-lists\/([^/]+)\/items\/([^/]+)$/,
  );
  if (request.method === "PUT" && itemMutation) {
    return upsertPriceItem(
      request,
      response,
      url,
      decodeURIComponent(itemMutation[1]),
      decodeURIComponent(itemMutation[2]),
    );
  }
  const pricePublish = url.pathname.match(
    /^\/supplier-price-lists\/([^/]+)\/publish$/,
  );
  if (request.method === "POST" && pricePublish) {
    return publishPriceList(
      request,
      response,
      url,
      decodeURIComponent(pricePublish[1]),
    );
  }
  const priceCreate = url.pathname.match(
    /^\/supplier-price-lists\/([^/]+)$/,
  );
  if (request.method === "POST" && priceCreate) {
    return createPriceList(
      request,
      response,
      url,
      decodeURIComponent(priceCreate[1]),
    );
  }
  if (request.method === "GET" && url.pathname === "/notifications/summary") {
    return sendData(response, { unread_count: 0 });
  }
  if (request.method === "GET" && url.pathname === "/notifications") {
    return sendData(response, page([], url));
  }
  sendJson(response, 404, {
    success: false,
    code: "MOCK_ROUTE_NOT_FOUND",
    message: `Mock route not found: ${request.method} ${url.pathname}`,
  });
});

server.listen(port, "127.0.0.1", () => {
  console.log(`[supplier-product-pricing-mock] listening on ${port}`);
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
