import { createServer } from "node:http";

import {
  pagination,
  personaNames,
  purchaseUrl,
  serviceAccessSummary,
  serviceProduct,
  sessions,
  tenantBillingSummary,
  trialApplication,
} from "./service-access-mock-fixture.mjs";

const port = Number.parseInt(
  process.env.SERVICE_ACCESS_MOCK_BACKEND_PORT || "3992",
  10,
);

let state = createState();

function createState(input = {}) {
  return {
    persona: input.persona ?? personaNames.blockedAdmin,
    serviceAccess503: input.serviceAccess503 === true,
    runtime402Remaining: input.runtime402 === true ? 1 : 0,
    runtimeBlocked: false,
    requestCounts: {},
    requestQueries: {},
    forbiddenRequests: [],
    unexpectedRequests: [],
    trialApplications: 0,
    purchaseHandoffs: 0,
    orderCreationAttempts: 0,
    paymentCreationAttempts: 0,
  };
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(payload));
}

function sendData(response, data) {
  sendJson(response, 200, { success: true, data });
}

function readBody(request) {
  return new Promise((resolve) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
  });
}

function countRequest(method, url) {
  const { pathname, search } = url;
  const key = `${method} ${pathname}`;
  state.requestCounts[key] = (state.requestCounts[key] ?? 0) + 1;
  state.requestQueries[key] = [...(state.requestQueries[key] ?? []), search];
}

function list(data = [], requestedPagination) {
  return {
    list: data,
    pagination: pagination(
      data.length,
      requestedPagination.page,
      requestedPagination.pageSize,
    ),
  };
}

function validatePagination(request, response, url, rule = {}) {
  const pages = url.searchParams.getAll("page");
  const pageSizes = url.searchParams.getAll("pageSize");
  const integerPattern = /^[1-9]\d*$/;
  const page = pages.length === 1 && integerPattern.test(pages[0])
    ? Number.parseInt(pages[0], 10)
    : null;
  const pageSize = pageSizes.length === 1 && integerPattern.test(pageSizes[0])
    ? Number.parseInt(pageSizes[0], 10)
    : null;
  const onlyAllowedParameters = !rule.allowedParameters
    || [...url.searchParams.keys()].every(
      (name) => rule.allowedParameters.has(name),
    );
  const valid = page !== null
    && pageSize !== null
    && pageSize <= (rule.maxPageSize ?? 100)
    && (rule.page === undefined || page === rule.page)
    && (rule.pageSize === undefined || pageSize === rule.pageSize)
    && onlyAllowedParameters;
  if (valid) return { page, pageSize };

  const requestTarget = `${request.method} ${url.pathname}${url.search}`;
  state.unexpectedRequests.push(requestTarget);
  sendJson(response, 400, {
    success: false,
    code: "MOCK_PAGINATION_INVALID",
    message: "列表请求分页参数无效",
  });
  return null;
}

const exactListParameters = new Set(["page", "pageSize"]);
const createListParameters = new Set([
  "page",
  "pageSize",
  "scene",
  "customer_id",
]);

function validateExactPagination(request, response, url, pageSize) {
  return validatePagination(request, response, url, {
    page: 1,
    pageSize,
    allowedParameters: exactListParameters,
  });
}

function isRecoveryCapabilityPath(pathname) {
  return pathname.startsWith("/billing/service-trials")
    || pathname === "/billing/service-products"
    || pathname === "/billing/service-orders"
    || pathname === "/employee/service-access/purchase-link";
}

function authorizeCapabilityRequest(request, response, pathname) {
  if (
    state.persona !== personaNames.blockedEmployee
    || !isRecoveryCapabilityPath(pathname)
  ) return true;

  state.forbiddenRequests.push(`${request.method} ${pathname}`);
  sendJson(response, 403, {
    success: false,
    code: "FORBIDDEN",
    message: "无权访问恢复能力",
  });
  return false;
}

function billingFeatureEstimates() {
  return {
    sms: {
      metric_code: "sms_domestic_success",
      unit: "message",
      unit_credits: 50,
      min_charge_credits: 50,
    },
    social_video: {
      metric_code: "social_video_transcription_minute",
      unit: "minute",
      unit_credits: 60,
      min_charge_credits: 60,
    },
    ai: {
      input_token_1k_credits: 10,
      output_token_1k_credits: 50,
      min_charge_credits: 0,
    },
  };
}

function handleProjectRequest(request, response, url) {
  const { pathname } = url;
  if (request.method === "GET" && pathname === "/projects") {
    const requestedPagination = validatePagination(request, response, url);
    if (!requestedPagination) return true;
    sendData(response, list([], requestedPagination));
    return true;
  }
  if (request.method === "GET" && pathname === "/projects/workflow-filters") {
    sendData(response, { groups: [], nodes: [], instance_statuses: [] });
    return true;
  }
  if (request.method === "GET" && pathname.startsWith("/projects/create/")) {
    const requestedPagination = validatePagination(request, response, url, {
      page: 1,
      pageSize: 80,
      allowedParameters: createListParameters,
    });
    if (!requestedPagination) return true;
    sendData(response, list([], requestedPagination));
    return true;
  }
  if (request.method === "POST" && pathname === "/projects") {
    if (state.runtime402Remaining > 0) {
      state.runtime402Remaining -= 1;
      state.runtimeBlocked = true;
      const statusCode = url.searchParams.has("__e2eSynthetic402") ? 200 : 402;
      sendJson(response, statusCode, {
        success: false,
        code: "TENANT_SERVICE_ACCESS_EXPIRED",
        message: "租户服务访问已到期",
      });
      return true;
    }
    sendJson(response, 405, {
      success: false,
      code: "MOCK_PROJECT_CREATION_DISABLED",
      message: "E2E 不创建真实项目",
    });
    return true;
  }
  return false;
}

