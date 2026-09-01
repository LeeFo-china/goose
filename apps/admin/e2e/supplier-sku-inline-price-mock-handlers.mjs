import {
  currentTenantId,
  ids,
  mockStore,
  now,
  platformSuppliers,
  units,
} from "./supplier-product-pricing-mock-state.mjs";

const inlineIds = {
  currentList: "28000000-0000-4000-8000-000000000001",
  currentItem: "28100000-0000-4000-8000-000000000001",
  futureList: "28000000-0000-4000-8000-000000000002",
  futureItem: "28100000-0000-4000-8000-000000000002",
};
const futureStart = "2026-09-01T00:00:00.000Z";
const inlineState = {
  sequence: 2,
  conflictRemaining: 0,
  idempotency: new Map(),
};

export function resetSupplierSkuInlinePriceMock(config = {}) {
  inlineState.sequence = 2;
  inlineState.conflictRemaining = config.compositeConflictOnce === true ? 1 : 0;
  inlineState.idempotency = new Map();
  if (config.priceScenario !== "current" && config.priceScenario !== "future") return;
  const supplierId = platformSuppliers().at(-1).id;
  mockStore.state.priceLists.push(priceListRecord({
    id: inlineIds.currentList,
    supplierId,
    version: 1,
    effectiveFrom: "2026-08-01T00:00:00.000Z",
    effectiveUntil: config.priceScenario === "future" ? futureStart : null,
    rowVersion: 4,
  }));
  mockStore.state.items.push(priceItemRecord({
    id: inlineIds.currentItem,
    priceListId: inlineIds.currentList,
    sku: tenantSku(),
    unitPrice: "128.00",
  }));
  if (config.priceScenario !== "future") return;
  mockStore.state.priceLists.push(priceListRecord({
    id: inlineIds.futureList,
    supplierId,
    version: 2,
    effectiveFrom: futureStart,
    effectiveUntil: null,
    rowVersion: 2,
  }));
  mockStore.state.items.push(priceItemRecord({
    id: inlineIds.futureItem,
    priceListId: inlineIds.futureList,
    sku: tenantSku(),
    unitPrice: "188.00",
  }));
}

export async function handleSupplierSkuInlinePriceMock(request, response, url) {
  const defaults = url.pathname.match(
    /^\/supplier-products\/([^/]+)\/purchasable-skus\/price-defaults$/,
  );
  if (request.method === "GET" && defaults) {
    return sendPriceDefaults(response, defaults[1], url);
  }
  const currentPrice = url.pathname.match(
    /^\/supplier-products\/([^/]+)\/purchasable-skus\/([^/]+)\/price$/,
  );
  if (request.method === "GET" && currentPrice) {
    return sendCurrentPrice(response, currentPrice[1], currentPrice[2], url);
  }
  const composite = url.pathname.match(
    /^\/supplier-products\/([^/]+)\/purchasable-skus\/([^/]+)$/,
  );
  if ((request.method === "POST" || request.method === "PATCH") && composite) {
    await savePurchasableSku(request, response, url, composite[1], composite[2]);
    return true;
  }
  if (request.method === "GET" && url.pathname === "/supplier-purchase-order-catalog") {
    sendPurchaseCatalog(response, url);
    return true;
  }
  return false;
}

function priceListRecord({
  id,
  supplierId,
  version,
  effectiveFrom,
  effectiveUntil,
  rowVersion,
}) {
  return {
    id,
    tenant_id: currentTenantId(),
    supplier_id: supplierId,
    price_list_code: "DEFAULT",
    version_number: version,
    scope_type: "default",
    name: "默认基础供货价",
    currency: "CNY",
    lifecycle_status: "published",
    effective_from: effectiveFrom,
    effective_until: effectiveUntil,
    supersedes_price_list_id: null,
    published_at: now,
    row_version: rowVersion,
    updated_at: now,
  };
}

function priceItemRecord({ id, priceListId, sku, unitPrice, taxRate = "0.13" }) {
  return {
    id,
    tenant_id: currentTenantId(),
    supplier_id: sku.supplier_id,
    supplier_price_list_id: priceListId,
    supplier_sku_id: sku.id,
    minimum_quantity: "1",
    maximum_quantity: null,
    purchase_unit_id: sku.purchase_unit_id,
    base_unit_id: sku.base_unit_id,
    base_unit_conversion: sku.base_unit_conversion,
    unit_price: unitPrice,
    tax_rate: taxRate,
    tax_inclusive: false,
    sku: { id: sku.id, sku_code: sku.sku_code, name: sku.name, status: sku.status },
    purchase_unit: sku.purchase_unit,
    base_unit: sku.base_unit,
    updated_at: now,
  };
}

