import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { AuthContext } from "@/services/authorization";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const listLedger = mock(async () => ({
  list: [],
  pagination: {
    page: 1,
    pageSize: 20,
    total: 0,
    totalPages: 0,
  },
}));
const findActiveCostCategory = mock(async () => ({
  id: "category-2",
  tenant_id: "tenant-1",
  status: "active",
}));
const updateLedgerCostCategory = mock(async () => ({
  id: "ledger-1",
  tenant_id: "tenant-1",
  cost_category_id: "category-2",
  cost_category_updated_by: "employee-1",
  cost_category_updated_at: "2026-06-24T10:00:00.000Z",
}));

mock.module("@/repositories/finance-ledger", () => ({
  financeLedgerRepository: {
    list: listLedger,
    createIdempotent: mock(async (input: Record<string, unknown>) => input),
    findActiveCostCategory,
    updateCostCategory: updateLedgerCostCategory,
  },
}));

mock.module("@/services/access-policy", () => ({
  accessPolicyService: {
    assertTenantContext: mock((authContext: AuthContext) => authContext.tenantId),
    hasPermission: mock((authContext: AuthContext, permissionCode: string) =>
      authContext.permissions.some((permission) => permission.code === permissionCode)
    ),
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
  beforeEach(() => {
    listLedger.mockClear();
    findActiveCostCategory.mockClear();
    updateLedgerCostCategory.mockClear();
  });

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

  test("updates ledger cost category with audit fields", async () => {
    const { financeLedgerService } = await import("./finance-ledger");

    const result = await financeLedgerService.updateCostCategory(
      authContextWithPermissions([
        { code: "finance.cost-allocation.manage", scope: "all" },
      ]),
      "ledger-1",
      { cost_category_id: "category-2" },
    );

    expect(findActiveCostCategory).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      costCategoryId: "category-2",
    });
    expect(updateLedgerCostCategory).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      ledgerId: "ledger-1",
      costCategoryId: "category-2",
      employeeId: "employee-1",
    });
    expect(result).toMatchObject({
      cost_category_id: "category-2",
      cost_category_updated_by: "employee-1",
    });
  });

  test("rejects ledger cost category update without allocation permission", async () => {
    const { financeLedgerService } = await import("./finance-ledger");

    await expect(
      financeLedgerService.updateCostCategory(
        authContextWithPermissions([{ code: "finance.ledger.view", scope: "all" }]),
        "ledger-1",
        { cost_category_id: "category-2" },
      ),
    ).rejects.toMatchObject({
      statusCode: 403,
      code: "FORBIDDEN",
    });
    expect(updateLedgerCostCategory).not.toHaveBeenCalled();
  });
});
