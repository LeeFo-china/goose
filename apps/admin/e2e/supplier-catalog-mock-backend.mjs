import { createServer } from "node:http";

import {
  currentServiceAccessSummary,
  mockCatalogSession,
  mockTenantCatalogSession,
  mockTenantCatalogViewerSession,
} from "./supplier-catalog-mock-fixture.mjs";
import { createCatalogMockRuntime } from "./supplier-catalog-mock-handlers.mjs";
import { readBody, sendJson } from "./supplier-catalog-mock-support.mjs";

const port = Number.parseInt(
  process.env.SUPPLIER_CATALOG_MOCK_BACKEND_PORT || "3997",
  10,
);
const runtime = createCatalogMockRuntime();

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
    runtime.reset();
    sendJson(response, 200, { success: true });
    return;
  }
  if (request.method === "GET" && url.pathname === "/__test/mutations") {
    sendJson(response, 200, { mutations: runtime.mutations() });
    return;
  }
  if (request.method === "GET" && url.pathname === "/__test/catalog-requests") {
    sendJson(response, 200, { requests: runtime.catalogRequests() });
    return;
  }
  if (request.method === "POST" && url.pathname === "/__test/conflict-next") {
    runtime.setConflictNext(JSON.parse(await readBody(request) || "{}"));
    sendJson(response, 200, { success: true });
    return;
  }
  if (request.method === "POST" && url.pathname === "/admin/auth/login") {
    const payload = JSON.parse(await readBody(request) || "{}");
    const session = payload.phone === mockTenantCatalogSession.employee.phone
      ? mockTenantCatalogSession
      : payload.phone === mockTenantCatalogViewerSession.employee.phone
        ? mockTenantCatalogViewerSession
        : mockCatalogSession;
    sendJson(response, 200, { success: true, data: session });
    return;
  }
  if (request.method === "GET" && url.pathname === "/admin/auth/me") {
    const authorization = request.headers.authorization || "";
    const session = authorization.includes(mockTenantCatalogSession.token)
      ? mockTenantCatalogSession
      : authorization.includes(mockTenantCatalogViewerSession.token)
        ? mockTenantCatalogViewerSession
        : mockCatalogSession;
    sendJson(response, 200, { success: true, data: session });
    return;
  }
  if (request.method === "GET" && url.pathname === "/employee/service-access") {
    sendJson(response, 200, { success: true, data: currentServiceAccessSummary() });
    return;
  }
  if (request.method === "GET" && url.pathname.startsWith("/catalog/")) {
    runtime.recordCatalogRequest(url);
  }
  if (request.method === "GET" && url.pathname === "/catalog/categories") {
    sendJson(response, 200, {
      success: true,
      data: runtime.listTenantCategories(url),
    });
    return;
  }
  if (request.method === "POST" && url.pathname === "/catalog/categories") {
    await runtime.createTenantCategory(request, response, url);
    return;
  }
  const tenantCategoryPin = url.pathname.match(/^\/catalog\/categories\/([^/]+):pin$/);
  if (request.method === "POST" && tenantCategoryPin) {
    await runtime.pinTenantCategory(
      request,
      response,
      url,
      decodeURIComponent(tenantCategoryPin[1]),
    );
    return;
  }
  const tenantCategory = url.pathname.match(/^\/catalog\/categories\/([^/]+)$/);
  if (request.method === "PATCH" && tenantCategory) {
    await runtime.updateTenantCategory(
      request,
      response,
      url,
      decodeURIComponent(tenantCategory[1]),
    );
    return;
  }
  if (request.method === "GET" && url.pathname === "/catalog/brands") {
    sendJson(response, 200, {
      success: true,
      data: runtime.listTenantBrands(url),
    });
    return;
  }
  if (request.method === "POST" && url.pathname === "/catalog/brands") {
    await runtime.createTenantBrand(request, response, url);
    return;
  }
  const tenantBrand = url.pathname.match(/^\/catalog\/brands\/([^/]+)$/);
  if (request.method === "PATCH" && tenantBrand) {
    await runtime.updateTenantBrand(
      request,
      response,
      url,
      decodeURIComponent(tenantBrand[1]),
    );
    return;
  }
  if (request.method === "GET" && url.pathname === "/catalog/units") {
    sendJson(response, 200, { success: true, data: runtime.listUnits(url) });
    return;
  }
  if (request.method === "GET" && url.pathname === "/catalog/unit-suggestions") {
    sendJson(response, 200, {
      success: true,
      data: runtime.listSuggestions(url),
    });
    return;
  }
  if (request.method === "POST" && url.pathname === "/catalog/unit-suggestions") {
    await runtime.createUnitSuggestion(request, response, url);
    return;
  }
  if (request.method === "GET" && url.pathname === "/platform/catalog/categories") {
    sendJson(response, 200, { success: true, data: runtime.listCategories(url) });
    return;
  }
  if (request.method === "GET" && url.pathname === "/platform/catalog/brands") {
    sendJson(response, 200, { success: true, data: runtime.listBrands(url) });
    return;
  }
  if (request.method === "GET" && url.pathname === "/platform/catalog/units") {
    sendJson(response, 200, { success: true, data: runtime.listUnits(url) });
    return;
  }
  if (
    request.method === "GET" &&
    url.pathname === "/platform/catalog/unit-suggestions"
  ) {
    sendJson(response, 200, {
      success: true,
      data: runtime.listSuggestions(url),
    });
    return;
  }
  if (request.method === "POST" && url.pathname === "/platform/catalog/categories") {
    await runtime.createCategory(request, response, url);
    return;
  }
  if (request.method === "POST" && url.pathname === "/platform/catalog/brands") {
    await runtime.createBrand(request, response, url);
    return;
  }
  if (request.method === "POST" && url.pathname === "/platform/catalog/units") {
    await runtime.createUnit(request, response, url);
    return;
  }

  const platformSpecList = url.pathname.match(
    /^\/platform\/catalog\/categories\/([^/]+)\/spec-definitions$/,
  );
  if (request.method === "GET" && platformSpecList) {
    sendJson(response, 200, {
      success: true,
      data: runtime.listSpecs(decodeURIComponent(platformSpecList[1]), url),
    });
    return;
  }
  if (request.method === "POST" && platformSpecList) {
    await runtime.createSpec(
      request,
      response,
      url,
      decodeURIComponent(platformSpecList[1]),
      "platform",
    );
    return;
  }
  const platformSpecItem = url.pathname.match(
    /^\/platform\/catalog\/categories\/([^/]+)\/spec-definitions\/([^/]+)$/,
  );
  if (request.method === "PATCH" && platformSpecItem) {
    await runtime.updateSpec(
      request,
      response,
      url,
      decodeURIComponent(platformSpecItem[1]),
      decodeURIComponent(platformSpecItem[2]),
    );
    return;
  }
  const tenantSpecList = url.pathname.match(
    /^\/catalog\/categories\/([^/]+)\/spec-definitions$/,
  );
  if (request.method === "GET" && tenantSpecList) {
    sendJson(response, 200, {
      success: true,
      data: runtime.listSpecs(decodeURIComponent(tenantSpecList[1]), url),
    });
    return;
  }
  if (request.method === "POST" && tenantSpecList) {
    await runtime.createSpec(
      request,
      response,
      url,
      decodeURIComponent(tenantSpecList[1]),
      "tenant",
    );
    return;
  }
  const tenantCopySpecs = url.pathname.match(
    /^\/catalog\/categories\/([^/]+)\/spec-definitions:copy-platform$/,
  );
  if (request.method === "POST" && tenantCopySpecs) {
    await runtime.copyPlatformSpecs(
      request,
      response,
      url,
      decodeURIComponent(tenantCopySpecs[1]),
    );
    return;
  }
  const tenantSpecItem = url.pathname.match(
    /^\/catalog\/categories\/([^/]+)\/spec-definitions\/([^/]+)$/,
  );
  if (request.method === "PATCH" && tenantSpecItem) {
    await runtime.updateSpec(
      request,
      response,
      url,
      decodeURIComponent(tenantSpecItem[1]),
      decodeURIComponent(tenantSpecItem[2]),
    );
    return;
  }
  const suggestion = url.pathname.match(
    /^\/platform\/catalog\/unit-suggestions\/([^/]+)$/,
  );
  if (request.method === "PATCH" && suggestion) {
    await runtime.reviewUnitSuggestion(
      request,
      response,
      url,
      decodeURIComponent(suggestion[1]),
    );
    return;
  }
  const category = url.pathname.match(/^\/platform\/catalog\/categories\/([^/]+)$/);
  if (request.method === "PATCH" && category) {
    await runtime.updateCategory(request, response, url, decodeURIComponent(category[1]));
    return;
  }
  const brand = url.pathname.match(/^\/platform\/catalog\/brands\/([^/]+)$/);
  if (request.method === "PATCH" && brand) {
    await runtime.updateBrand(request, response, url, decodeURIComponent(brand[1]));
    return;
  }
  const unit = url.pathname.match(/^\/platform\/catalog\/units\/([^/]+)$/);
  if (request.method === "PATCH" && unit) {
    await runtime.updateUnit(request, response, url, decodeURIComponent(unit[1]));
    return;
  }
  if (request.method === "GET" && url.pathname === "/notifications/summary") {
    sendJson(response, 200, { success: true, data: { unread_count: 0 } });
    return;
  }
  if (request.method === "GET" && url.pathname === "/notifications") {
    sendJson(response, 200, {
      success: true,
      data: {
        list: [],
        pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
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
  console.log(`[supplier-catalog-mock] listening on http://127.0.0.1:${port}`);
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