function tenantSku(skuId = ids.tenantSku) {
  return mockStore.state.skus.find(({ id }) => id === skuId);
}

function tenantProduct(productId) {
  return mockStore.state.products.find((product) =>
    product.id === productId && urlTenantMode() &&
    product.ownership_scope === "tenant" &&
    product.owner_tenant_id === currentTenantId());
}

function urlTenantMode() {
  return !mockStore.config.sessionMode.startsWith("platform") &&
    mockStore.config.sessionMode !== "tenant-product-only";
}

function validRelationship(url) {
  return url.searchParams.get("tenantSupplierId") ===
    "23000000-0000-4000-8000-000000000021";
}

function sendPriceDefaults(response, productId, url) {
  const product = tenantProduct(productId);
  if (!product || !validRelationship(url)) return sendNotFound(response);
  const current = resolveCurrentPrice(null);
  sendData(response, {
    currency: "CNY",
    recommended_tax_rate: current?.tax_rate ?? "0.13",
    recommended_tax_inclusive: false,
    next_scheduled_effective_from: earliestFutureList()?.effective_from ?? null,
    current_price: null,
  });
  return true;
}

function sendCurrentPrice(response, productId, skuId, url) {
  const product = tenantProduct(productId);
  const sku = tenantSku(skuId);
  if (!product || !sku || sku.supplier_product_id !== productId || !validRelationship(url)) {
    return sendNotFound(response);
  }
  sendData(response, priceContext(skuId));
  return true;
}

function priceContext(skuId) {
  const current = resolveCurrentPrice(skuId);
  return {
    currency: "CNY",
    recommended_tax_rate: current?.tax_rate ?? "0.13",
    recommended_tax_inclusive: false,
    next_scheduled_effective_from: earliestFutureList()?.effective_from ?? null,
    current_price: current,
  };
}

function resolveCurrentPrice(skuId) {
  const pricedAt = Date.parse(now);
  const list = mockStore.state.priceLists
    .filter((record) => record.lifecycle_status === "published" &&
      record.currency === "CNY" && Date.parse(record.effective_from) <= pricedAt &&
      (record.effective_until === null || Date.parse(record.effective_until) > pricedAt))
    .sort((left, right) => right.version_number - left.version_number)[0];
  if (!list) return null;
  const item = mockStore.state.items.find((record) =>
    record.supplier_price_list_id === list.id && (!skuId || record.supplier_sku_id === skuId));
  if (!item) return null;
  return {
    supplier_price_list_id: list.id,
    supplier_price_list_version: list.version_number,
    supplier_price_list_row_version: list.row_version,
    supplier_price_list_item_id: item.id,
    unit_price: item.unit_price,
    tax_rate: item.tax_rate,
    tax_inclusive: item.tax_inclusive,
    effective_from: list.effective_from,
    effective_until: list.effective_until,
  };
}

function earliestFutureList() {
  return mockStore.state.priceLists
    .filter((record) => record.lifecycle_status === "published" &&
      Date.parse(record.effective_from) > Date.parse(now))
    .sort((left, right) => Date.parse(left.effective_from) - Date.parse(right.effective_from))[0];
}

async function savePurchasableSku(request, response, url, productId, skuId) {
  const payload = await readBody(request);
  const attempt = recordMutation(request, url, payload);
  const key = idempotencyKey(request);
  if (!key) return sendError(response, 400, "IDEMPOTENCY_KEY_REQUIRED", "缺少 Idempotency-Key");
  const fingerprint = JSON.stringify({ method: request.method, path: url.pathname, payload });
  const previous = inlineState.idempotency.get(key);
  if (previous) {
    if (previous.fingerprint !== fingerprint) {
      return sendError(response, 409, "SUPPLIER_IDEMPOTENCY_CONFLICT", "幂等请求内容不一致");
    }
    const replay = { ...structuredClone(previous.result), idempotent: true };
    attempt.result = replay;
    return sendData(response, replay);
  }
  if (inlineState.conflictRemaining > 0) {
    inlineState.conflictRemaining -= 1;
    attempt.result = { error_code: "SUPPLIER_PRICE_LIST_VERSION_CONFLICT" };
    return sendError(response, 409, "SUPPLIER_PRICE_LIST_VERSION_CONFLICT", "价格版本已变化，请重试");
  }
  const issue = validateSave(url, productId, skuId, payload, request.method);
  if (issue) return sendError(response, issue.status, issue.code, issue.message);
  const result = applySave(productId, skuId, payload, request.method);
  attempt.result = structuredClone(result);
  inlineState.idempotency.set(key, { fingerprint, result: structuredClone(result) });
  sendData(response, result, request.method === "POST" ? 201 : 200);
}

