import { createServer } from "node:http";

import {
  createInitialCatalogState,
  mockCatalogSession,
  mockTenantCatalogSession,
} from "./supplier-catalog-mock-fixture.mjs";

const port = Number.parseInt(
  process.env.SUPPLIER_CATALOG_MOCK_BACKEND_PORT || "3997",
  10,
);

let catalogState = createInitialCatalogState();
let mutations = [];
let conflictNext = null;

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(payload));
}

function readBody(request) {
  return new Promise((resolve) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
  });
}

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function matchesKeyword(record, keyword) {
  if (!keyword) return true;
  const normalized = keyword.trim().toLocaleLowerCase("zh-CN");
  return [record.code, record.name, record.legal_name, record.symbol]
    .filter((value) => typeof value === "string")
    .some((value) => value.toLocaleLowerCase("zh-CN").includes(normalized));
}

function paginate(records, url) {
  const page = positiveInteger(url.searchParams.get("page"), 1);
  const pageSize = Math.min(
    positiveInteger(url.searchParams.get("pageSize"), 20),
    100,
  );
  const keyword = url.searchParams.get("keyword") || "";
  const status = url.searchParams.get("status");
  const filtered = records.filter((record) =>
    matchesKeyword(record, keyword) &&
    (!status || record.status === status)
  ).sort((left, right) =>
    left.sort_order - right.sort_order || left.id.localeCompare(right.id)
  );
  const start = (page - 1) * pageSize;
  return {
    list: filtered.slice(start, start + pageSize),
    pagination: {
      page,
      pageSize,
      total: filtered.length,
      totalPages: filtered.length
        ? Math.ceil(filtered.length / pageSize)
        : 0,
    },
  };
}

function listCategories(url) {
  const parentId = url.searchParams.get("parent_id");
  const records = catalogState.categories.filter((record) =>
    parentId ? record.parent_id === parentId : record.parent_id === null
  );
  return paginate(records, url);
}

function listUnits(url) {
  const unitKind = url.searchParams.get("unit_kind");
  const records = catalogState.units.filter((record) => {
    if (unitKind === "base") return record.base_unit_id === null;
    if (unitKind === "derived") return record.base_unit_id !== null;
    return true;
  });
  return paginate(records, url);
}

function nextCategoryId() {
  return `11000000-0000-4000-8000-${
    String(catalogState.categories.length + 1).padStart(12, "0")
  }`;
}

function nextTenantCategoryId() {
  return `21000000-0000-4000-8000-${
    String(catalogState.tenantCategories.length + 1).padStart(12, "0")
  }`;
}

function nextBrandId() {
  return `12000000-0000-4000-8000-${
    String(catalogState.brands.length + 1).padStart(12, "0")
  }`;
}

function nextUnitId() {
  return `13000000-0000-4000-8000-${
    String(catalogState.units.length + 1).padStart(12, "0")
  }`;
}

function nextSpecId() {
  const count = Object.values(catalogState.specs)
    .reduce((total, records) => total + records.length, 0);
  return `31000000-0000-4000-8000-${String(count + 1).padStart(12, "0")}`;
}

function nextSuggestionId() {
  return `32000000-0000-4000-8000-${
    String(catalogState.unitSuggestions.length + 1).padStart(12, "0")
  }`;
}

function recordMutation(request, url, payload) {
  const header = request.headers["idempotency-key"];
  const idempotencyKey = Array.isArray(header) ? header[0] : header ?? null;
  mutations.push({
    method: request.method,
    path: url.pathname,
    idempotencyKey,
    payload: structuredClone(payload),
  });
}

function readIdempotencyKey(request) {
  const header = request.headers["idempotency-key"];
  return Array.isArray(header) ? header[0] : header;
}

function requireIdempotencyKey(request, response) {
  const idempotencyKey = readIdempotencyKey(request);
  if (idempotencyKey?.trim()) return true;
  sendJson(response, 400, {
    success: false,
    code: "IDEMPOTENCY_KEY_REQUIRED",
    message: "缺少 Idempotency-Key",
  });
  return false;
}

