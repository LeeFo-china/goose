import {
  brands,
  categories,
  currentTenantId,
  currentSession,
  ids,
  mockPort,
  mockStore,
  now,
  paginate,
  platformSuppliers,
  resetMockStore,
  specDefinitions,
  tenantRelationships,
  units,
} from "./supplier-product-pricing-mock-state.mjs";

function sendJson(response, status, payload) {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
}

function sendData(response, data, status = 200) {
  sendJson(response, status, { success: true, data });
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

function recordRequest(request, url) {
  if (url.pathname.startsWith("/__test") || url.pathname === "/health") return;
  mockStore.requests.push({
    method: request.method,
    path: url.pathname,
    query: url.search,
  });
}

function recordMutation(request, url, payload) {
  mockStore.mutations.push({
    method: request.method,
    path: url.pathname,
    idempotencyKey: idempotencyKey(request),
    payload: structuredClone(payload),
  });
}

function notFound(response, message) {
  sendJson(response, 404, { success: false, code: "NOT_FOUND", message });
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

function supplierIdFor(url, platform) {
  if (platform) return url.searchParams.get("supplierId");
  const relationshipId = url.searchParams.get("tenantSupplierId");
  return tenantRelationships().find(({ id }) => id === relationshipId)?.supplier_id ?? null;
}

function visibleProducts(url, platform) {
  const supplierId = supplierIdFor(url, platform);
  const tenantId = currentTenantId();
  return mockStore.state.products.filter((product) =>
    product.supplier_id === supplierId && (platform
      ? product.ownership_scope === "platform"
      : product.ownership_scope === "platform" || product.owner_tenant_id === tenantId));
}

function visibleSkus(url, productId, platform) {
  const tenantId = currentTenantId();
  return mockStore.state.skus.filter((sku) =>
    sku.supplier_product_id === productId && (platform
      ? sku.ownership_scope === "platform"
      : sku.ownership_scope === "platform" || sku.owner_tenant_id === tenantId));
}

function catalogList(records, platform) {
  const tenantId = currentTenantId();
  return platform
    ? records.filter(({ ownership_scope }) => ownership_scope === "platform")
    : records.filter(({ owner_tenant_id }) => !owner_tenant_id || owner_tenant_id === tenantId);
}

function writableInScope(record, platform) {
  return platform
    ? record.ownership_scope === "platform"
    : record.ownership_scope === "tenant" && record.owner_tenant_id === currentTenantId();
}

async function createProduct(request, response, url, productId, platform) {
  if (!requireIdempotency(request, response)) return;
  const payload = await readBody(request);
  const supplierId = supplierIdFor(url, platform);
  const category = categories.find(({ id }) => id === payload.category_id);
  const brand = brands.find(({ id }) => id === payload.brand_id);
  if (!supplierId || !category || !brand) return notFound(response, "供应商目录不存在");
  mockStore.state.products.push({
    id: productId,
    supplier_id: supplierId,
    product_code: payload.product_code,
    name: payload.name,
    description: payload.description,
    status: "draft",
    version: 1,
    ownership_scope: platform ? "platform" : "tenant",
    owner_tenant_id: platform ? null : currentTenantId(),
    category,
    brand,
    updated_at: now,
  });
  recordMutation(request, url, payload);
  sendData(response, { status: "created", product: { id: productId }, version: 1 }, 201);
}

async function updateProduct(request, response, url, productId, platform) {
  if (!requireIdempotency(request, response)) return;
  const payload = await readBody(request);
  const product = mockStore.state.products.find(
    (record) => record.id === productId && writableInScope(record, platform),
  );
  if (!product) return notFound(response, "商品不存在");
  if (payload.expected_version !== product.version) return conflict(response, product);
  const category = categories.find(({ id }) => id === payload.category_id);
  const brand = brands.find(({ id }) => id === payload.brand_id);
  Object.assign(product, payload, {
    category: category ?? product.category,
    brand: brand ?? product.brand,
    version: product.version + 1,
    updated_at: now,
  });
  delete product.expected_version;
  recordMutation(request, url, payload);
  sendData(response, { status: "updated", product: { id: productId }, version: product.version });
}

async function createSku(request, response, url, productId, skuId, platform) {
  if (!requireIdempotency(request, response)) return;
  const payload = await readBody(request);
  const product = mockStore.state.products.find(({ id }) => id === productId);
  const purchaseUnit = units.find(({ id }) => id === payload.purchase_unit_id);
  if (!product || !writableInScope(product, platform) || !purchaseUnit) {
    return notFound(response, "商品或单位不存在");
  }
  mockStore.state.skus.push({
    id: skuId,
    supplier_id: product.supplier_id,
    supplier_product_id: productId,
    sku_code: payload.sku_code,
    name: payload.name,
    specification: payload.specification,
    model: payload.model,
    spec_values: payload.spec_values,
    purchase_unit_id: purchaseUnit.id,
    base_unit_id: purchaseUnit.id,
    base_unit_conversion: "1",
    batch_managed: payload.batch_managed,
    color_managed: payload.color_managed,
    serial_managed: payload.serial_managed,
    status: "draft",
    version: 1,
    ownership_scope: platform ? "platform" : "tenant",
    owner_tenant_id: platform ? null : currentTenantId(),
    purchase_unit: purchaseUnit,
    base_unit: purchaseUnit,
    updated_at: now,
  });
  recordMutation(request, url, payload);
  sendData(response, { status: "created", sku: { id: skuId }, version: 1 }, 201);
}

async function updateSku(request, response, url, skuId, platform) {
  if (!requireIdempotency(request, response)) return;
  const payload = await readBody(request);
  const sku = mockStore.state.skus.find(
    (record) => record.id === skuId && writableInScope(record, platform),
  );
  if (!sku) return notFound(response, "SKU 不存在");
  if (payload.expected_version !== sku.version) return conflict(response, sku);
  if ("purchase_unit_id" in payload || "base_unit_id" in payload) {
    return sendJson(response, 400, {
      success: false,
      code: "UNIT_IDENTITY_REQUIRES_CONVERSION_COMMAND",
      message: "单位身份必须通过单位换算命令维护",
    });
  }
  Object.assign(sku, payload, {
    version: sku.version + 1,
    updated_at: now,
  });
  delete sku.expected_version;
  recordMutation(request, url, payload);
  sendData(response, { status: "updated", sku: { id: skuId }, version: sku.version });
}

async function mutateStatus(request, response, url, kind, id, action, platform) {
  if (!requireIdempotency(request, response)) return;
  const payload = await readBody(request);
  const records = kind === "product" ? mockStore.state.products : mockStore.state.skus;
  const record = records.find((item) =>
    item.id === id && writableInScope(item, platform));
  if (!record) return notFound(response, "供应商主数据不存在");
  if (payload.expected_version !== record.version) return conflict(response, record);
  record.status = action === "activate" ? "active" : "inactive";
  record.version += 1;
  record.updated_at = now;
  recordMutation(request, url, payload);
  sendData(response, { status: "updated", [kind]: { id }, version: record.version });
}

async function replaceConversions(request, response, url, skuId, platform) {
  if (!requireIdempotency(request, response)) return;
  const payload = await readBody(request);
  const sku = mockStore.state.skus.find(
    (record) => record.id === skuId && writableInScope(record, platform),
  );
  if (!sku) return notFound(response, "SKU 不存在");
  if (payload.expected_version !== sku.version) return conflict(response, sku);
  const purchaseUnit = units.find(({ id }) => id === payload.purchase_unit_id);
  const baseUnit = units.find(({ id }) => id === payload.base_unit_id);
  if (!purchaseUnit || !baseUnit) return notFound(response, "换算单位不存在");
  let currentUnitId = purchaseUnit.id;
  let baseFactor = 1;
  const visited = new Set();
  while (currentUnitId !== baseUnit.id) {
    if (visited.has(currentUnitId)) return notFound(response, "换算链存在循环");
    visited.add(currentUnitId);
    const edge = payload.conversions.find(
      ({ from_unit_id }) => from_unit_id === currentUnitId,
    );
    if (!edge) return notFound(response, "换算链未到达库存基本单位");
    baseFactor *= Number(edge.factor);
    currentUnitId = edge.to_unit_id;
  }
  mockStore.state.conversions = mockStore.state.conversions.filter((edge) => edge.sku_id !== skuId);
  mockStore.state.conversions.push(...payload.conversions.map((edge) => ({ ...edge, sku_id: skuId })));
  Object.assign(sku, {
    purchase_unit_id: purchaseUnit.id,
    base_unit_id: baseUnit.id,
    base_unit_conversion: String(baseFactor),
    purchase_unit: purchaseUnit,
    base_unit: baseUnit,
  });
  sku.version += 1;
  recordMutation(request, url, payload);
  sendData(response, { status: "updated", sku: { id: skuId }, version: sku.version });
}

function listConversions(response, skuId, platform) {
  const sku = mockStore.state.skus.find(
    (record) => record.id === skuId && (platform
      ? record.ownership_scope === "platform"
      : record.ownership_scope === "platform" ||
        record.owner_tenant_id === currentTenantId()),
  );
  if (!sku) return notFound(response, "SKU 不存在");
  const list = mockStore.state.conversions.filter((edge) => edge.sku_id === skuId).map((edge) => ({
    from_unit_id: edge.from_unit_id,
    to_unit_id: edge.to_unit_id,
    factor: edge.factor,
    from_unit: units.find(({ id }) => id === edge.from_unit_id),
    to_unit: units.find(({ id }) => id === edge.to_unit_id),
  }));
  sendData(response, list);
}

async function createPriceList(request, response, url, priceListId) {
  if (!requireIdempotency(request, response)) return;
  const payload = await readBody(request);
  const supplierId = supplierIdFor(url, false);
  mockStore.state.priceLists.push({
    id: priceListId,
    supplier_id: supplierId,
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
  sendData(response, { status: "created", price_list: { id: priceListId }, version: 1 }, 201);
}

async function upsertPriceItem(request, response, url, priceListId, itemId) {
  if (!requireIdempotency(request, response)) return;
  const payload = await readBody(request);
  const priceList = mockStore.state.priceLists.find(({ id }) => id === priceListId);
  const sku = mockStore.state.skus.find(({ id }) => id === payload.supplier_sku_id);
  if (!priceList || !sku) return notFound(response, "价格簿或 SKU 不存在");
  if (payload.expected_version !== priceList.row_version) return conflict(response, priceList, "row_version");
  mockStore.state.items.push({
    id: itemId,
    supplier_id: priceList.supplier_id,
    supplier_price_list_id: priceListId,
    supplier_sku_id: sku.id,
    minimum_quantity: "1",
    maximum_quantity: null,
    purchase_unit_id: sku.purchase_unit_id,
    base_unit_id: sku.base_unit_id,
    base_unit_conversion: sku.base_unit_conversion,
    unit_price: Number(payload.unit_price).toFixed(2),
    tax_rate: Number(payload.tax_rate).toFixed(6),
    tax_inclusive: payload.tax_inclusive,
    sku: { id: sku.id, sku_code: sku.sku_code, name: sku.name, status: sku.status },
    purchase_unit: sku.purchase_unit,
    base_unit: sku.base_unit,
    updated_at: now,
  });
  priceList.row_version += 1;
  recordMutation(request, url, payload);
  sendData(response, { status: "updated", item: { id: itemId }, version: priceList.row_version });
}

async function publishPriceList(request, response, url, priceListId) {
  if (!requireIdempotency(request, response)) return;
  const payload = await readBody(request);
  const priceList = mockStore.state.priceLists.find(({ id }) => id === priceListId);
  if (!priceList) return notFound(response, "价格簿不存在");
  if (payload.expected_version !== priceList.row_version) return conflict(response, priceList, "row_version");
  priceList.lifecycle_status = "published";
  priceList.published_at = now;
  priceList.row_version += 1;
  recordMutation(request, url, payload);
  sendData(response, { status: "published", price_list: { id: priceListId }, version: priceList.row_version });
}

export async function handleSupplierProductPricingMock(request, response) {
  const url = new URL(request.url || "/", `http://${request.headers.host || `127.0.0.1:${mockPort}`}`);
  recordRequest(request, url);
  if (request.method === "GET" && url.pathname === "/health") return sendData(response, {});
  if (request.method === "POST" && url.pathname === "/__test/reset") {
    const config = await readBody(request);
    resetMockStore(config);
    return sendData(response, {});
  }
  if (request.method === "GET" && url.pathname === "/__test/mutations") return sendJson(response, 200, { mutations: mockStore.mutations });
  if (request.method === "GET" && url.pathname === "/__test/requests") return sendJson(response, 200, { requests: mockStore.requests });
  if (request.method === "POST" && url.pathname === "/admin/auth/login") {
    await readBody(request);
    return sendData(response, currentSession());
  }
  if (request.method === "GET" && url.pathname === "/admin/auth/me") return sendData(response, currentSession());
  if (request.method === "GET" && url.pathname === "/suppliers") return sendData(response, paginate(tenantRelationships(), url));
  if (request.method === "GET" && url.pathname === "/platform/suppliers") return sendData(response, paginate(platformSuppliers(), url));
  const catalog = url.pathname.match(/^\/(platform\/)?catalog\/(categories|brands|units)$/);
  if (request.method === "GET" && catalog) {
    const records = catalog[2] === "categories" ? categories : catalog[2] === "brands" ? brands : units;
    return sendData(response, paginate(catalog[2] === "units" ? records : catalogList(records, Boolean(catalog[1])), url));
  }
  const specs = url.pathname.match(/^\/(platform\/)?catalog\/categories\/([^/]+)\/spec-definitions$/);
  if (request.method === "GET" && specs) return sendData(response, paginate(specDefinitions.map((item) => ({ ...item, category_id: specs[2] })), url));
  if (request.method === "GET" && url.pathname === "/supplier-products") return sendData(response, paginate(visibleProducts(url, false), url));
  if (request.method === "GET" && url.pathname === "/platform/supplier-products") return sendData(response, paginate(visibleProducts(url, true), url));
  const skuList = url.pathname.match(/^\/(platform\/)?supplier-products\/([^/]+)\/skus$/);
  if (request.method === "GET" && skuList) return sendData(response, paginate(visibleSkus(url, skuList[2], Boolean(skuList[1])), url));
  const conversions = url.pathname.match(/^\/(platform\/)?supplier-products\/[^/]+\/skus\/([^/]+)\/unit-conversions$/);
  if (request.method === "GET" && conversions) return listConversions(response, conversions[2], Boolean(conversions[1]));
  if (request.method === "PUT" && conversions) return replaceConversions(request, response, url, conversions[2], Boolean(conversions[1]));
  const skuResource = url.pathname.match(/^\/(platform\/)?supplier-products\/([^/]+)\/skus\/([^/]+)$/);
  if (request.method === "POST" && skuResource) return createSku(request, response, url, skuResource[2], skuResource[3], Boolean(skuResource[1]));
  if (request.method === "PATCH" && skuResource) return updateSku(request, response, url, skuResource[3], Boolean(skuResource[1]));
  const skuStatus = url.pathname.match(/^\/(platform\/)?supplier-products\/[^/]+\/skus\/([^/]+)\/(activate|deactivate)$/);
  if (request.method === "POST" && skuStatus) return mutateStatus(request, response, url, "sku", skuStatus[2], skuStatus[3], Boolean(skuStatus[1]));
  const productStatus = url.pathname.match(/^\/(platform\/)?supplier-products\/([^/]+)\/(activate|deactivate)$/);
  if (request.method === "POST" && productStatus) return mutateStatus(request, response, url, "product", productStatus[2], productStatus[3], Boolean(productStatus[1]));
  const productResource = url.pathname.match(/^\/(platform\/)?supplier-products\/([^/]+)$/);
  if (request.method === "POST" && productResource) return createProduct(request, response, url, productResource[2], Boolean(productResource[1]));
  if (request.method === "PATCH" && productResource) return updateProduct(request, response, url, productResource[2], Boolean(productResource[1]));
  if (request.method === "GET" && url.pathname === "/supplier-price-lists") return sendData(response, paginate(mockStore.state.priceLists, url));
  const itemList = url.pathname.match(/^\/supplier-price-lists\/([^/]+)\/items$/);
  if (request.method === "GET" && itemList) return sendData(response, paginate(mockStore.state.items.filter(({ supplier_price_list_id }) => supplier_price_list_id === itemList[1]), url));
  const itemMutation = url.pathname.match(/^\/supplier-price-lists\/([^/]+)\/items\/([^/]+)$/);
  if (request.method === "PUT" && itemMutation) return upsertPriceItem(request, response, url, itemMutation[1], itemMutation[2]);
  const pricePublish = url.pathname.match(/^\/supplier-price-lists\/([^/]+)\/publish$/);
  if (request.method === "POST" && pricePublish) return publishPriceList(request, response, url, pricePublish[1]);
  const priceCreate = url.pathname.match(/^\/supplier-price-lists\/([^/]+)$/);
  if (request.method === "POST" && priceCreate) return createPriceList(request, response, url, priceCreate[1]);
  if (request.method === "GET" && url.pathname === "/notifications/summary") return sendData(response, { unread_count: 0 });
  if (request.method === "GET" && url.pathname === "/notifications") return sendData(response, paginate([], url));
  sendJson(response, 404, {
    success: false,
    code: "MOCK_ROUTE_NOT_FOUND",
    message: `Mock route not found: ${request.method} ${url.pathname}`,
  });
}
