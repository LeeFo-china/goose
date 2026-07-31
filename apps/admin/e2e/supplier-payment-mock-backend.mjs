import { createServer } from "node:http";

import {
  ids,
  now,
  project,
  purchaseOrder,
  relationship,
} from "./supplier-payment-mock-fixture.mjs";
import {
  approveRequest,
  confirmPayment,
  createDraft,
  createState,
  currentSession,
  financialSummary,
  listPayables,
  listRequests,
  payableFacts,
  paymentRecords,
  recordListGet,
  recordMutation,
  requestDetail,
  submitRequest,
} from "./supplier-payment-mock-state.mjs";

const port = Number.parseInt(
  process.env.SUPPLIER_PAYMENT_MOCK_BACKEND_PORT || "3995",
  10,
);
const requestId = "supplier-payment-mock-request";
const uploadPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);
let state = createState();

function sendJson(response, status, payload, headers = {}) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    ...headers,
  });
  response.end(JSON.stringify(payload));
}

function sendData(response, data, status = 200) {
  sendJson(response, status, { success: true, data });
}

function sendError(response, status, code, message) {
  sendJson(response, status, {
    success: false,
    code,
    message,
    requestId,
  });
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => {
      try {
        const raw = Buffer.concat(chunks).toString("utf8");
        resolve(raw ? JSON.parse(raw) : {});
      } catch (error) {
        reject(error);
      }
    });
  });
}

function pagination(url) {
  const page = Number(url.searchParams.get("page"));
  const pageSize = Number(url.searchParams.get("pageSize"));
  if (!Number.isSafeInteger(page) || page < 1 ||
    !Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 100) {
    return null;
  }
  return { page, pageSize };
}

function sendPage(response, url, records, path = url.pathname) {
  recordListGet(state, path, url);
  const page = pagination(url);
  if (!page) {
    sendError(response, 400, "VALIDATION_ERROR",
      "分页参数必须为正整数，且 pageSize 不得超过 100");
    return;
  }
  const start = (page.page - 1) * page.pageSize;
  sendData(response, {
    list: structuredClone(records.slice(start, start + page.pageSize)),
    pagination: {
      ...page,
      total: records.length,
      totalPages: records.length
        ? Math.ceil(records.length / page.pageSize)
        : 0,
    },
  });
}

function commandResponse(response, result) {
  if (result.error) {
    return sendError(
      response,
      result.error.status,
      result.error.code,
      result.error.message,
    );
  }
  sendData(response, structuredClone(result));
}

async function runCommand(request, response, url, execute) {
  const payload = await readBody(request);
  if (!request.headers["idempotency-key"]) {
    return sendError(response, 400, "IDEMPOTENCY_KEY_REQUIRED",
      "幂等键不能为空");
  }
  recordMutation(state, request, url.pathname, payload);
  commandResponse(response, execute(payload));
}

function filterOptions(url) {
  const type = url.searchParams.get("type");
  if (type === "project") return [{ id: project.id, label: project.name }];
  if (type === "supplier") {
    return [{ id: relationship.tenant_supplier_id,
      label: relationship.supplier.name }];
  }
  if (type === "purchase_order") {
    return [{ id: purchaseOrder.id, label: purchaseOrder.order_no }];
  }
  return null;
}

function notifications(response, url) {
  if (url.pathname === "/notifications/summary") {
    return sendData(response, { unread_count: 0 });
  }
  if (url.pathname === "/notifications") {
    return sendPage(response, url, []);
  }
  return false;
}