async function createCategory(request, response, url) {
  const payload = JSON.parse(await readBody(request) || "{}");
  if (!requireIdempotencyKey(request, response)) return;
  const now = new Date().toISOString();
  const record = {
    id: nextCategoryId(),
    code: payload.code,
    name: payload.name,
    parent_id: payload.parent_id ?? null,
    level: payload.level,
    status: payload.status,
    sort_order: payload.sort_order,
    version: 1,
    created_at: now,
    updated_at: now,
  };
  catalogState.categories.push(record);
  recordMutation(request, url, payload);
  sendJson(response, 201, { success: true, data: record });
}

async function createTenantCategory(request, response, url) {
  const payload = JSON.parse(await readBody(request) || "{}");
  if (!requireIdempotencyKey(request, response)) return;
  const now = new Date().toISOString();
  const record = {
    id: nextTenantCategoryId(),
    code: payload.code,
    name: payload.name,
    parent_id: payload.parent_id ?? null,
    level: 1,
    full_name: payload.name,
    is_leaf: true,
    mapped_platform_category_id: payload.mapped_platform_category_id ?? null,
    ownership_scope: "tenant",
    owner_tenant_id: mockTenantCatalogSession.tenant.id,
    status: payload.status,
    sort_order: payload.sort_order,
    version: 1,
    created_at: now,
    updated_at: now,
  };
  catalogState.tenantCategories.push(record);
  recordMutation(request, url, payload);
  sendJson(response, 201, { success: true, data: record });
}

async function createSpec(request, response, url, categoryId, scope) {
  const payload = JSON.parse(await readBody(request) || "{}");
  if (!requireIdempotencyKey(request, response)) return;
  const now = new Date().toISOString();
  const record = {
    id: nextSpecId(),
    category_id: categoryId,
    ...payload,
    version: 1,
    ownership_scope: scope,
    owner_tenant_id: scope === "tenant"
      ? mockTenantCatalogSession.tenant.id
      : null,
    source_platform_spec_id: null,
    created_at: now,
    updated_at: now,
  };
  catalogState.specs[categoryId] ||= [];
  catalogState.specs[categoryId].push(record);
  recordMutation(request, url, payload);
  sendJson(response, 201, { success: true, data: record });
}

async function updateSpec(request, response, url, categoryId, specId) {
  const payload = JSON.parse(await readBody(request) || "{}");
  if (!requireIdempotencyKey(request, response)) return;
  const record = (catalogState.specs[categoryId] || [])
    .find(({ id }) => id === specId);
  if (!record) return recordNotFound(response, "spec");
  if (payload.expected_version !== record.version) {
    sendJson(response, 409, {
      success: false,
      code: "SUPPLIER_VERSION_CONFLICT",
      message: "规格版本已变化",
    });
    return;
  }
  for (const [field, value] of Object.entries(payload)) {
    if (field !== "expected_version") record[field] = value;
  }
  record.version += 1;
  record.updated_at = new Date().toISOString();
  recordMutation(request, url, payload);
  sendJson(response, 200, { success: true, data: record });
}

async function copyPlatformSpecs(request, response, url, categoryId) {
  const payload = JSON.parse(await readBody(request) || "{}");
  if (!requireIdempotencyKey(request, response)) return;
  const source = catalogState.specs[payload.platform_category_id] || [];
  const now = new Date().toISOString();
  const copies = source.map((spec) => ({
    ...structuredClone(spec),
    id: nextSpecId(),
    category_id: categoryId,
    ownership_scope: "tenant",
    owner_tenant_id: mockTenantCatalogSession.tenant.id,
    source_platform_spec_id: spec.id,
    version: 1,
    created_at: now,
    updated_at: now,
  }));
  catalogState.specs[categoryId] = copies;
  recordMutation(request, url, payload);
  sendJson(response, 200, { success: true, data: copies });
}

