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
const ACTOR_ID = "55555555-5555-4555-8555-555555555555";
const INACTIVE_ID = "77777777-7777-4777-8777-777777777777";
const SYSTEM_ADMIN_ID = "88888888-8888-4888-8888-888888888888";

function auth(permissions: string[] = ["douyin_lead.read"]): AuthContext {
  return { tenantId: TENANT_ID, employeeId: ACTOR_ID,
    permissions: permissions.map((code) => ({ code, scope: "department" }))
  } as AuthContext;
}

function fixture(input: {
  visibleIds?: string[] | null;
  total?: number;
  rows?: readonly { id: string; name: string | null }[];
  scope?: "all" | "department";
} = {}) {
  const repository = {
    listAssigneeFilterOptions: mock(async () => ({
      rows: input.rows ?? [{ id: INACTIVE_ID, name: "历史顾问" }],
      total: input.total ?? 1,
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
      if (!context.permissions.some((item) => item.code === permission)) {
        throw Object.assign(new Error("forbidden"), { statusCode: 403 });
      }
      return input.scope ?? "department";
    }),
    getVisibleCustomerOwnerIds: mock(async () => input.visibleIds === undefined
      ? [INACTIVE_ID, SYSTEM_ADMIN_ID] : input.visibleIds),
  };
  return { service: new Service({ repository, accessPolicy,
    phonePrivacy: {} } as never), repository, accessPolicy };
}

describe("TenantDouyinLeadsService assignee filter options", () => {
  test("uses only read permission and exact visible owner ids", async () => {
    const context = fixture();
    await expect(context.service.listAssigneeFilterOptions(auth(), {
      page: 1, pageSize: 100, keyword: " 历史顾问 ",
      includeEmployeeId: INACTIVE_ID,
    })).resolves.toEqual({
      list: [{ id: INACTIVE_ID, name: "历史顾问" }],
      pagination: { page: 1, pageSize: 100, total: 1, totalPages: 1 },
    });
    expect(context.accessPolicy.assertPermission).toHaveBeenCalledWith(
      expect.anything(), "douyin_lead.read",
    );
    expect(context.accessPolicy.getVisibleCustomerOwnerIds).toHaveBeenCalledWith(
      expect.anything(), "douyin_lead.read",
    );
    expect(context.repository.listAssigneeFilterOptions).toHaveBeenCalledWith({
      tenantId: TENANT_ID,
      visibleEmployeeIds: [INACTIVE_ID, SYSTEM_ADMIN_ID],
      page: 1, pageSize: 100, keyword: "历史顾问",
      includeEmployeeId: INACTIVE_ID,
    });
  });

  test("keeps all-scope null visibility and inactive historical rows", async () => {
    const context = fixture({ visibleIds: null, scope: "all" });
    await context.service.listAssigneeFilterOptions(auth(), {
      includeEmployeeId: ACTOR_ID,
    });
    expect(context.repository.listAssigneeFilterOptions).toHaveBeenCalledWith({
      tenantId: TENANT_ID, visibleEmployeeIds: null, page: 1, pageSize: 20,
      includeEmployeeId: ACTOR_ID,
    });
  });

  test("does not disclose an unauthorized selected employee", async () => {
    const context = fixture();
    await context.service.listAssigneeFilterOptions(auth(), {
      includeEmployeeId: ACTOR_ID,
    });
    expect(context.repository.listAssigneeFilterOptions).toHaveBeenCalledWith({
      tenantId: TENANT_ID,
      visibleEmployeeIds: [INACTIVE_ID, SYSTEM_ADMIN_ID],
      page: 1, pageSize: 20,
    });
  });

  test("returns an empty page without querying for an empty visible id set", async () => {
    const context = fixture({ visibleIds: [] });
    await expect(context.service.listAssigneeFilterOptions(auth(), {
      page: 2, pageSize: 20,
    })).resolves.toEqual({ list: [], pagination: {
      page: 2, pageSize: 20, total: 0, totalPages: 0,
    } });
    expect(context.repository.listAssigneeFilterOptions).not.toHaveBeenCalled();
  });

  test("rejects missing read permission and invalid exact totals", async () => {
    const denied = fixture();
    await expect(denied.service.listAssigneeFilterOptions(auth([]), {}))
      .rejects.toMatchObject({ statusCode: 403 });
    expect(denied.repository.listAssigneeFilterOptions).not.toHaveBeenCalled();

    const invalid = fixture({ total: -1 });
    await expect(invalid.service.listAssigneeFilterOptions(auth(), {}))
      .rejects.toMatchObject({ statusCode: 500,
        code: "DOUYIN_LEAD_RESPONSE_INVALID" });

    const outOfScope = fixture({ rows: [{ id: ACTOR_ID, name: "越权员工" }] });
    await expect(outOfScope.service.listAssigneeFilterOptions(auth(), {}))
      .rejects.toMatchObject({ statusCode: 500,
        code: "DOUYIN_LEAD_RESPONSE_INVALID" });
  });
});
