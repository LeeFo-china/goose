import { createServer } from "node:http";

import {
  createSupplierRolloutSettings,
  mockSupplierRolloutSession,
  mockTenantId,
} from "./supplier-rollout-mock-fixture.mjs";

const port = Number.parseInt(
  process.env.SUPPLIER_ROLLOUT_MOCK_BACKEND_PORT || "3993",
  10,
);

let settings = createSupplierRolloutSettings();
let mutations = [];
let conflictNext = false;
let delayNextMs = 0;
let settingsReadCount = 0;
let failureNext = null;
let failReads = 0;
let commandEvents = new Map();

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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function idempotencyKey(request) {
  const value = request.headers["idempotency-key"];
  return Array.isArray(value) ? value[0] : value ?? null;
}

function rolloutLevel(value) {
  if (!value.module_enabled) return 0;
  if (value.warehouse_procurement_enabled) return 7;
  if (value.purchase_batch_workflow_enabled) return 6;
  if (value.procurement_snapshot_v1_enabled) return 5;
  if (value.private_catalog_writes_enabled) return 4;
  if (value.private_supplier_writes_enabled) return 3;
  if (value.ownership_reads_enabled) return 2;
  return 1;
}

function isCompletePayload(payload) {
  return [
    "module_enabled",
    "require_active_contract_for_new_order",
    "ownership_reads_enabled",
    "private_supplier_writes_enabled",
    "private_catalog_writes_enabled",
    "procurement_snapshot_v1_enabled",
    "purchase_batch_workflow_enabled",
    "warehouse_procurement_enabled",
    "expected_version",
  ].every((field) => Object.hasOwn(payload, field));
}

