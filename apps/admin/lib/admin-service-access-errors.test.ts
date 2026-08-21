import { afterEach, describe, expect, mock, test } from "bun:test";

import {
  classifyAdminServiceAccessError,
  handleBrowserAdminServiceAccessError,
  resetAdminServiceAccessRedirectForTests,
} from "./admin-service-access-errors";

const originalWindowDescriptor = Object.getOwnPropertyDescriptor(
  globalThis,
  "window",
);

function setBrowserLocation(pathname: string) {
  const replace = mock(() => undefined);
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { location: { pathname, replace } },
  });
  return replace;
}

afterEach(() => {
  resetAdminServiceAccessRedirectForTests();
  if (originalWindowDescriptor) {
    Object.defineProperty(globalThis, "window", originalWindowDescriptor);
  } else {
    Reflect.deleteProperty(globalThis, "window");
  }
});

describe("classifyAdminServiceAccessError", () => {
  test("leaves authentication expiry to the session expiry handler", () => {
    expect(classifyAdminServiceAccessError({
      path: "/customers",
      status: 401,
      code: "TOKEN_INVALID",
    })).toBe("none");
    expect(classifyAdminServiceAccessError({
      path: "/customers",
      status: 403,
      code: "TOKEN_EXPIRED",
    })).toBe("none");
  });

  test("classifies expired and hard-blocked ordinary requests as redirects", () => {
    expect(classifyAdminServiceAccessError({
      path: "/customers",
      status: 402,
      code: "TENANT_SERVICE_ACCESS_EXPIRED",
    })).toBe("redirect");
    expect(classifyAdminServiceAccessError({
      path: "/api/backend/projects",
      status: 403,
      code: "TENANT_SERVICE_HARD_BLOCKED",
    })).toBe("redirect");
  });

  test("distinguishes readonly and capability denials", () => {
    expect(classifyAdminServiceAccessError({
      path: "/projects",
      status: 403,
      code: "TENANT_SERVICE_READ_ONLY",
    })).toBe("readonly");
    expect(classifyAdminServiceAccessError({
      path: "/projects",
      status: 403,
      code: "TENANT_SERVICE_CAPABILITY_NOT_INCLUDED",
    })).toBe("capability");
  });

  test("does not redirect recovery requests with raw or backend proxy paths", () => {
    const recoveryPaths = [
      "/employee/service-access",
      "/employee/service-access/purchase-link",
      "/billing",
      "/billing/service-trials/current",
      "/billing/service-products?page=1&pageSize=20",
      "/billing/service-orders/tenant-a",
      "/api/backend/employee/service-access",
      "/api/backend/employee/service-access/purchase-link",
      "/api/backend/billing/service-orders?page=1&pageSize=20",
    ];

    for (const path of recoveryPaths) {
      expect(classifyAdminServiceAccessError({
        path,
        status: 402,
        code: "TENANT_SERVICE_ACCESS_EXPIRED",
      })).toBe("none");
    }
  });

  test("does not exempt similarly prefixed requests", () => {
    const ordinaryPaths = [
      "/employee/service-accessibility",
      "/billing-other",
      "/api/backendish/billing",
    ];

    for (const path of ordinaryPaths) {
      expect(classifyAdminServiceAccessError({
        path,
        status: 402,
        code: "TENANT_SERVICE_ACCESS_EXPIRED",
      })).toBe("redirect");
    }
  });

  test("does not treat an encoded raw proxy prefix as a recovery path", () => {
    expect(classifyAdminServiceAccessError({
      path: "/api%2fbackend/billing",
      status: 402,
      code: "TENANT_SERVICE_ACCESS_EXPIRED",
    })).toBe("redirect");
  });

  test("does not exempt unknown employee service access descendants", () => {
    expect(classifyAdminServiceAccessError({
      path: "/employee/service-access/internal",
      status: 402,
      code: "TENANT_SERVICE_ACCESS_EXPIRED",
    })).toBe("redirect");
  });

  test("does not exempt proxied unknown employee service access descendants", () => {
    expect(classifyAdminServiceAccessError({
      path: "/api/backend/employee/service-access/internal",
      status: 402,
      code: "TENANT_SERVICE_ACCESS_EXPIRED",
    })).toBe("redirect");
  });

  test("resolves clear dot segments before matching raw recovery paths", () => {
    expect(classifyAdminServiceAccessError({
      path: "/billing/../projects",
      status: 402,
      code: "TENANT_SERVICE_ACCESS_EXPIRED",
    })).toBe("redirect");
  });

  test("resolves encoded dot segments before matching raw recovery paths", () => {
    expect(classifyAdminServiceAccessError({
      path: "/billing/%2e%2e/projects",
      status: 402,
      code: "TENANT_SERVICE_ACCESS_EXPIRED",
    })).toBe("redirect");
  });

  test("resolves clear dot segments in browser proxy paths", () => {
    expect(classifyAdminServiceAccessError({
      path: "/api/backend/billing/../projects",
      status: 402,
      code: "TENANT_SERVICE_ACCESS_EXPIRED",
    })).toBe("redirect");
  });

  test("resolves encoded dot segments in browser proxy paths", () => {
    expect(classifyAdminServiceAccessError({
      path: "/api/backend/billing/%2e%2e/projects",
      status: 402,
      code: "TENANT_SERVICE_ACCESS_EXPIRED",
    })).toBe("redirect");
  });

  test("resolves double-encoded dot segments after Next decodes raw paths", () => {
    expect(classifyAdminServiceAccessError({
      path: "/billing/%252e%252e/projects",
      status: 402,
      code: "TENANT_SERVICE_ACCESS_EXPIRED",
    })).toBe("redirect");
  });

  test("resolves double-encoded dot segments after Next decodes proxy paths", () => {
    expect(classifyAdminServiceAccessError({
      path: "/api/backend/billing/%252e%252e/projects",
      status: 402,
      code: "TENANT_SERVICE_ACCESS_EXPIRED",
    })).toBe("redirect");
  });

  test("classifies single-encoded slashes by their final route pathname", () => {
    for (const path of [
      "/employee/service-access%2fpurchase-link",
      "/api/backend/employee/service-access%2fpurchase-link",
    ]) {
      expect(classifyAdminServiceAccessError({
        path,
        status: 402,
        code: "TENANT_SERVICE_ACCESS_EXPIRED",
      })).toBe("none");
    }
  });

  test("keeps double-encoded slashes encoded after route parameter decoding", () => {
    for (const path of [
      "/employee/service-access%252fpurchase-link",
      "/api/backend/employee/service-access%252fpurchase-link",
    ]) {
      expect(classifyAdminServiceAccessError({
        path,
        status: 402,
        code: "TENANT_SERVICE_ACCESS_EXPIRED",
      })).toBe("redirect");
    }
  });

  test("resolves decoded slash traversal in raw paths", () => {
    expect(classifyAdminServiceAccessError({
      path: "/billing/x%2f..%2f..%2fprojects",
      status: 402,
      code: "TENANT_SERVICE_ACCESS_EXPIRED",
    })).toBe("redirect");
  });

  test("resolves decoded slash traversal in proxy paths", () => {
    expect(classifyAdminServiceAccessError({
      path: "/api/backend/billing/x%2f..%2f..%2fprojects",
      status: 402,
      code: "TENANT_SERVICE_ACCESS_EXPIRED",
    })).toBe("redirect");
  });

  test("resolves decoded backslash traversal by the final URL pathname", () => {
    for (const path of [
      "/billing/x%5c..%5c..%5cprojects",
      "/api/backend/billing/x%5c..%5c..%5cprojects",
    ]) {
      expect(classifyAdminServiceAccessError({
        path,
        status: 402,
        code: "TENANT_SERVICE_ACCESS_EXPIRED",
      })).toBe("redirect");
    }
  });

  test("fails closed when a Next path parameter cannot be decoded", () => {
    expect(classifyAdminServiceAccessError({
      path: "/billing/%E0%A4%A",
      status: 402,
      code: "TENANT_SERVICE_ACCESS_EXPIRED",
    })).toBe("redirect");
  });

  test("does not treat external hosts as internal recovery paths", () => {
    for (const path of [
      "https://external.example/billing",
      "//external.example/billing/service-orders",
    ]) {
      expect(classifyAdminServiceAccessError({
        path,
        status: 402,
        code: "TENANT_SERVICE_ACCESS_EXPIRED",
      })).toBe("redirect");
    }
  });

  test("ignores network, server, and unrelated failures", () => {
    expect(classifyAdminServiceAccessError({
      path: "/projects",
      status: 0,
      code: "TENANT_SERVICE_ACCESS_EXPIRED",
    })).toBe("none");
    expect(classifyAdminServiceAccessError({
      path: "/projects",
      status: 503,
      code: "TENANT_SERVICE_ACCESS_EXPIRED",
    })).toBe("none");
    expect(classifyAdminServiceAccessError({
      path: "/projects",
      status: 403,
      code: "FORBIDDEN",
    })).toBe("none");
  });
});