async function createUnitSuggestion(request, response, url) {
  const payload = JSON.parse(await readBody(request) || "{}");
  if (!requireIdempotencyKey(request, response)) return;
  const now = new Date().toISOString();
  const record = {
    id: nextSuggestionId(),
    tenant_id: mockTenantCatalogSession.tenant.id,
    ...payload,
    status: "submitted",
    version: 1,
    reviewed_at: null,
    review_remark: null,
    approved_catalog_unit_id: null,
    created_at: now,
    updated_at: now,
  };
  catalogState.unitSuggestions.push(record);
  recordMutation(request, url, payload);
  sendJson(response, 201, { success: true, data: record });
}

async function reviewUnitSuggestion(request, response, url, suggestionId) {
  const payload = JSON.parse(await readBody(request) || "{}");
  if (!requireIdempotencyKey(request, response)) return;
  const record = catalogState.unitSuggestions.find(({ id }) => id === suggestionId);
  if (!record) return recordNotFound(response, "unit_suggestion");
  record.status = payload.action;
  record.review_remark = payload.review_remark;
  record.approved_catalog_unit_id = payload.approved_catalog_unit_id;
  record.reviewed_at = new Date().toISOString();
  record.updated_at = record.reviewed_at;
  record.version += 1;
  recordMutation(request, url, payload);
  sendJson(response, 200, { success: true, data: record });
}

async function updateCategory(request, response, url, categoryId) {
  const payload = JSON.parse(await readBody(request) || "{}");
  const record = catalogState.categories.find(({ id }) => id === categoryId);
  if (!record) {
    sendJson(response, 404, {
      success: false,
      code: "CATALOG_CATEGORY_NOT_FOUND",
      message: "标准类目不存在",
    });
    return;
  }
  if (payload.expected_version !== record.version) {
    sendJson(response, 409, {
      success: false,
      code: "SUPPLIER_VERSION_CONFLICT",
      message: "目录数据版本已变化",
      details: {
        current_version: record.version,
        current_status: record.status,
      },
    });
    return;
  }
  for (const field of ["code", "name", "sort_order", "status"]) {
    if (field in payload) record[field] = payload[field];
  }
  record.version += 1;
  record.updated_at = new Date().toISOString();
  recordMutation(request, url, payload);
  sendJson(response, 200, { success: true, data: record });
}

async function createBrand(request, response, url) {
  const payload = JSON.parse(await readBody(request) || "{}");
  if (!requireIdempotencyKey(request, response)) return;
  const now = new Date().toISOString();
  const record = {
    id: nextBrandId(),
    code: payload.code,
    name: payload.name,
    legal_name: payload.legal_name ?? null,
    logo_file_id: null,
    status: payload.status,
    sort_order: payload.sort_order,
    version: 1,
    created_at: now,
    updated_at: now,
  };
  catalogState.brands.push(record);
  recordMutation(request, url, payload);
  sendJson(response, 201, { success: true, data: record });
}

function baseUnitProjection(baseUnitId) {
  if (!baseUnitId) return null;
  const baseUnit = catalogState.units.find(({ id }) => id === baseUnitId);
  if (!baseUnit) return null;
  return {
    id: baseUnit.id,
    code: baseUnit.code,
    name: baseUnit.name,
    symbol: baseUnit.symbol,
    unit_dimension: baseUnit.unit_dimension,
    status: baseUnit.status,
  };
}

async function createUnit(request, response, url) {
  const payload = JSON.parse(await readBody(request) || "{}");
  if (!requireIdempotencyKey(request, response)) return;
  const now = new Date().toISOString();
  const record = {
    id: nextUnitId(),
    code: payload.code,
    name: payload.name,
    symbol: payload.symbol,
    base_unit_id: payload.base_unit_id ?? null,
    base_unit: baseUnitProjection(payload.base_unit_id),
    conversion_factor: String(payload.conversion_factor),
    unit_dimension: payload.unit_dimension,
    status: payload.status,
    sort_order: payload.sort_order,
    version: 1,
    created_at: now,
    updated_at: now,
  };
  catalogState.units.push(record);
  recordMutation(request, url, payload);
  sendJson(response, 201, { success: true, data: record });
}