async function patchSettings(request, response, url) {
  const rawBody = await readBody(request);
  const payload = JSON.parse(rawBody || "{}");
  const key = idempotencyKey(request);
  const mutation = {
    method: request.method,
    path: url.pathname,
    idempotencyKey: key,
    payload: structuredClone(payload),
    rawBody,
    responseStatus: null,
  };
  mutations.push(mutation);
  const failure = failureNext;
  failureNext = null;
  if (failure && !failure.commit) {
    mutation.responseStatus = failure.status;
    sendJson(response, failure.status, { success: false, code: "TEST_REJECTION", message: "测试请求失败" });
    return;
  }
  const historical = commandEvents.get(key);
  if (historical) {
    const matches = JSON.stringify(historical.payload) === JSON.stringify(payload);
    mutation.responseStatus = matches ? 200 : 409;
    sendJson(response, mutation.responseStatus, matches ? { success: true, data: historical.settings }
      : { success: false, code: "SUPPLIER_IDEMPOTENCY_CONFLICT", message: "幂等键对应不同请求" });
    return;
  }

  if (!key?.trim() || !isCompletePayload(payload)) {
    mutation.responseStatus = 400;
    sendJson(response, 400, {
      success: false,
      code: "SUPPLIER_ROLLOUT_REQUEST_INVALID",
      message: "灰度配置请求必须包含完整状态和 Idempotency-Key",
    });
    return;
  }

  if (delayNextMs > 0) {
    const waitMs = delayNextMs;
    delayNextMs = 0;
    await sleep(waitMs);
  }

  if (conflictNext) {
    conflictNext = false;
    settings = {
      ...settings,
      version: settings.version + 1,
      updated_at: new Date().toISOString(),
    };
    mutation.responseStatus = 409;
    sendJson(response, 409, {
      success: false,
      code: "SUPPLIER_VERSION_CONFLICT",
      message: "数据版本已变化",
      details: { current_version: settings.version },
    });
    return;
  }

  if (payload.expected_version !== settings.version) {
    mutation.responseStatus = 409;
    sendJson(response, 409, {
      success: false,
      code: "SUPPLIER_VERSION_CONFLICT",
      message: "数据版本已变化",
      details: { current_version: settings.version },
    });
    return;
  }

  const targetLevel = rolloutLevel(payload);
  const effectiveMaterials = payload.warehouse_materials_enabled ?? settings.warehouse_materials_enabled;
  const effectiveTransfers = payload.warehouse_transfers_enabled ?? settings.warehouse_transfers_enabled;
  const effectiveStocktakes = payload.warehouse_stocktakes_enabled ?? settings.warehouse_stocktakes_enabled;
  if (effectiveStocktakes && !payload.module_enabled) {
    mutation.responseStatus = 409;
    sendJson(response, 409, { success: false, code: "SUPPLIER_ROLLOUT_ORDER_INVALID", message: "仓库盘点需要供应商模块" });
    return;
  }
  if (effectiveTransfers && !payload.module_enabled) {
    mutation.responseStatus = 409;
    sendJson(response, 409, { success: false, code: "SUPPLIER_ROLLOUT_ORDER_INVALID", message: "仓库调拨需要供应商模块" });
    return;
  }
  if (effectiveMaterials && !payload.module_enabled) {
    mutation.responseStatus = 409;
    sendJson(response, 409, { success: false, code: "SUPPLIER_ROLLOUT_ORDER_INVALID", message: "仓库领退料需要供应商模块" });
    return;
  }
  if (Math.abs(targetLevel - rolloutLevel(settings)) > 1) {
    mutation.responseStatus = 409;
    sendJson(response, 409, {
      success: false,
      code: "SUPPLIER_ROLLOUT_ORDER_INVALID",
      message: "供应商灰度开关必须按顺序调整",
    });
    return;
  }
  if (!payload.module_enabled && !payload.reason?.trim()) {
    mutation.responseStatus = 400;
    sendJson(response, 400, {
      success: false,
      code: "SUPPLIER_STATE_CONFLICT",
      message: "停用供应商模块必须填写原因",
    });
    return;
  }

  const wasEnabled = settings.module_enabled;
  settings = {
    ...settings,
    module_enabled: payload.module_enabled,
    require_active_contract_for_new_order:
      payload.require_active_contract_for_new_order,
    ownership_reads_enabled: payload.ownership_reads_enabled,
    private_supplier_writes_enabled: payload.private_supplier_writes_enabled,
    private_catalog_writes_enabled: payload.private_catalog_writes_enabled,
    procurement_snapshot_v1_enabled:
      payload.procurement_snapshot_v1_enabled,
    purchase_batch_workflow_enabled:
      payload.purchase_batch_workflow_enabled,
    warehouse_procurement_enabled: payload.warehouse_procurement_enabled,
    warehouse_materials_enabled: effectiveMaterials,
    warehouse_transfers_enabled: effectiveTransfers,
    warehouse_stocktakes_enabled: effectiveStocktakes,
    enabled_by_employee_id: payload.module_enabled
      ? settings.enabled_by_employee_id ?? mockSupplierRolloutSession.employee.id
      : null,
    enabled_at: payload.module_enabled
      ? settings.enabled_at ?? new Date().toISOString()
      : null,
    version: settings.version + 1,
    updated_at: new Date().toISOString(),
  };
  if (!wasEnabled && settings.module_enabled) {
    settings.enabled_at = new Date().toISOString();
  }
  mutation.responseStatus = 200;
  commandEvents.set(key, { payload: structuredClone(payload), settings: structuredClone(settings) });
  if (failure) {
    mutation.responseStatus = failure.status;
    sendJson(response, failure.status, { success: false, code: "TEST_UNKNOWN_OUTCOME", message: "操作结果未知" });
    return;
  }
  sendJson(response, 200, { success: true, data: settings });
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
    const payload = JSON.parse(await readBody(request) || "{}");
    settings = createSupplierRolloutSettings(payload.level ?? 0, payload.version ?? 0);
    if (payload.stocktakes === true) settings.warehouse_stocktakes_enabled = true;
    mutations = [];
    conflictNext = false;
    delayNextMs = 0;
    settingsReadCount = 0;
    failureNext = null;
    failReads = 0;
    commandEvents = new Map();
    sendJson(response, 200, { success: true });
    return;
  }
  if (request.method === "POST" && url.pathname === "/__test/conflict-next") {
    await readBody(request);
    conflictNext = true;
    sendJson(response, 200, { success: true });
    return;
  }
  if (request.method === "POST" && url.pathname === "/__test/failure-next") {
    failureNext = JSON.parse(await readBody(request));
    sendJson(response, 200, { success: true });
    return;
  }
  if (request.method === "POST" && url.pathname === "/__test/fail-reads") {
    failReads = 1;
    sendJson(response, 200, { success: true });
    return;
  }
  if (request.method === "POST" && url.pathname === "/__test/advance-policy") {
    settings = { ...settings, require_active_contract_for_new_order: true, version: settings.version + 1 };
    sendJson(response, 200, { success: true });
    return;
  }
  if (request.method === "POST" && url.pathname === "/__test/delay-next") {
    const payload = JSON.parse(await readBody(request) || "{}");
    delayNextMs = Math.max(0, Number(payload.ms) || 0);
    sendJson(response, 200, { success: true });
    return;
  }
  if (request.method === "GET" && url.pathname === "/__test/state") {
    sendJson(response, 200, {
      settings,
      mutations,
      settingsReadCount,
    });
    return;
  }
  if (request.method === "POST" && url.pathname === "/admin/auth/login") {
    await readBody(request);
    sendJson(response, 200, {
      success: true,
      data: mockSupplierRolloutSession,
    });
    return;
  }
  if (request.method === "GET" && url.pathname === "/admin/auth/me") {
    sendJson(response, 200, {
      success: true,
      data: mockSupplierRolloutSession,
    });
    return;
  }

  const settingsMatch = url.pathname.match(
    /^\/platform\/tenant-supplier-settings\/([^/]+)$/,
  );
  if (settingsMatch && decodeURIComponent(settingsMatch[1]) === mockTenantId) {
    if (request.method === "GET") {
      settingsReadCount += 1;
      if (failReads > 0) {
        failReads -= 1;
        sendJson(response, 503, { success: false, message: "配置读取失败" });
        return;
      }
      sendJson(response, 200, { success: true, data: settings });
      return;
    }
    if (request.method === "PATCH") {
      await patchSettings(request, response, url);
      return;
    }
  }

  sendJson(response, 404, {
    success: false,
    code: "MOCK_ROUTE_NOT_FOUND",
    message: `Mock route not found: ${request.method} ${url.pathname}`,
  });
});

server.listen(port, "127.0.0.1", () => {
  console.log(`[supplier-rollout-mock] listening on http://127.0.0.1:${port}`);
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