describe("handleBrowserAdminServiceAccessError", () => {
  test("replaces an ordinary page at most once for repeated expired responses", () => {
    const replace = setBrowserLocation("/projects");
    const failure = {
      path: "/projects",
      status: 402,
      code: "TENANT_SERVICE_ACCESS_EXPIRED",
    };

    expect(handleBrowserAdminServiceAccessError(failure)).toBe("redirect");
    expect(handleBrowserAdminServiceAccessError(failure)).toBe("redirect");

    expect(replace).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalledWith("/service-access");
  });

  test("does not redirect while the browser is already in a recovery scope", () => {
    for (const pathname of [
      "/service-access",
      "/service-access/history",
      "/billing",
      "/billing/orders",
    ]) {
      resetAdminServiceAccessRedirectForTests();
      const replace = setBrowserLocation(pathname);

      expect(handleBrowserAdminServiceAccessError({
        path: "/projects",
        status: 403,
        code: "TENANT_SERVICE_HARD_BLOCKED",
      })).toBe("redirect");
      expect(replace).not.toHaveBeenCalled();
    }
  });

  test("does not redirect recovery API failures", () => {
    const replace = setBrowserLocation("/service-access");

    expect(handleBrowserAdminServiceAccessError({
      path: "/api/backend/billing/service-trials/current",
      status: 402,
      code: "TENANT_SERVICE_ACCESS_EXPIRED",
    })).toBe("none");
    expect(replace).not.toHaveBeenCalled();
  });
});