function recordNotFound(response, kind) {
  sendJson(response, 404, {
    success: false,
    code: `CATALOG_${kind.toUpperCase()}_NOT_FOUND`,
    message: "目录数据不存在",
  });
}

function applyConflict(request, response, url, kind, record, payload) {
  if (conflictNext?.kind !== kind || conflictNext.id !== record.id) {
    return false;
  }
  conflictNext = null;
  record.version += 1;
  record.updated_at = new Date().toISOString();
  recordMutation(request, url, payload);
  sendJson(response, 409, {
    success: false,
    code: "SUPPLIER_VERSION_CONFLICT",
    message: "目录数据版本已变化",
    details: {
      current_version: record.version,
      current_status: record.status,
    },
  });
  return true;
}

function updateRecord(request, response, url, input) {
  const { kind, records, recordId, payload, writableFields } = input;
  const record = records.find(({ id }) => id === recordId);
  if (!record) {
    recordNotFound(response, kind);
    return;
  }
  if (applyConflict(request, response, url, kind, record, payload)) return;
  if (payload.expected_version !== record.version) {
    sendJson(response, 409, {
      success: false,
      code: "SUPPLIER_VERSION_CONFLICT",
      message: "目录数据版本已变化",
      details: {
        current_version: record.version,
        current_status: record.status,
      },
    });
    return;
  }
  for (const field of writableFields) {
    if (field in payload) record[field] = payload[field];
  }
  if (kind === "unit" && "base_unit_id" in payload) {
    record.base_unit = baseUnitProjection(record.base_unit_id);
  }
  record.version += 1;
  record.updated_at = new Date().toISOString();
  recordMutation(request, url, payload);
  sendJson(response, 200, { success: true, data: record });
}

