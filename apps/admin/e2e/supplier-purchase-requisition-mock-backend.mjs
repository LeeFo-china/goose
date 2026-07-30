import { createServer } from "node:http";

import {
  catalogOptions,
  costCategoryOptions,
  ids,
  project,
  projectOptions,
  relationship,
} from "./supplier-purchase-requisition-mock-fixture.mjs";
import {
  cancel,
  convert,
  createState,
  currentSession,
  recordMutation,
  remember,
  replay,
  review,
  saveDraft,
  submit,
} from "./supplier-purchase-requisition-mock-state.mjs";

const port = Number.parseInt(
  process.env.SUPPLIER_PURCHASE_REQUISITION_MOCK_BACKEND_PORT || "3994",
  10,
);
const requestId = "supplier-purchase-requisition-mock-request";
let state = createState();

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
    requestId,
    ...(details === undefined ? {} : { details }),
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

function pagination(url, maximum = 100) {
  const page = Number(url.searchParams.get("page"));
  const pageSize = Number(url.searchParams.get("pageSize"));
  if (!Number.isSafeInteger(page) || page < 1 ||
    !Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > maximum) {
    return null;
  }
  return { page, pageSize };
}

function sendPage(
  response,
  url,
  records,
  fields = [],
  maximum = 100,
) {
  state.listGets.push({
    path: url.pathname,
    page: url.searchParams.get("page"),
    pageSize: url.searchParams.get("pageSize"),
  });
  const page = pagination(url, maximum);
  if (!page) {
    sendError(response, 400, "VALIDATION_ERROR",
      `分页参数必须为正整数，且 pageSize 不得超过 ${maximum}`);
    return;
  }
  const keyword = (url.searchParams.get("keyword") ?? "").trim().toLowerCase();
  const filtered = keyword
    ? records.filter((record) => fields.some((field) =>
      String(record[field] ?? "").toLowerCase().includes(keyword)))
    : records;
  const start = (page.page - 1) * page.pageSize;
  sendData(response, {
    list: filtered.slice(start, start + page.pageSize),
    pagination: {
      ...page,
      total: filtered.length,
      totalPages: filtered.length
        ? Math.ceil(filtered.length / page.pageSize)
        : 0,
    },
  });
}

function requisitionWithId(id) {
  return state.requisitions.find((requisition) => requisition.id === id);
}

function commandError(response, error) {
  sendError(response, error[1], error[0], error[2]);
}

async function handleCommand(request, response, url, match) {
  const payload = await readBody(request);
  const requisitionId = decodeURIComponent(match[1]);
  const command = match[2];
  const { key } = recordMutation(state, request, url.pathname, payload);
  const idempotency = replay(state, key, url.pathname, payload);
  if (idempotency.error) return commandError(response, idempotency.error);
  if (idempotency.response) return sendData(response, idempotency.response);
  const requisition = requisitionWithId(requisitionId);
  let result;
  if (command === "save-draft") {
    result = saveDraft(state, requisitionId, payload);
  } else if (command === "submit") {
    result = submit(state, requisition, payload);
  } else if (command === "review") {
    result = review(state, requisition, payload);
  } else if (command === "cancel") {
    result = cancel(state, requisition, payload);
  } else {
    result = convert(state, requisition, payload);
  }
  if (result.error) return commandError(response, result.error);
  remember(state, idempotency.key, idempotency.fingerprint, result.response);
  sendData(response, result.response);
}

function filteredRequisitions(url) {
  let records = [...state.requisitions].sort((left, right) =>
    right.updated_at.localeCompare(left.updated_at) ||
    right.request_no.localeCompare(left.request_no));
  const filters = {
    status: "status",
    budget_status: "budget_status",
    project_id: "project_id",
    tenant_supplier_id: "tenant_supplier_id",
  };
  for (const [parameter, field] of Object.entries(filters)) {
    const value = url.searchParams.get(parameter);
    if (value) records = records.filter((record) => record[field] === value);
  }
  return records;
}

function purchaseOrderWithReferences(order) {
  return order ? structuredClone(order) : null;
}