function validateSave(url, productId, skuId, payload, method) {
  if (!urlTenantMode() || !validRelationship(url)) {
    return { status: 403, code: "FORBIDDEN", message: "无权维护 SKU 即时价格" };
  }
  const product = tenantProduct(productId);
  if (!product) return { status: 404, code: "NOT_FOUND", message: "商品不存在" };
  if (product.status === "inactive") {
    return { status: 409, code: "SUPPLIER_SKU_STATE_CONFLICT", message: "停用商品不能新增 SKU" };
  }
  const price = payload.price;
  if (!validPricePayload(payload, price, method)) {
    return { status: 400, code: "VALIDATION_ERROR", message: "价格参数无效" };
  }
  if (method === "POST") {
    if (tenantSku(skuId)) return { status: 409, code: "SUPPLIER_IDEMPOTENCY_CONFLICT", message: "SKU 已存在" };
    if (!units.some(({ id }) => id === payload.sku?.purchase_unit_id)) {
      return { status: 404, code: "NOT_FOUND", message: "采购单位不存在" };
    }
    return null;
  }
  const sku = tenantSku(skuId);
  if (!sku || sku.status === "inactive") {
    return { status: 409, code: "SUPPLIER_SKU_STATE_CONFLICT", message: "SKU 状态不允许调价" };
  }
  if (payload.sku?.expected_version !== sku.version) {
    return { status: 409, code: "SUPPLIER_SKU_VERSION_CONFLICT", message: "SKU 版本已变化" };
  }
  const current = resolveCurrentPrice(skuId);
  if (price.expected_price_list_id !== current?.supplier_price_list_id ||
    price.expected_price_list_version !== current?.supplier_price_list_row_version) {
    return { status: 409, code: "SUPPLIER_PRICE_LIST_VERSION_CONFLICT", message: "价格版本已变化" };
  }
  return null;
}

function validPricePayload(payload, price, method) {
  const allowedPriceKeys = method === "POST"
    ? ["tax_inclusive", "tax_rate", "unit_price"]
    : ["expected_price_list_id", "expected_price_list_version", "tax_inclusive", "tax_rate", "unit_price"];
  return payload && Object.keys(payload).sort().join() === "price,sku" && price &&
    Object.keys(price).sort().join() === allowedPriceKeys.sort().join() &&
    typeof price.unit_price === "string" &&
    /^(?:0|[1-9]\d{0,11})(?:\.\d{1,2})?$/.test(price.unit_price) &&
    !/^0(?:\.0+)?$/.test(price.unit_price) &&
    typeof price.tax_rate === "string" &&
    /^(?:0(?:\.\d{1,6})?|1(?:\.0{1,6})?)$/.test(price.tax_rate) &&
    typeof price.tax_inclusive === "boolean";
}

function applySave(productId, skuId, payload, method) {
  const product = tenantProduct(productId);
  let sku = tenantSku(skuId);
  if (method === "POST") {
    const unit = units.find(({ id }) => id === payload.sku.purchase_unit_id);
    sku = {
      id: skuId,
      supplier_id: product.supplier_id,
      supplier_product_id: productId,
      sku_code: `TS-${skuId.replaceAll("-", "").toUpperCase()}`,
      ...payload.sku,
      base_unit_id: unit.id,
      base_unit_conversion: "1",
      status: "active",
      version: 1,
      ownership_scope: "tenant",
      owner_tenant_id: currentTenantId(),
      purchase_unit: unit,
      base_unit: unit,
      updated_at: now,
    };
    mockStore.state.skus.push(sku);
  } else {
    const { expected_version: _expectedVersion, ...metadata } = payload.sku;
    Object.assign(sku, metadata, { version: sku.version + 1, updated_at: now });
  }
  product.status = "active";
  const before = resolveCurrentPrice(skuId);
  const priceVersionCreated = !before || !samePrice(before, payload.price);
  if (priceVersionCreated) createImmediatePriceVersion(sku, payload.price, before);
  const current = resolveCurrentPrice(skuId);
  const result = {
    status: "saved",
    idempotent: false,
    price_version_created: priceVersionCreated,
    currency: "CNY",
    product: structuredClone(product),
    sku: structuredClone(sku),
    current_price: current,
    catalog_item: buildCatalogItem(sku, current),
    next_scheduled_effective_from: earliestFutureList()?.effective_from ?? null,
    available_actions: ["edit", "deactivate"],
  };
  return result;
}

function samePrice(current, price) {
  return canonicalDecimal(current.unit_price) === canonicalDecimal(price.unit_price) &&
    canonicalDecimal(current.tax_rate) === canonicalDecimal(price.tax_rate) &&
    current.tax_inclusive === price.tax_inclusive;
}