const server = createServer(async (request, response) => {
  const url = new URL(
    request.url || "/",
    `http://${request.headers.host || `127.0.0.1:${port}`}`,
  );

  if (request.method === "GET" && url.pathname === "/health") {
    sendJson(response, 200, { success: true });
    return;
  }
  if (request.method === "POST" && url.pathname === "/__test/reset") {
    await readBody(request);
    catalogState = createInitialCatalogState();
    mutations = [];
    conflictNext = null;
    sendJson(response, 200, { success: true });
    return;
  }
  if (request.method === "GET" && url.pathname === "/__test/mutations") {
    sendJson(response, 200, { mutations });
    return;
  }
  if (request.method === "POST" && url.pathname === "/__test/conflict-next") {
    conflictNext = JSON.parse(await readBody(request) || "{}");
    sendJson(response, 200, { success: true });
    return;
  }
  if (request.method === "POST" && url.pathname === "/admin/auth/login") {
    const payload = JSON.parse(await readBody(request) || "{}");
    const session = payload.phone === mockTenantCatalogSession.employee.phone
      ? mockTenantCatalogSession
      : mockCatalogSession;
    sendJson(response, 200, { success: true, data: session });
    return;
  }
  if (request.method === "GET" && url.pathname === "/admin/auth/me") {
    const session = request.headers.authorization?.includes(
        mockTenantCatalogSession.token,
      )
      ? mockTenantCatalogSession
      : mockCatalogSession;
    sendJson(response, 200, { success: true, data: session });
    return;
  }
  if (request.method === "GET" && url.pathname === "/catalog/categories") {
    sendJson(response, 200, {
      success: true,
      data: paginate(catalogState.tenantCategories, url),
    });
    return;
  }
  if (request.method === "POST" && url.pathname === "/catalog/categories") {
    await createTenantCategory(request, response, url);
    return;
  }
  if (request.method === "GET" && url.pathname === "/catalog/brands") {
    const records = catalogState.brands.map((record) => ({
      ...record,
      mapped_platform_brand_id: null,
      ownership_scope: "platform",
      owner_tenant_id: null,
    }));
    sendJson(response, 200, { success: true, data: paginate(records, url) });
    return;
  }
  if (request.method === "GET" && url.pathname === "/catalog/units") {
    sendJson(response, 200, { success: true, data: listUnits(url) });
    return;
  }
  if (request.method === "GET" && url.pathname === "/catalog/unit-suggestions") {
    sendJson(response, 200, {
      success: true,
      data: paginate(catalogState.unitSuggestions, url),
    });
    return;
  }
  if (request.method === "POST" && url.pathname === "/catalog/unit-suggestions") {
    await createUnitSuggestion(request, response, url);
    return;
  }
  if (
    request.method === "GET" &&
    url.pathname === "/platform/catalog/categories"
  ) {
    sendJson(response, 200, { success: true, data: listCategories(url) });
    return;
  }
  if (
    request.method === "GET" &&
    url.pathname === "/platform/catalog/brands"
  ) {
    sendJson(response, 200, {
      success: true,
      data: paginate(catalogState.brands, url),
    });
    return;
  }
  if (
    request.method === "GET" &&
    url.pathname === "/platform/catalog/units"
  ) {
    sendJson(response, 200, { success: true, data: listUnits(url) });
    return;
  }
  if (
    request.method === "GET" &&
    url.pathname === "/platform/catalog/unit-suggestions"
  ) {
    sendJson(response, 200, {
      success: true,
      data: paginate(catalogState.unitSuggestions, url),
    });
    return;
  }
  if (
    request.method === "POST" &&
    url.pathname === "/platform/catalog/categories"
  ) {
    await createCategory(request, response, url);
    return;
  }
  if (
    request.method === "POST" &&
    url.pathname === "/platform/catalog/brands"
  ) {
    await createBrand(request, response, url);
    return;
  }
  if (
    request.method === "POST" &&
    url.pathname === "/platform/catalog/units"
  ) {
    await createUnit(request, response, url);
    return;
  }
  const platformSpecListMatch = url.pathname.match(
    /^\/platform\/catalog\/categories\/([^/]+)\/spec-definitions$/,
  );
  if (request.method === "GET" && platformSpecListMatch) {
    const categoryId = decodeURIComponent(platformSpecListMatch[1]);
    sendJson(response, 200, {
      success: true,
      data: paginate(catalogState.specs[categoryId] || [], url),
    });
    return;
  }
  if (request.method === "POST" && platformSpecListMatch) {
    await createSpec(
      request,
      response,
      url,
      decodeURIComponent(platformSpecListMatch[1]),
      "platform",
    );
    return;
  }
  const platformSpecItemMatch = url.pathname.match(
    /^\/platform\/catalog\/categories\/([^/]+)\/spec-definitions\/([^/]+)$/,
  );
  if (request.method === "PATCH" && platformSpecItemMatch) {
    await updateSpec(
      request,
      response,
      url,
      decodeURIComponent(platformSpecItemMatch[1]),
      decodeURIComponent(platformSpecItemMatch[2]),
    );
    return;
  }
  const tenantSpecListMatch = url.pathname.match(
    /^\/catalog\/categories\/([^/]+)\/spec-definitions$/,
  );
  if (request.method === "GET" && tenantSpecListMatch) {
    const categoryId = decodeURIComponent(tenantSpecListMatch[1]);
    sendJson(response, 200, {
      success: true,
      data: paginate(catalogState.specs[categoryId] || [], url),
    });
    return;
  }
  if (request.method === "POST" && tenantSpecListMatch) {
    await createSpec(
      request,
      response,
      url,
      decodeURIComponent(tenantSpecListMatch[1]),
      "tenant",
    );
    return;
  }
  const tenantCopySpecsMatch = url.pathname.match(
    /^\/catalog\/categories\/([^/]+)\/spec-definitions:copy-platform$/,
  );
  if (request.method === "POST" && tenantCopySpecsMatch) {
    await copyPlatformSpecs(
      request,
      response,
      url,
      decodeURIComponent(tenantCopySpecsMatch[1]),
    );
    return;
  }
  const tenantSpecItemMatch = url.pathname.match(
    /^\/catalog\/categories\/([^/]+)\/spec-definitions\/([^/]+)$/,
  );
  if (request.method === "PATCH" && tenantSpecItemMatch) {
    await updateSpec(
      request,
      response,
      url,
      decodeURIComponent(tenantSpecItemMatch[1]),
      decodeURIComponent(tenantSpecItemMatch[2]),
    );
    return;
  }
  const suggestionReviewMatch = url.pathname.match(
    /^\/platform\/catalog\/unit-suggestions\/([^/]+)$/,
  );
  if (request.method === "PATCH" && suggestionReviewMatch) {
    await reviewUnitSuggestion(
      request,
      response,
      url,
      decodeURIComponent(suggestionReviewMatch[1]),
    );
    return;
  }
  const categoryMatch = url.pathname.match(
    /^\/platform\/catalog\/categories\/([^/]+)$/,
  );
  if (request.method === "PATCH" && categoryMatch) {
    await updateCategory(
      request,
      response,
      url,
      decodeURIComponent(categoryMatch[1]),
    );
    return;
  }
  const brandMatch = url.pathname.match(
    /^\/platform\/catalog\/brands\/([^/]+)$/,
  );
  if (request.method === "PATCH" && brandMatch) {
    const payload = JSON.parse(await readBody(request) || "{}");
    updateRecord(request, response, url, {
      kind: "brand",
      records: catalogState.brands,
      recordId: decodeURIComponent(brandMatch[1]),
      payload,
      writableFields: [
        "code",
        "name",
        "legal_name",
        "sort_order",
        "status",
      ],
    });
    return;
  }
  const unitMatch = url.pathname.match(
    /^\/platform\/catalog\/units\/([^/]+)$/,
  );
  if (request.method === "PATCH" && unitMatch) {
    const payload = JSON.parse(await readBody(request) || "{}");
    updateRecord(request, response, url, {
      kind: "unit",
      records: catalogState.units,
      recordId: decodeURIComponent(unitMatch[1]),
      payload,
      writableFields: [
        "code",
        "name",
        "symbol",
        "base_unit_id",
        "conversion_factor",
        "sort_order",
        "status",
      ],
    });
    return;
  }
  if (
    ["POST", "PATCH"].includes(request.method || "") &&
    url.pathname.startsWith("/platform/catalog/")
  ) {
    await readBody(request);
    sendJson(response, 501, {
      success: false,
      code: "MOCK_MUTATION_NOT_IMPLEMENTED",
      message: "目录 Mock 写接口尚未实现",
    });
    return;
  }
  if (request.method === "GET" && url.pathname === "/notifications/summary") {
    sendJson(response, 200, {
      success: true,
      data: { unread_count: 0 },
    });
    return;
  }
  if (request.method === "GET" && url.pathname === "/notifications") {
    sendJson(response, 200, {
      success: true,
      data: {
        list: [],
        pagination: {
          page: 1,
          pageSize: 20,
          total: 0,
          totalPages: 0,
        },
      },
    });
    return;
  }

  sendJson(response, 404, {
    success: false,
    code: "MOCK_ROUTE_NOT_FOUND",
    message: `Mock route not found: ${request.method} ${url.pathname}`,
  });
});

server.listen(port, "127.0.0.1", () => {
  console.log(
    `[supplier-catalog-mock] listening on http://127.0.0.1:${port}`,
  );
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
