import {
  createInitialCatalogState,
  mockTenantCatalogSession,
} from "./supplier-catalog-mock-fixture.mjs";
import { paginate, readBody, sendJson } from "./supplier-catalog-mock-support.mjs";

export function createCatalogMockRuntime() {
  let state = createInitialCatalogState();
  let mutations = [];
  let catalogRequests = [];
  let conflictNext = null;

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

  function requireIdempotencyKey(request, response) {
    const header = request.headers["idempotency-key"];
    const key = Array.isArray(header) ? header[0] : header;
    if (key?.trim()) return true;
    sendJson(response, 400, {
      success: false,
      code: "IDEMPOTENCY_KEY_REQUIRED",
      message: "缺少 Idempotency-Key",
    });
    return false;
  }

  function nextId(prefix, count) {
    return `${prefix}-0000-4000-8000-${String(count + 1).padStart(12, "0")}`;
  }

  function nextAvailableId(prefix, records) {
    let count = 0;
    while (records.some(({ id }) => id === nextId(prefix, count))) count += 1;
    return nextId(prefix, count);
  }

  function nextSpecId() {
    const count = Object.values(state.specs)
      .reduce((total, records) => total + records.length, 0);
    return nextId("31000000", count);
  }

  function listCategories(url) {
    const parentId = url.searchParams.get("parent_id");
    return paginate(state.categories.filter((record) =>
      parentId ? record.parent_id === parentId : record.parent_id === null
    ), url);
  }

  function filterCatalogRecords(records, url) {
    const keyword = (url.searchParams.get("keyword") || "").toLowerCase();
    const status = url.searchParams.get("status");
    return records.filter((record) =>
      (!status || record.status === status) &&
      (!keyword || record.code.toLowerCase().includes(keyword) ||
        record.name.toLowerCase().includes(keyword))
    );
  }

  function listTenantCategories(url) {
    const parentId = url.searchParams.get("parent_id");
    return paginate(filterCatalogRecords(state.tenantCategories, url).filter((record) =>
      (parentId ? record.parent_id === parentId : record.parent_id === null) &&
      (url.searchParams.get("scope") !== "platform" ||
        record.ownership_scope === "platform")
    ), url);
  }

  function listTenantBrands(url) {
    const platformRecords = state.brands.map((record) => ({
      ...record,
      mapped_platform_brand_id: null,
      mapped_platform_brand: null,
      ownership_scope: "platform",
      owner_tenant_id: null,
    }));
    const records = url.searchParams.get("scope") === "platform"
      ? platformRecords
      : [...platformRecords, ...state.tenantBrands];
    return paginate(filterCatalogRecords(records, url), url);
  }

  function listUnits(url) {
    const kind = url.searchParams.get("unit_kind");
    return paginate(state.units.filter((record) => {
      if (kind === "base") return record.base_unit_id === null;
      if (kind === "derived") return record.base_unit_id !== null;
      return true;
    }), url);
  }

  function listSuggestions(url) {
    return paginate(state.unitSuggestions, url);
  }

  function listSpecs(categoryId, url) {
    return paginate(state.specs[categoryId] || [], url);
  }

  function reset() {
    state = createInitialCatalogState();
    mutations = [];
    catalogRequests = [];
    conflictNext = null;
  }

  async function createCategory(request, response, url) {
    const payload = JSON.parse(await readBody(request) || "{}");
    if (!requireIdempotencyKey(request, response)) return;
    const now = new Date().toISOString();
    const record = {
      id: nextId("11000000", state.categories.length),
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
    state.categories.push(record);
    recordMutation(request, url, payload);
    sendJson(response, 201, { success: true, data: record });
  }

  async function createTenantCategory(request, response, url) {
    const payload = JSON.parse(await readBody(request) || "{}");
    if (!requireIdempotencyKey(request, response)) return;
    const parent = payload.parent_id
      ? state.tenantCategories.find(({ id }) => id === payload.parent_id)
      : null;
    const mapped = payload.mapped_platform_category_id
      ? state.tenantCategories.find((category) =>
        category.id === payload.mapped_platform_category_id &&
        category.ownership_scope === "platform"
      )
      : null;
    const now = new Date().toISOString();
    const record = {
      id: nextId("21000000", state.tenantCategories.length),
      code: payload.code,
      name: payload.name,
      parent_id: payload.parent_id ?? null,
      level: parent ? parent.level + 1 : 1,
      full_name: parent ? `${parent.full_name} / ${payload.name}` : payload.name,
      is_leaf: true,
      mapped_platform_category_id: payload.mapped_platform_category_id ?? null,
      mapped_platform_category: mapped ? {
        id: mapped.id,
        code: mapped.code,
        name: mapped.name,
        full_name: mapped.full_name,
        status: mapped.status,
      } : null,
      ownership_scope: "tenant",
      owner_tenant_id: mockTenantCatalogSession.tenant.id,
      status: payload.status,
      sort_order: payload.sort_order,
      version: 1,
      created_at: now,
      updated_at: now,
    };
    if (parent) parent.is_leaf = false;
    state.tenantCategories.push(record);
    recordMutation(request, url, payload);
    sendJson(response, 201, { success: true, data: record });
  }

  async function updateTenantCategory(request, response, url, id) {
    const payload = JSON.parse(await readBody(request) || "{}");
    if (!requireIdempotencyKey(request, response)) return;
    const record = state.tenantCategories.find((item) => item.id === id);
    if (!record) return recordNotFound(response, "category");
    if (payload.expected_version !== record.version) {
      return versionConflict(response, record);
    }
    for (const field of ["code", "name", "sort_order", "status"]) {
      if (field in payload) record[field] = payload[field];
    }
    if ("mapped_platform_category_id" in payload) {
      record.mapped_platform_category_id = payload.mapped_platform_category_id;
      const mapped = state.tenantCategories.find((candidate) =>
        candidate.id === payload.mapped_platform_category_id &&
        candidate.ownership_scope === "platform"
      );
      record.mapped_platform_category = mapped ? {
        id: mapped.id,
        code: mapped.code,
        name: mapped.name,
        full_name: mapped.full_name,
        status: mapped.status,
      } : null;
    }
    record.version += 1;
    record.updated_at = new Date().toISOString();
    recordMutation(request, url, payload);
    sendJson(response, 200, { success: true, data: record });
  }

  async function updateTenantBrand(request, response, url, id) {
    const payload = JSON.parse(await readBody(request) || "{}");
    if (!requireIdempotencyKey(request, response)) return;
    const record = state.tenantBrands.find((item) => item.id === id);
    if (!record) return recordNotFound(response, "brand");
    if (payload.expected_version !== record.version) {
      return versionConflict(response, record);
    }
    for (const field of ["code", "name", "legal_name", "sort_order", "status"]) {
      if (field in payload) record[field] = payload[field];
    }
    if ("mapped_platform_brand_id" in payload) {
      record.mapped_platform_brand_id = payload.mapped_platform_brand_id;
      const mapped = state.brands.find(({ id: candidateId }) =>
        candidateId === payload.mapped_platform_brand_id
      );
      record.mapped_platform_brand = mapped ? {
        id: mapped.id,
        code: mapped.code,
        name: mapped.name,
        status: mapped.status,
      } : null;
    }
    record.version += 1;
    record.updated_at = new Date().toISOString();
    recordMutation(request, url, payload);
    sendJson(response, 200, { success: true, data: record });
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
      owner_tenant_id: scope === "tenant" ? mockTenantCatalogSession.tenant.id : null,
      source_platform_spec_id: null,
      created_at: now,
      updated_at: now,
    };
    state.specs[categoryId] ||= [];
    state.specs[categoryId].push(record);
    recordMutation(request, url, payload);
    sendJson(response, 201, { success: true, data: record });
  }

  async function updateSpec(request, response, url, categoryId, specId) {
    const payload = JSON.parse(await readBody(request) || "{}");
    if (!requireIdempotencyKey(request, response)) return;
    const record = (state.specs[categoryId] || []).find(({ id }) => id === specId);
    if (!record) return recordNotFound(response, "spec");
    if (payload.expected_version !== record.version) return versionConflict(response, record);
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
    const category = state.tenantCategories.find(({ id }) => id === categoryId);
    if (!category) return recordNotFound(response, "category");
    if (payload.expected_version !== category.version) {
      return versionConflict(response, category);
    }
    const now = new Date().toISOString();
    const copies = (state.specs[payload.platform_category_id] || []).map((spec) => ({
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
    state.specs[categoryId] = copies;
    category.version += 1;
    category.updated_at = now;
    recordMutation(request, url, payload);
    sendJson(response, 200, {
      success: true,
      data: {
        status: "copied",
        copied_count: copies.length,
        ids: copies.map(({ id }) => id),
        idempotent: false,
        version: category.version,
      },
    });
  }

  async function createUnitSuggestion(request, response, url) {
    const payload = JSON.parse(await readBody(request) || "{}");
    if (!requireIdempotencyKey(request, response)) return;
    const now = new Date().toISOString();
    const record = {
      id: nextId("32000000", state.unitSuggestions.length),
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
    state.unitSuggestions.push(record);
    recordMutation(request, url, payload);
    sendJson(response, 201, { success: true, data: record });
  }

  async function reviewUnitSuggestion(request, response, url, suggestionId) {
    const payload = JSON.parse(await readBody(request) || "{}");
    if (!requireIdempotencyKey(request, response)) return;
    const record = state.unitSuggestions.find(({ id }) => id === suggestionId);
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

  function recordNotFound(response, kind) {
    sendJson(response, 404, {
      success: false,
      code: `CATALOG_${kind.toUpperCase()}_NOT_FOUND`,
      message: "目录数据不存在",
    });
  }

  function versionConflict(response, record) {
    sendJson(response, 409, {
      success: false,
      code: "SUPPLIER_VERSION_CONFLICT",
      message: "目录数据版本已变化",
      details: { current_version: record.version, current_status: record.status },
    });
  }

  function baseUnitProjection(baseUnitId) {
    const unit = state.units.find(({ id }) => id === baseUnitId);
    return unit ? {
      id: unit.id,
      code: unit.code,
      name: unit.name,
      symbol: unit.symbol,
      unit_dimension: unit.unit_dimension,
      status: unit.status,
    } : null;
  }

  async function createBrand(request, response, url) {
    const payload = JSON.parse(await readBody(request) || "{}");
    if (!requireIdempotencyKey(request, response)) return;
    const now = new Date().toISOString();
    const record = {
      id: nextAvailableId("12000000", state.brands),
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
    state.brands.push(record);
    recordMutation(request, url, payload);
    sendJson(response, 201, { success: true, data: record });
  }

  async function createUnit(request, response, url) {
    const payload = JSON.parse(await readBody(request) || "{}");
    if (!requireIdempotencyKey(request, response)) return;
    const now = new Date().toISOString();
    const record = {
      id: nextId("13000000", state.units.length),
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
    state.units.push(record);
    recordMutation(request, url, payload);
    sendJson(response, 201, { success: true, data: record });
  }

  async function updateCategory(request, response, url, id) {
    const payload = JSON.parse(await readBody(request) || "{}");
    updateRecord(request, response, url, "category", state.categories, id, payload,
      ["code", "name", "sort_order", "status"]);
  }

  async function updateBrand(request, response, url, id) {
    const payload = JSON.parse(await readBody(request) || "{}");
    updateRecord(request, response, url, "brand", state.brands, id, payload,
      ["code", "name", "legal_name", "sort_order", "status"]);
  }

  async function updateUnit(request, response, url, id) {
    const payload = JSON.parse(await readBody(request) || "{}");
    updateRecord(request, response, url, "unit", state.units, id, payload,
      ["code", "name", "symbol", "base_unit_id", "conversion_factor", "sort_order", "status"]);
  }

  function updateRecord(request, response, url, kind, records, id, payload, fields) {
    const record = records.find((item) => item.id === id);
    if (!record) return recordNotFound(response, kind);
    if (conflictNext?.kind === kind && conflictNext.id === id) {
      conflictNext = null;
      record.version += 1;
      recordMutation(request, url, payload);
      versionConflict(response, record);
      return;
    }
    if (payload.expected_version !== record.version) return versionConflict(response, record);
    for (const field of fields) if (field in payload) record[field] = payload[field];
    if (kind === "unit" && "base_unit_id" in payload) {
      record.base_unit = baseUnitProjection(record.base_unit_id);
    }
    record.version += 1;
    record.updated_at = new Date().toISOString();
    recordMutation(request, url, payload);
    sendJson(response, 200, { success: true, data: record });
  }

  return {
    reset,
    mutations: () => structuredClone(mutations),
    catalogRequests: () => structuredClone(catalogRequests),
    recordCatalogRequest: (url) => {
      catalogRequests.push(`${url.pathname}${url.search}`);
    },
    setConflictNext: (value) => { conflictNext = value; },
    listCategories,
    listTenantCategories,
    listTenantBrands,
    listUnits,
    listSuggestions,
    listBrands: (url) => paginate(state.brands, url),
    listSpecs,
    createCategory,
    createTenantCategory,
    updateTenantCategory,
    updateTenantBrand,
    createBrand,
    createUnit,
    createSpec,
    updateSpec,
    copyPlatformSpecs,
    createUnitSuggestion,
    reviewUnitSuggestion,
    updateCategory,
    updateBrand,
    updateUnit,
  };
}