function canonicalDecimal(value) {
  const [integer, fraction = ""] = value.split(".");
  const trimmed = fraction.replace(/0+$/, "");
  return trimmed ? `${integer}.${trimmed}` : integer;
}

function createImmediatePriceVersion(sku, price, current) {
  const source = current
    ? mockStore.state.priceLists.find(({ id }) => id === current.supplier_price_list_id)
    : null;
  const future = earliestFutureList();
  if (source) {
    source.lifecycle_status = "retired";
    source.effective_until = now;
    source.row_version += 1;
    source.updated_at = now;
  }
  inlineState.sequence += 1;
  const suffix = String(inlineState.sequence).padStart(12, "0");
  const list = priceListRecord({
    id: `28000000-0000-4000-8000-${suffix}`,
    supplierId: sku.supplier_id,
    version: Math.max(0, ...mockStore.state.priceLists.map(({ version_number }) => version_number)) + 1,
    effectiveFrom: now,
    effectiveUntil: future?.effective_from ?? null,
    rowVersion: 1,
  });
  list.supersedes_price_list_id = source?.id ?? null;
  mockStore.state.priceLists.push(list);
  mockStore.state.items.push(priceItemRecord({
    id: `28100000-0000-4000-8000-${suffix}`,
    priceListId: list.id,
    sku,
    unitPrice: price.unit_price,
    taxRate: price.tax_rate,
  }));
  mockStore.state.items.at(-1).tax_inclusive = price.tax_inclusive;
}

function buildCatalogItem(sku, current) {
  const product = mockStore.state.products.find(({ id }) => id === sku.supplier_product_id);
  const unit = sku.purchase_unit;
  return {
    supplier_product_id: product.id,
    product_code: product.product_code,
    product_name: product.name,
    supplier_sku_id: sku.id,
    sku_code: sku.sku_code,
    sku_name: sku.name,
    specification: sku.specification,
    model: sku.model,
    supplier_price_list_id: current.supplier_price_list_id,
    price_list_code: "DEFAULT",
    price_list_version: current.supplier_price_list_version,
    effective_from: current.effective_from,
    effective_until: current.effective_until,
    supplier_price_list_item_id: current.supplier_price_list_item_id,
    purchase_unit_id: unit.id,
    purchase_unit_code: unit.code,
    purchase_unit_name: unit.name,
    purchase_unit_symbol: unit.symbol,
    base_unit_id: sku.base_unit.id,
    base_unit_code: sku.base_unit.code,
    base_unit_name: sku.base_unit.name,
    base_unit_symbol: sku.base_unit.symbol,
    base_unit_conversion: sku.base_unit_conversion,
    unit_price: current.unit_price,
    tax_rate: current.tax_rate,
    tax_inclusive: current.tax_inclusive,
  };
}

function sendPurchaseCatalog(response, url) {
  if (!validRelationship(url) || mockStore.config.sessionMode.startsWith("platform")) {
    return sendError(response, 400, "VALIDATION_ERROR", "合作供应商参数无效");
  }
  const keyword = (url.searchParams.get("keyword") || "").toLowerCase();
  const list = mockStore.state.skus
    .filter((sku) => sku.status === "active" && sku.owner_tenant_id === currentTenantId())
    .map((sku) => ({ sku, current: resolveCurrentPrice(sku.id) }))
    .filter(({ current }) => current)
    .map(({ sku, current }) => buildCatalogItem(sku, current))
    .filter((item) => !keyword || [item.product_code, item.product_name, item.sku_code, item.sku_name]
      .some((value) => value.toLowerCase().includes(keyword)));
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(url.searchParams.get("pageSize")) || 20));
  const start = (page - 1) * pageSize;
  sendData(response, {
    list: list.slice(start, start + pageSize),
    pagination: {
      page,
      pageSize,
      total: list.length,
      totalPages: list.length ? Math.ceil(list.length / pageSize) : 0,
    },
  });
}

function recordMutation(request, url, payload) {
  const mutation = {
    method: request.method,
    path: url.pathname,
    idempotencyKey: idempotencyKey(request),
    payload: structuredClone(payload),
  };
  mockStore.mutations.push(mutation);
  return mutation;
}

function idempotencyKey(request) {
  const value = request.headers["idempotency-key"];
  return Array.isArray(value) ? value[0] : value ?? null;
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

function sendNotFound(response) {
  sendError(response, 404, "NOT_FOUND", "供应商商品或 SKU 不存在");
  return true;
}

function sendError(response, status, code, message) {
  sendJson(response, status, { success: false, code, message });
}

function sendData(response, data, status = 200) {
  sendJson(response, status, { success: true, data });
}

function sendJson(response, status, payload) {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
}
