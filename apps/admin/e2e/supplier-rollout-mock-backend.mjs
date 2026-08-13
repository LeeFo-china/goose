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
    "expected_version",
  ].every((field) => Object.hasOwn(payload, field));
}

async function patchSettings(request, response, url) {
  const payload = JSON.parse(await readBody(request) || "{}");
  const key = idempotencyKey(request);
  const mutation = {
    method: request.method,
    path: url.pathname,
    idempotencyKey: key,
    payload: structuredClone(payload),
    responseStatus: null,
  };
  mutations.push(mutation);

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
    mutations = [];
    conflictNext = false;
    delayNextMs = 0;
    settingsReadCount = 0;
    sendJson(response, 200, { success: true });
    return;
  }
  if (request.method === "POST" && url.pathname === "/__test/conflict-next") {
    await readBody(request);
    conflictNext = true;
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
