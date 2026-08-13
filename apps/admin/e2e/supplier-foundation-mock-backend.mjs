import { createServer } from "node:http";

const port = Number(process.env.SUPPLIER_FOUNDATION_MOCK_PORT || 3994);
const now = "2026-08-13T08:00:00.000Z";
const ids = {
  tenant: "36000000-0000-4000-8000-000000000001",
  employee: "36000000-0000-4000-8000-000000000002",
  user: "36000000-0000-4000-8000-000000000003",
  platformSupplier: "36000000-0000-4000-8000-000000000004",
  privateSupplier: "36000000-0000-4000-8000-000000000005",
  platformRelationship: "36000000-0000-4000-8000-000000000006",
  privateRelationship: "36000000-0000-4000-8000-000000000007",
};
const session = {
  user_id: ids.user,
  login_channel: "admin_web",
  employee: {
    id: ids.employee, name: "供应商管理员", phone: "18800000001",
    status: "active", tenant_department_id: null, department_name: "采购部",
    post_id: null, post_name: "采购主管", avatar: null,
  },
  tenant: { id: ids.tenant, name: "E2E 装修公司", slug: "supplier-e2e", status: "active" },
  roles: ["tenant_admin"],
  permissions: [
    "supplier.view", "supplier.manage", "supplier.master.manage",
    "supplier.contract.manage",
  ].map((code) => ({ code, scope: "all" })),
  token: "supplier-foundation-token",
  expires_at: "2099-12-31T23:59:59+08:00",
};
const settings = {
  tenant_id: ids.tenant, module_enabled: true,
  require_active_contract_for_new_order: false,
  ownership_reads_enabled: true, private_supplier_writes_enabled: true,
  private_catalog_writes_enabled: false, procurement_snapshot_v1_enabled: false,
  enabled_by_employee_id: ids.employee, enabled_at: now, version: 3,
  created_at: now, updated_at: now,
};
const platformSupplier = supplier(
  ids.platformSupplier, "PLATFORM-001", "平台瓷砖供应商", "platform", null,
);
const privateSupplier = supplier(
  ids.privateSupplier, "PRIVATE-001", "本租户木作供应商", "tenant", ids.tenant,
);
let mutations = [];
let allocationSequence = 1;

function supplier(id, code, name, ownershipScope, ownerTenantId) {
  return {
    id, code, name, legal_name: `${name}有限公司`, supplier_type: "manufacturer",
    ownership_scope: ownershipScope, owner_tenant_id: ownerTenantId,
    onboarding_status: "approved", operational_status: "active", version: 1,
  };
}

function relationship(id, source, internalCode) {
  return {
    id, tenant_id: ids.tenant, supplier_id: source.id,
    relationship_status: "active", internal_supplier_code: internalCode,
    settlement_term_days: 30, credit_limit_minor: 0,
    invoice_required_before_payment: true, default_currency: "CNY",
    default_tax_inclusive: true, tenant_owner_employee_id: ids.employee,
    started_at: "2026-08-01", ended_at: null, remark: null, version: 1,
    created_by_employee_id: ids.employee, updated_by_employee_id: ids.employee,
    created_at: now, updated_at: now, contract_health: "valid", supplier: source,
    eligibility: {
      eligible: true, blocking_reasons: [], checked_at: now,
      tenant_id: ids.tenant, tenant_supplier_id: id, supplier_id: source.id,
    },
  };
}

function sendJson(response, status, payload) {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
}

function readBody(request) {
  return new Promise((resolve) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => resolve(JSON.parse(Buffer.concat(chunks).toString() || "{}")));
  });
}

function keyOf(request) {
  const value = request.headers["idempotency-key"];
  return Array.isArray(value) ? value[0] : value ?? null;
}

async function recordCreate(request, response, path) {
  const payload = await readBody(request);
  const entry = { path, idempotencyKey: keyOf(request), payload };
  mutations.push(entry);
  if (payload.internal_supplier_code === "DUPLICATE") {
    sendJson(response, 409, {
      success: false, code: "SUPPLIER_CODE_CONFLICT",
      message: "供应商内部编码已存在",
    });
    return;
  }
  sendJson(response, 200, {
    success: true,
    data: relationship(crypto.randomUUID(),
      path === "/suppliers/private"
        ? supplier(crypto.randomUUID(), payload.internal_supplier_code, payload.name, "tenant", ids.tenant)
        : platformSupplier,
      payload.internal_supplier_code),
  });
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url || "/", `http://127.0.0.1:${port}`);
  if (request.method === "GET" && url.pathname === "/health") {
    sendJson(response, 200, { success: true }); return;
  }
  if (request.method === "POST" && url.pathname === "/__test/reset") {
    await readBody(request); mutations = []; allocationSequence = 1;
    sendJson(response, 200, { success: true }); return;
  }
  if (request.method === "GET" && url.pathname === "/__test/state") {
    sendJson(response, 200, { mutations }); return;
  }
  if (request.method === "POST" && url.pathname === "/admin/auth/login") {
    await readBody(request); sendJson(response, 200, { success: true, data: session }); return;
  }
  if (request.method === "GET" && url.pathname === "/admin/auth/me") {
    sendJson(response, 200, { success: true, data: session }); return;
  }
  if (request.method === "GET" && url.pathname === "/supplier-settings") {
    sendJson(response, 200, { success: true, data: settings }); return;
  }
  if (request.method === "GET" && url.pathname === "/suppliers") {
    const list = [
      relationship(ids.platformRelationship, platformSupplier, "PLATFORM-INTERNAL"),
      relationship(ids.privateRelationship, privateSupplier, "PRIVATE-INTERNAL"),
    ];
    sendJson(response, 200, { success: true, data: {
      list, pagination: { page: 1, pageSize: 20, total: 2, totalPages: 1 },
    } }); return;
  }
  if (request.method === "GET" && url.pathname === "/suppliers/directory") {
    sendJson(response, 200, { success: true, data: {
      list: [platformSupplier],
      pagination: { page: 1, pageSize: 10, total: 1, totalPages: 1 },
    } }); return;
  }
  if (request.method === "POST" && url.pathname === "/suppliers/code-allocations") {
    await readBody(request);
    const code = `SUP-${String(allocationSequence).padStart(6, "0")}`;
    allocationSequence += 1;
    const entry = { path: url.pathname, idempotencyKey: keyOf(request), payload: {} };
    mutations.push(entry);
    sendJson(response, 200, { success: true, data: {
      allocation_id: crypto.randomUUID(), code, idempotent: false,
    } }); return;
  }
  if (request.method === "POST" && ["/suppliers", "/suppliers/private"].includes(url.pathname)) {
    await recordCreate(request, response, url.pathname); return;
  }
  sendJson(response, 404, {
    success: false, code: "MOCK_ROUTE_NOT_FOUND",
    message: `Mock route not found: ${request.method} ${url.pathname}`,
  });
});

server.listen(port, "127.0.0.1", () => {
  console.log(`[supplier-foundation-mock] http://127.0.0.1:${port}`);
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