async function handleRequest(request, response) {
  const url = new URL(
    request.url || "/",
    `http://${request.headers.host || `127.0.0.1:${port}`}`,
  );
  const { pathname } = url;

  if (request.method === "GET" && pathname === "/health") {
    sendJson(response, 200, { success: true });
    return;
  }
  if (request.method === "POST" && pathname === "/__test/reset") {
    const input = JSON.parse(await readBody(request) || "{}");
    state = createState(input);
    sendJson(response, 200, { success: true });
    return;
  }
  if (request.method === "GET" && pathname === "/__test/state") {
    sendJson(response, 200, structuredClone(state));
    return;
  }

  countRequest(request.method, url);
  if (!authorizeCapabilityRequest(request, response, pathname)) return;

  if (request.method === "POST" && pathname === "/admin/auth/login") {
    await readBody(request);
    sendData(response, sessions[state.persona]);
    return;
  }
  if (request.method === "GET" && pathname === "/admin/auth/me") {
    sendData(response, sessions[state.persona]);
    return;
  }
  if (request.method === "GET" && pathname === "/notifications/summary") {
    // Transitive Admin shell dependency for every allowed browser scenario.
    sendData(response, { unread_count: 0 });
    return;
  }
  if (request.method === "GET" && pathname === "/employee/service-access") {
    if (state.serviceAccess503) {
      sendJson(response, 503, {
        success: false,
        code: "SERVICE_ACCESS_UNAVAILABLE",
        message: "服务状态查询暂时不可用",
      });
      return;
    }
    sendData(response, serviceAccessSummary(
      state.persona,
      state.runtimeBlocked,
    ));
    return;
  }
  if (
    request.method === "GET"
    && pathname === "/billing/service-trials/current"
  ) {
    sendData(response, { trial: null });
    return;
  }
  if (request.method === "GET" && pathname === "/billing/service-trials") {
    const requestedPagination = validateExactPagination(
      request,
      response,
      url,
      20,
    );
    if (!requestedPagination) return;
    sendData(response, list([], requestedPagination));
    return;
  }
  if (
    request.method === "POST"
    && pathname === "/billing/service-trials/applications"
  ) {
    await readBody(request);
    state.trialApplications += 1;
    sendData(response, { trial: trialApplication(), idempotent: false });
    return;
  }
  if (request.method === "GET" && pathname === "/billing/service-products") {
    const requestedPagination = validateExactPagination(
      request,
      response,
      url,
      20,
    );
    if (!requestedPagination) return;
    sendData(response, list([serviceProduct], requestedPagination));
    return;
  }
  if (request.method === "GET" && pathname === "/billing/service-orders") {
    const requestedPagination = validateExactPagination(
      request,
      response,
      url,
      20,
    );
    if (!requestedPagination) return;
    sendData(response, {
      ...list([], requestedPagination),
      server_time: "2026-08-20T10:00:00.000+08:00",
    });
    return;
  }
  if (
    request.method === "POST"
    && pathname === "/employee/service-access/purchase-link"
  ) {
    await readBody(request);
    state.purchaseHandoffs += 1;
    sendData(response, {
      url: purchaseUrl,
      expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
    });
    return;
  }
  // Transitive reads required to render the explicitly allowed /billing page.
  if (request.method === "GET" && pathname === "/billing/summary") {
    sendData(response, tenantBillingSummary);
    return;
  }
  if (request.method === "GET" && pathname === "/billing/feature-estimates") {
    sendData(response, billingFeatureEstimates());
    return;
  }
  if (request.method === "GET" && pathname === "/billing/ledger") {
    const requestedPagination = validateExactPagination(
      request,
      response,
      url,
      20,
    );
    if (!requestedPagination) return;
    sendData(response, list([], requestedPagination));
    return;
  }
  if (pathname.includes("payment") && request.method === "POST") {
    state.paymentCreationAttempts += 1;
  }
  if (pathname === "/billing/service-orders" && request.method === "POST") {
    state.orderCreationAttempts += 1;
  }
  if (handleProjectRequest(request, response, url)) return;

  state.unexpectedRequests.push(`${request.method} ${pathname}`);
  sendJson(response, 404, {
    success: false,
    code: "MOCK_ROUTE_NOT_FOUND",
    message: `Mock route not found: ${request.method} ${pathname}`,
  });
}

const server = createServer((request, response) => {
  void handleRequest(request, response).catch((error) => {
    sendJson(response, 500, {
      success: false,
      code: "MOCK_INTERNAL_ERROR",
      message: error instanceof Error ? error.message : String(error),
    });
  });
});

server.listen(port, "127.0.0.1", () => {
  console.log(`[service-access-mock] listening on http://127.0.0.1:${port}`);
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
