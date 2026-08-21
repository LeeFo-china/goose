import { beforeAll, describe, expect, mock, test } from "bun:test";

import type { AuthContext } from "@/services/authorization";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

let Service: typeof import("./tenant-douyin-leads").TenantDouyinLeadsService;

beforeAll(async () => {
  ({ TenantDouyinLeadsService: Service } = await import("./tenant-douyin-leads"));
});

const TENANT_ID = "11111111-1111-4111-8111-111111111111";
const EMPLOYEE_ID = "55555555-5555-4555-8555-555555555555";
const DEPARTMENT_ID = "99999999-9999-4999-8999-999999999999";

type Scope = "self" | "department" | "assigned" | "all";

function auth(scope: Scope, input: {
  tenantId?: string | null;
  employeeId?: string | null;
  tenantDepartmentId?: string | null;
  permissions?: string[];
} = {}): AuthContext {
  const permissions = input.permissions ?? ["douyin_lead.assign"];
  return {
    tenantId: input.tenantId === undefined ? TENANT_ID : input.tenantId,
    employeeId: input.employeeId === undefined ? EMPLOYEE_ID : input.employeeId,
    tenantDepartmentId: input.tenantDepartmentId === undefined
      ? DEPARTMENT_ID : input.tenantDepartmentId,
    permissions: permissions.map((code) => ({ code, scope })),
  } as AuthContext;
}

function fixture(input: { total?: number;
  rows?: Array<{ id: string; name: string | null }> } = {}) {
  const repository = {
    listAssigneeCandidates: mock(async () => ({
      rows: input.rows ?? [{ id: EMPLOYEE_ID, name: "王顾问" }],
      total: input.total ?? 101,
    })),
  };
  const accessPolicy = {
    assertTenantContext: mock((context: AuthContext) => {
      if (!context.tenantId) throw Object.assign(new Error("tenant"), {
        statusCode: 403,
      });
      return context.tenantId;
    }),
    assertPermission: mock((context: AuthContext, permission: string) => {
      const found = context.permissions.find((item) => item.code === permission);
      if (!found) throw Object.assign(new Error("forbidden"), { statusCode: 403 });
      return found.scope;
    }),
  };
  return {
    service: new Service({ repository, accessPolicy, phonePrivacy: {} } as never),
    repository,
    accessPolicy,
  };
}

describe("TenantDouyinLeadsService assignee candidates", () => {
  test("uses only assign permission and returns the strict paginated view", async () => {
    const context = fixture();
    await expect(context.service.listAssigneeCandidates(auth("all"), {
      page: 1, pageSize: 100, keyword: " 王顾问 ",
    })).resolves.toEqual({
      list: [{ id: EMPLOYEE_ID, name: "王顾问" }],
      pagination: { page: 1, pageSize: 100, total: 101, totalPages: 2 },
    });
    expect(context.accessPolicy.assertPermission).toHaveBeenCalledTimes(1);
    expect(context.accessPolicy.assertPermission).toHaveBeenCalledWith(
      expect.anything(), "douyin_lead.assign",
    );
    expect(context.repository.listAssigneeCandidates).toHaveBeenCalledWith({
      tenantId: TENANT_ID, scope: "all", employeeId: EMPLOYEE_ID,
      tenantDepartmentId: DEPARTMENT_ID,
      page: 1, pageSize: 100, keyword: "王顾问",
    });
  });

  test("passes department and self-compatible scopes without broadening them", async () => {
    for (const scope of ["department", "self", "assigned"] as const) {
      const context = fixture({ total: 1 });
      await context.service.listAssigneeCandidates(auth(scope), {});
      expect(context.repository.listAssigneeCandidates).toHaveBeenCalledWith({
        tenantId: TENANT_ID, scope, employeeId: EMPLOYEE_ID,
        tenantDepartmentId: DEPARTMENT_ID, page: 1, pageSize: 20,
      });
    }
  });

  test("rejects missing tenant, permission or scoped identity before querying", async () => {
    const attempts = [
      auth("all", { tenantId: null }),
      auth("all", { permissions: [] }),
      auth("all", { employeeId: null }),
      auth("department", { tenantDepartmentId: null }),
      auth("self", { employeeId: null }),
    ];
    for (const contextAuth of attempts) {
      const context = fixture();
      await expect(context.service.listAssigneeCandidates(contextAuth, {}))
        .rejects.toMatchObject({ statusCode: 403 });
      expect(context.repository.listAssigneeCandidates).not.toHaveBeenCalled();
    }
  });

  test("rejects an invalid exact total with a fixed response error", async () => {
    const context = fixture({ total: -1 });
    await expect(context.service.listAssigneeCandidates(auth("all"), {}))
      .rejects.toMatchObject({ statusCode: 500,
        code: "DOUYIN_LEAD_RESPONSE_INVALID" });
  });

  test("normalizes nullable and long persisted names without dropping candidates", async () => {
    const otherId = "77777777-7777-4777-8777-777777777777";
    const context = fixture({ rows: [
      { id: EMPLOYEE_ID, name: null },
      { id: otherId, name: ` ${"王".repeat(101)} ` },
    ] });
    await expect(context.service.listAssigneeCandidates(auth("all"), {}))
      .resolves.toMatchObject({ list: [
        { id: EMPLOYEE_ID, name: "未命名员工" },
        { id: otherId, name: "王".repeat(100) },
      ] });
  });
});
