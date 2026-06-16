import { describe, expect, mock, test } from "bun:test";
import type { AuthContext } from "@/services/authorization";

const listLedger = mock(async () => ({
  list: [],
  pagination: {
    page: 1,
    pageSize: 20,
    total: 0,
    totalPages: 0,
  },
}));

mock.module("@/repositories/finance-ledger", () => ({
  financeLedgerRepository: {
    list: listLedger,
    createIdempotent: mock(async (input: Record<string, unknown>) => input),
  },
}));

mock.module("@/services/access-policy", () => ({
  accessPolicyService: {
    assertTenantContext: mock((authContext: AuthContext) => {
      if (!authContext.tenantId) {
        throw new Error("missing tenant");
      }
      return authContext.tenantId;
    }),
  },
}));

const baseAuthContext = {
  authUserId: "auth-1",
  employeeId: "employee-1",
  tenantId: "tenant-1",
  tenantName: null,
  tenantSlug: null,
  tenantStatus: "active",
  isPlatformAdmin: false,
  employeeName: "财务",
  employeeStatus: "active",
  departmentId: null,
  tenantDepartmentId: null,
  departmentCode: "FINANCE",
  departmentName: "财务部",
  postId: null,
  postName: null,
  avatar: null,
  roleCodes: [],
  roles: [],
} satisfies Omit<AuthContext, "permissions">;

function authContextWithPermissions(
  permissions: AuthContext["permissions"],
): AuthContext {
  return {
    ...baseAuthContext,
    permissions,
  };
}

describe("financeLedgerService", () => {
  test("lists ledger for finance module viewers", async () => {
    const { financeLedgerService } = await import("./finance-ledger");

    await financeLedgerService.listLedger(
      authContextWithPermissions([{ code: "finance.view", scope: "all" }]),
      { page: 1, pageSize: 20 },
    );

    expect(listLedger).toHaveBeenCalledWith("tenant-1", {
      page: 1,
      pageSize: 20,
    });
  });

  test("rejects users without finance ledger permission", async () => {
    const { financeLedgerService } = await import("./finance-ledger");

    await expect(
      financeLedgerService.listLedger(
        authContextWithPermissions([{ code: "project.read", scope: "all" }]),
        { page: 1, pageSize: 20 },
      ),
    ).rejects.toMatchObject({
      statusCode: 403,
      code: "FORBIDDEN",
    });
  });
});
