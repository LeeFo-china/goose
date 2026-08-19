import { describe, expect, mock, test } from "bun:test";

import type { AdminTenantServiceAccess } from "@gooes/domain";

import { buildBackendUrl, type AdminSession } from "@/lib/backend";

import { loadTenantServiceAccess } from "./tenant-service-access";

const UNAVAILABLE_MESSAGE = "服务状态暂时无法加载，请稍后重试";

const validSummary: AdminTenantServiceAccess = {
  accessStatus: "workspace_available",
  accessMode: "paid",
  accessLevel: "read_write",
  canEnterWorkspace: true,
  readonly: false,
  trialId: null,
  trialStatus: null,
  startsAt: null,
  endsAt: null,
  evaluatedAt: "2026-08-19T00:00:00.000Z",
  title: "服务可用",
  message: "可以进入工作台",
  primaryAction: {
    key: "enter_workspace",
    label: "进入工作台",
  },
  secondaryAction: null,
};

function createSession({
  platformOnly = false,
  tenantId = "tenant-a",
}: {
  platformOnly?: boolean;
  tenantId?: string | null;
} = {}): AdminSession {
  return {
    user_id: "user-a",
    login_channel: "admin_web",
    employee: {
      id: "employee-a",
      name: "管理员",
      status: "active",
      tenant_department_id: null,
      department_name: null,
      post_id: null,
      post_name: null,
      avatar: null,
    },
    tenant: tenantId === null
      ? null
      : {
          id: tenantId,
          name: "测试租户",
          slug: "tenant-a",
          status: "active",
        },
    roles: platformOnly ? ["platform_admin"] : ["tenant_admin"],
    permissions: [],
  };
}

function expectUnavailable(
  result: Awaited<ReturnType<typeof loadTenantServiceAccess>>,
) {
  expect(result).toEqual({
    kind: "unavailable",
    message: UNAVAILABLE_MESSAGE,
  });
  if (result.kind === "unavailable") {
    expect(result.message).not.toMatch(/到期|未开通|expired|service_blocked/i);
  }
}

describe("loadTenantServiceAccess", () => {
  test("bypasses platform-only sessions without a token or request", async () => {
    const fetchImpl = mock(async () => {
      throw new Error("fetch should not be called");
    }) as unknown as typeof fetch;

    const result = await loadTenantServiceAccess({
      session: createSession({ platformOnly: true, tenantId: null }),
      token: null,
      fetchImpl,
    });

    expect(result).toEqual({ kind: "bypass" });
    expect(fetchImpl).toHaveBeenCalledTimes(0);
  });

  test("loads a valid tenant service access summary without caching", async () => {
    const fetchImpl = mock(async () => Response.json({
      success: true,
      data: validSummary,
      requestId: "req-service-access",
    })) as unknown as typeof fetch;

    const result = await loadTenantServiceAccess({
      session: createSession(),
      token: "admin-token",
      fetchImpl,
    });

    expect(result).toEqual({ kind: "ready", summary: validSummary });
    expect(fetchImpl).toHaveBeenCalledWith(
      buildBackendUrl("/employee/service-access"),
      {
        headers: { authorization: "Bearer admin-token" },
        cache: "no-store",
      },
    );
  });

  test("returns unavailable without requesting when the token is missing", async () => {
    const fetchImpl = mock(async () => Response.json({
      success: true,
      data: validSummary,
      requestId: "req-unexpected",
    })) as unknown as typeof fetch;

    const result = await loadTenantServiceAccess({
      session: createSession(),
      token: null,
      fetchImpl,
    });

    expectUnavailable(result);
    expect(fetchImpl).toHaveBeenCalledTimes(0);
  });

  test("returns unavailable without requesting when the tenant is missing", async () => {
    const fetchImpl = mock(async () => Response.json({
      success: true,
      data: validSummary,
      requestId: "req-unexpected",
    })) as unknown as typeof fetch;

    const result = await loadTenantServiceAccess({
      session: createSession({ tenantId: null }),
      token: "admin-token",
      fetchImpl,
    });

    expectUnavailable(result);
    expect(fetchImpl).toHaveBeenCalledTimes(0);
  });

  const responseFailures = [
    {
      name: "401 response",
      createResponse: () => Response.json({
        success: false,
        message: "登录已过期",
        code: "TOKEN_EXPIRED",
        requestId: "req-unauthorized",
      }, { status: 401 }),
    },
    {
      name: "402 expired-service response",
      createResponse: () => Response.json({
        success: false,
        message: "租户服务已到期",
        code: "TENANT_SERVICE_ACCESS_EXPIRED",
        requestId: "req-expired",
      }, { status: 402 }),
    },
    {
      name: "403 response",
      createResponse: () => Response.json({
        success: false,
        message: "无权访问租户服务状态",
        code: "FORBIDDEN",
        requestId: "req-forbidden",
      }, { status: 403 }),
    },
    {
      name: "503 response",
      createResponse: () => Response.json({
        success: false,
        message: "服务暂时不可用",
        code: "SERVICE_UNAVAILABLE",
        requestId: "req-unavailable",
      }, { status: 503 }),
    },
    {
      name: "invalid JSON response",
      createResponse: () => new Response("not-json", {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    },
    {
      name: "schema-invalid success response",
      createResponse: () => Response.json({
        success: true,
        data: { ...validSummary, readonly: true },
        requestId: "req-invalid-schema",
      }),
    },
    {
      name: "invalid BackendResponse envelope",
      createResponse: () => Response.json({
        success: "yes",
        data: validSummary,
        requestId: "req-invalid-envelope",
      }),
    },
    {
      name: "BackendResponse envelope missing success",
      createResponse: () => Response.json({
        data: validSummary,
        message: "success",
        requestId: "req-missing-success",
      }),
    },
  ];

  for (const { name, createResponse } of responseFailures) {
    test(`returns the same unavailable result for a ${name}`, async () => {
      const fetchImpl = mock(async () => createResponse()) as unknown as typeof fetch;

      const result = await loadTenantServiceAccess({
        session: createSession(),
        token: "admin-token",
        fetchImpl,
      });

      expectUnavailable(result);
    });
  }

  test("returns unavailable when the network request throws", async () => {
    const fetchImpl = mock(async () => {
      throw new TypeError("network unavailable");
    }) as unknown as typeof fetch;

    const result = await loadTenantServiceAccess({
      session: createSession(),
      token: "admin-token",
      fetchImpl,
    });

    expectUnavailable(result);
  });
});