function stateSnapshot() {
  return {
    role: state.role,
    requisitions: structuredClone(state.requisitions),
    commitments: structuredClone(state.commitments),
    purchaseOrders: structuredClone(state.purchaseOrders),
  };
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
      state = createState();
      return sendData(response, {});
    }
    if (request.method === "POST" && url.pathname === "/__test/role") {
      const body = await readBody(request);
      if (!["requester", "approver", "budget-manager"].includes(body.role)) {
        return sendError(response, 400, "VALIDATION_ERROR",
          "未知采购申请测试角色");
      }
      state.role = body.role;
      return sendData(response, { role: state.role });
    }
    if (request.method === "GET" && url.pathname === "/__test/mutations") {
      return sendJson(response, 200, {
        mutations: structuredClone(state.mutations),
      });
    }
    if (request.method === "GET" && url.pathname === "/__test/list-gets") {
      return sendJson(response, 200, {
        requests: structuredClone(state.listGets),
      });
    }
    if (request.method === "GET" && url.pathname === "/__test/state") {
      return sendJson(response, 200, stateSnapshot());
    }
    if (request.method === "POST" && url.pathname === "/admin/auth/login") {
      await readBody(request);
      return sendData(response, currentSession(state));
    }
    if (request.method === "GET" && url.pathname === "/admin/auth/me") {
      return sendData(response, currentSession(state));
    }
    if (request.method === "GET" &&
      url.pathname === "/supplier-purchase-requisition-project-options") {
      return sendPage(response, url, projectOptions(), ["name"]);
    }
    if (request.method === "GET" &&
      url.pathname === "/supplier-purchase-requisition-supplier-options") {
      return sendPage(response, url, [relationship], [
        "tenant_supplier_id",
      ]);
    }
    if (request.method === "GET" &&
      url.pathname === "/supplier-purchase-requisition-cost-categories") {
      return sendPage(response, url, costCategoryOptions(), ["code", "name"]);
    }
    if (request.method === "GET" &&
      url.pathname === "/supplier-purchase-requisition-catalog") {
      if (url.searchParams.get("tenantSupplierId") !== ids.relationship) {
        return sendError(response, 400, "VALIDATION_ERROR",
          "合作供应商参数无效");
      }
      return sendPage(response, url, catalogOptions(), [
        "product_code",
        "product_name",
        "sku_code",
        "sku_name",
      ], 20);
    }
    if (request.method === "GET" &&
      url.pathname === "/supplier-purchase-requisitions") {
      return sendPage(response, url, filteredRequisitions(url), [
        "request_no",
        "reason",
      ]);
    }
    const itemList = url.pathname.match(
      /^\/supplier-purchase-requisitions\/([^/]+)\/items$/,
    );
    if (request.method === "GET" && itemList) {
      const requisitionId = decodeURIComponent(itemList[1]);
      if (!requisitionWithId(requisitionId)) {
        return sendError(response, 404,
          "SUPPLIER_PURCHASE_REQUISITION_NOT_FOUND", "采购申请不存在");
      }
      return sendPage(response, url, state.items.get(requisitionId) ?? []);
    }
    const command = url.pathname.match(
      /^\/supplier-purchase-requisitions\/([^/]+)\/(save-draft|submit|review|cancel|convert)$/,
    );
    if (request.method === "POST" && command) {
      return handleCommand(request, response, url, command);
    }
    const detail = url.pathname.match(
      /^\/supplier-purchase-requisitions\/([^/]+)$/,
    );
    if (request.method === "GET" && detail) {
      const requisition = requisitionWithId(decodeURIComponent(detail[1]));
      if (!requisition) {
        return sendError(response, 404,
          "SUPPLIER_PURCHASE_REQUISITION_NOT_FOUND", "采购申请不存在");
      }
      return sendData(response, {
        requisition: structuredClone(requisition),
        budget_snapshots: structuredClone(state.commitments.filter(
          ({ source_id }) => source_id === requisition.id,
        )),
      });
    }
    if (request.method === "GET" &&
      url.pathname === "/supplier-purchase-order-project-options") {
      return sendPage(response, url, [project], ["name"]);
    }
    if (request.method === "GET" &&
      url.pathname === "/supplier-purchase-order-supplier-options") {
      return sendPage(response, url, [relationship]);
    }
    if (request.method === "GET" &&
      url.pathname === "/supplier-purchase-orders") {
      return sendPage(response, url,
        state.purchaseOrders.map(purchaseOrderWithReferences), ["order_no"]);
    }
    const orderItems = url.pathname.match(
      /^\/supplier-purchase-orders\/([^/]+)\/items$/,
    );
    if (request.method === "GET" && orderItems) {
      const orderId = decodeURIComponent(orderItems[1]);
      return sendPage(response, url,
        state.purchaseOrderItems.get(orderId) ?? []);
    }
    const orderDetail = url.pathname.match(
      /^\/supplier-purchase-orders\/([^/]+)$/,
    );
    if (request.method === "GET" && orderDetail) {
      const order = state.purchaseOrders.find(
        ({ id }) => id === decodeURIComponent(orderDetail[1]),
      );
      if (!order) {
        return sendError(response, 404,
          "SUPPLIER_PURCHASE_ORDER_NOT_FOUND", "采购单不存在");
      }
      return sendData(response, purchaseOrderWithReferences(order));
    }
    if (request.method === "GET" && url.pathname === "/notifications/summary") {
      return sendData(response, { unread_count: 0 });
    }
    if (request.method === "GET" && url.pathname === "/notifications") {
      return sendPage(response, url, []);
    }
    sendError(response, 404, "MOCK_ROUTE_NOT_FOUND",
      `Mock route not found: ${request.method} ${url.pathname}`);
  } catch (error) {
    sendError(response, 500, "MOCK_INTERNAL_ERROR",
      error instanceof Error ? error.message : "Mock backend failed");
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`[supplier-purchase-requisition-mock] listening on ${port}`);
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
