import { afterEach, describe, expect, mock, test } from "bun:test";
import { ADMIN_SESSION_STORAGE_PREFIX } from "@/components/layout/admin-session-scope";
import { resetAdminServiceAccessRedirectForTests } from "./admin-service-access-errors";
import { requestBackendJson } from "./backend-client";

const originalFetch = globalThis.fetch;
const originalWindowDescriptor = Object.getOwnPropertyDescriptor(globalThis, "window");

afterEach(() => {
  resetAdminServiceAccessRedirectForTests();
  globalThis.fetch = originalFetch;
  if (originalWindowDescriptor) {
    Object.defineProperty(globalThis, "window", originalWindowDescriptor);
  } else {
    Reflect.deleteProperty(globalThis, "window");
  }
});

describe("requestBackendJson", () => {
  test("preserves the backend error while redirecting an expired browser session", async () => {
    const values = new Map([
      [`${ADMIN_SESSION_STORAGE_PREFIX}tenant-a`, "cached"],
      ["unrelated-setting", "preserved"],
    ]);
    const replace = mock(() => undefined);
    const storage = {
      get length() {
        return values.size;
      },
      key(index: number) {
        return [...values.keys()][index] ?? null;
      },
      removeItem(key: string) {
        values.delete(key);
      },
    };
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: { location: { replace }, localStorage: storage },
    });
    globalThis.fetch = mock(async () => Response.json({
      success: false,
      message: "登录已过期",
      code: "TOKEN_EXPIRED",
      requestId: "req-auth",
    }, { status: 401 })) as unknown as typeof fetch;

    await expect(requestBackendJson("/customers")).rejects.toMatchObject({
      message: "登录已过期",
      status: 401,
      code: "TOKEN_EXPIRED",
      requestId: "req-auth",
    });
    expect(replace).toHaveBeenCalledWith("/login?reason=session_expired");
    expect(values.has(`${ADMIN_SESSION_STORAGE_PREFIX}tenant-a`)).toBe(false);
    expect(values.has("unrelated-setting")).toBe(true);
  });

  test("preserves session state and redirects once for repeated expired responses", async () => {
    const values = new Map([
      [`${ADMIN_SESSION_STORAGE_PREFIX}tenant-a`, "cached"],
      ["unrelated-setting", "preserved"],
    ]);
    const replace = mock(() => undefined);
    const storage = {
      get length() {
        return values.size;
      },
      key(index: number) {
        return [...values.keys()][index] ?? null;
      },
      removeItem(key: string) {
        values.delete(key);
      },
    };
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        location: { pathname: "/projects", replace },
        localStorage: storage,
      },
    });
    const payload = {
      success: false,
      message: "租户服务访问已到期",
      code: "TENANT_SERVICE_ACCESS_EXPIRED",
      requestId: "req-expired",
      details: { accessStatus: "expired" },
    };
    const fetchFailure = mock(async () => Response.json(payload, { status: 402 }));
    globalThis.fetch = fetchFailure as unknown as typeof fetch;

    for (let attempt = 0; attempt < 2; attempt += 1) {
      await expect(requestBackendJson("/projects")).rejects.toMatchObject({
        message: "租户服务访问已到期",
        status: 402,
        code: "TENANT_SERVICE_ACCESS_EXPIRED",
        requestId: "req-expired",
        payload,
      });
    }

    expect(replace).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalledWith("/service-access");
    expect(values.has(`${ADMIN_SESSION_STORAGE_PREFIX}tenant-a`)).toBe(true);
    expect(values.has("unrelated-setting")).toBe(true);
  });

  test("normalizes readonly errors without clearing session state", async () => {
    const values = new Map([
      [`${ADMIN_SESSION_STORAGE_PREFIX}tenant-a`, "cached"],
    ]);
    const replace = mock(() => undefined);
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        location: { pathname: "/projects", replace },
        localStorage: {
          get length() {
            return values.size;
          },
          key(index: number) {
            return [...values.keys()][index] ?? null;
          },
          removeItem(key: string) {
            values.delete(key);
          },
        },
      },
    });
    const payload = {
      success: false,
      message: "此写入不允许执行",
      code: "TENANT_SERVICE_READ_ONLY",
      requestId: "req-readonly",
      details: { accessLevel: "read_only" },
    };
    const fetchFailure = mock(async () => Response.json(payload, { status: 403 }));
    globalThis.fetch = fetchFailure as unknown as typeof fetch;

    await expect(requestBackendJson("/projects/project-a")).rejects.toMatchObject({
      message: "当前处于只读宽限期",
      status: 403,
      code: "TENANT_SERVICE_READ_ONLY",
      requestId: "req-readonly",
      payload,
    });
    expect(replace).not.toHaveBeenCalled();
    expect(values.has(`${ADMIN_SESSION_STORAGE_PREFIX}tenant-a`)).toBe(true);
  });

  test("redirects hard-blocked ordinary requests while preserving the error", async () => {
    const replace = mock(() => undefined);
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        location: { pathname: "/projects", replace },
        localStorage: null,
      },
    });
    const payload = {
      success: false,
      message: "企业账号已被平台停用",
      code: "TENANT_SERVICE_HARD_BLOCKED",
      requestId: "req-hard-blocked",
    };
    const fetchFailure = mock(async () => Response.json(payload, { status: 403 }));
    globalThis.fetch = fetchFailure as unknown as typeof fetch;

    await expect(requestBackendJson("/projects")).rejects.toMatchObject({
      message: "企业账号已被平台停用",
      status: 403,
      code: "TENANT_SERVICE_HARD_BLOCKED",
      requestId: "req-hard-blocked",
      payload,
    });
    expect(replace).toHaveBeenCalledWith("/service-access");
  });

  test("keeps capability denials on the current page with the backend message", async () => {
    const replace = mock(() => undefined);
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        location: { pathname: "/projects", replace },
        localStorage: null,
      },
    });
    const payload = {
      success: false,
      message: "当前服务套餐不包含该能力",
      code: "TENANT_SERVICE_CAPABILITY_NOT_INCLUDED",
      requestId: "req-capability",
    };
    const fetchFailure = mock(async () => Response.json(payload, { status: 403 }));
    globalThis.fetch = fetchFailure as unknown as typeof fetch;

    await expect(requestBackendJson("/projects")).rejects.toMatchObject({
      message: "当前服务套餐不包含该能力",
      status: 403,
      code: "TENANT_SERVICE_CAPABILITY_NOT_INCLUDED",
      requestId: "req-capability",
      payload,
    });
    expect(replace).not.toHaveBeenCalled();
  });

  test("does not redirect recovery API or server failures", async () => {
    const replace = mock(() => undefined);
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        location: { pathname: "/projects", replace },
        localStorage: null,
      },
    });
    const expiredPayload = {
      success: false,
      message: "租户服务访问已到期",
      code: "TENANT_SERVICE_ACCESS_EXPIRED",
    };
    globalThis.fetch = mock(async () => Response.json(
      expiredPayload,
      { status: 402 },
    )) as unknown as typeof fetch;

    await expect(requestBackendJson(
      "/api/backend/billing/service-orders?page=1&pageSize=20",
    )).rejects.toMatchObject({
      status: 402,
      code: "TENANT_SERVICE_ACCESS_EXPIRED",
    });

    const serverPayload = {
      success: false,
      message: "服务暂时不可用",
      code: "TENANT_SERVICE_ACCESS_EXPIRED",
    };
    globalThis.fetch = mock(async () => Response.json(
      serverPayload,
      { status: 503 },
    )) as unknown as typeof fetch;

    await expect(requestBackendJson("/projects")).rejects.toMatchObject({
      message: "服务暂时不可用",
      status: 503,
      code: "TENANT_SERVICE_ACCESS_EXPIRED",
      payload: serverPayload,
    });
    expect(replace).not.toHaveBeenCalled();
  });
});