const server = createServer(async (request, response) => {
  const url = new URL(
    request.url || "/",
    `http://${request.headers.host || `127.0.0.1:${port}`}`,
  );
  try {
    if (request.method === "OPTIONS") {
      response.writeHead(204, {
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "GET,POST,PUT,OPTIONS",
        "access-control-allow-headers": "content-type",
      });
      return response.end();
    }
    if (request.method === "GET" && url.pathname === "/health") {
      return sendData(response, {});
    }
    if (request.method === "POST" && url.pathname === "/__test/reset") {
      await readBody(request);
      state = createState();
      return sendData(response, {});
    }
    if (request.method === "POST" && url.pathname === "/__test/role") {
      const body = await readBody(request);
      if (!["applicant", "approver", "finance"].includes(body.role)) {
        return sendError(response, 400, "VALIDATION_ERROR",
          "未知供应商付款测试角色");
      }
      state.role = body.role;
      return sendData(response, { role: state.role });
    }
    if (request.method === "GET" && url.pathname === "/__test/journal") {
      return sendJson(response, 200, {
        journal: structuredClone(state.journal),
      });
    }
    if (request.method === "GET" && url.pathname === "/__test/list-gets") {
      return sendJson(response, 200, {
        requests: structuredClone(state.listGets),
      });
    }
    if (request.method === "GET" && url.pathname === "/__test/state") {
      return sendJson(response, 200, {
        role: state.role,
        payables: structuredClone(state.payables),
        requests: structuredClone(state.requests),
        journal: structuredClone(state.journal),
      });
    }
    if (request.method === "POST" && url.pathname === "/admin/auth/login") {
      await readBody(request);
      return sendData(response, currentSession(state));
    }
    if (request.method === "GET" && url.pathname === "/admin/auth/me") {
      return sendData(response, currentSession(state));
    }
    if (request.method === "GET" && url.pathname === "/supplier-settings") {
      return sendData(response, {
        tenant_id: ids.tenant,
        module_enabled: true,
        require_active_contract_for_new_order: false,
        enabled_by_employee_id: ids.applicant,
        enabled_at: now,
        version: 1,
        created_at: now,
        updated_at: now,
      });
    }
    if (request.method === "GET" &&
      url.pathname === "/supplier-payable-filter-options") {
      const records = filterOptions(url);
      if (!records) {
        return sendError(response, 400, "VALIDATION_ERROR",
          "应付筛选类型无效");
      }
      return sendPage(response, url, records);
    }
    if (request.method === "GET" && url.pathname === "/supplier-payables") {
      return sendPage(response, url, listPayables(state, url));
    }
    if (request.method === "GET" &&
      url.pathname === "/supplier-payment-request-payable-facts/batch") {
      const payableIds = (url.searchParams.get("ids") ?? "")
        .split(",").filter(Boolean);
      if (!payableIds.length || payableIds.length > 100) {
        return sendError(response, 400, "VALIDATION_ERROR",
          "应付 ID 数量必须为 1 至 100");
      }
      return sendData(response, payableFacts(state, payableIds));
    }
    if (request.method === "GET" &&
      url.pathname === "/supplier-payment-requests") {
      return sendPage(response, url, listRequests(state, url));
    }
    if (request.method === "POST" &&
      url.pathname === "/supplier-payment-requests") {
      return runCommand(request, response, url,
        (payload) => createDraft(state, payload));
    }
    const requestPayments = url.pathname.match(
      /^\/supplier-payment-requests\/([^/]+)\/payments$/,
    );
    if (request.method === "GET" && requestPayments) {
      const id = decodeURIComponent(requestPayments[1]);
      return sendPage(response, url, paymentRecords(state, id),
        "/supplier-payment-requests/:id/payments");
    }
    if (request.method === "POST" && requestPayments) {
      const id = decodeURIComponent(requestPayments[1]);
      return runCommand(request, response, url,
        (payload) => confirmPayment(state, id, payload));
    }
    const requestCommand = url.pathname.match(
      /^\/supplier-payment-requests\/([^/]+)\/(submit|approve)$/,
    );
    if (request.method === "POST" && requestCommand) {
      const id = decodeURIComponent(requestCommand[1]);
      return runCommand(request, response, url, (payload) =>
        requestCommand[2] === "submit"
          ? submitRequest(state, id, payload)
          : approveRequest(state, id, payload));
    }
    const requestItem = url.pathname.match(
      /^\/supplier-payment-requests\/([^/]+)$/,
    );
    if (request.method === "GET" && requestItem) {
      const detail = requestDetail(state, decodeURIComponent(requestItem[1]));
      return detail
        ? sendData(response, detail)
        : sendError(response, 404, "PAYMENT_REQUEST_NOT_FOUND",
          "付款申请不存在");
    }
    if (request.method === "POST" &&
      url.pathname === "/uploads/cos/direct-init") {
      const body = await readBody(request);
      const objectKey = `supplier-payment/${body.filename || "evidence.png"}`;
      return sendData(response, {
        object_key: objectKey,
        storage_path: objectKey,
        upload_url: `http://127.0.0.1:${port}/__upload/evidence`,
        method: "PUT",
        headers: { "content-type": body.mimetype || "image/png" },
        upload_intent: "supplier-payment-mock-intent",
      });
    }
    if (request.method === "PUT" && url.pathname === "/__upload/evidence") {
      await new Promise((resolve) => {
        request.on("data", () => {});
        request.on("end", resolve);
      });
      response.writeHead(200, {
        "access-control-allow-origin": "*",
        etag: '"supplier-payment-e2e"',
      });
      return response.end();
    }
    if (request.method === "POST" &&
      url.pathname === "/uploads/cos/direct-complete") {
      const body = await readBody(request);
      return sendData(response, {
        object_key: body.object_key,
        storage_path: body.object_key,
      });
    }
    if (request.method === "GET" &&
      url.pathname === "/uploads/public-url") {
      response.writeHead(200, { "content-type": "image/png" });
      return response.end(uploadPng);
    }
    if (request.method === "GET" &&
      url.pathname === "/supplier-purchase-order-project-options") {
      return sendPage(response, url, [project]);
    }
    if (request.method === "GET" &&
      url.pathname === "/supplier-purchase-order-supplier-options") {
      return sendPage(response, url, [relationship]);
    }
    if (request.method === "GET" &&
      url.pathname === "/supplier-purchase-orders") {
      return sendPage(response, url, [purchaseOrder]);
    }
    const financial = url.pathname.match(
      /^\/supplier-purchase-orders\/([^/]+)\/financial-summary$/,
    );
    if (request.method === "GET" && financial) {
      return sendData(response, financialSummary(state));
    }
    const fulfillment = url.pathname.match(
      /^\/supplier-purchase-orders\/([^/]+)\/fulfillment$/,
    );
    if (request.method === "GET" && fulfillment) {
      return sendData(response, {
        fulfillment: {
          id: "35000000-0000-4000-8000-000000000030",
          tenant_id: ids.tenant,
          supplier_purchase_order_id: ids.purchaseOrder,
          status: "received",
          confirmed_at: now,
          confirmed_by_employee_id: ids.applicant,
          confirmation_remark: "E2E 已完成履约",
          version: 4,
          created_at: now,
          updated_at: now,
        },
        item_fulfillments: [],
      });
    }
    const childList = url.pathname.match(
      /^\/supplier-purchase-orders\/([^/]+)\/(items|shipments|receipts)$/,
    );
    if (request.method === "GET" && childList) {
      return sendPage(response, url, [],
        `/supplier-purchase-orders/:id/${childList[2]}`);
    }
    const orderItem = url.pathname.match(
      /^\/supplier-purchase-orders\/([^/]+)$/,
    );
    if (request.method === "GET" && orderItem) {
      return decodeURIComponent(orderItem[1]) === ids.purchaseOrder
        ? sendData(response, purchaseOrder)
        : sendError(response, 404, "SUPPLIER_PURCHASE_ORDER_NOT_FOUND",
          "采购单不存在");
    }
    if (request.method === "GET" &&
      (url.pathname === "/notifications" ||
        url.pathname === "/notifications/summary")) {
      return notifications(response, url);
    }
    sendError(response, 404, "MOCK_ROUTE_NOT_FOUND",
      `Mock route not found: ${request.method} ${url.pathname}`);
  } catch (error) {
    sendError(response, 500, "MOCK_INTERNAL_ERROR",
      error instanceof Error ? error.message : "Mock backend failed");
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`[supplier-payment-mock] listening on ${port}`);
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
