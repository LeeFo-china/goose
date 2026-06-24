import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { AuthContext } from "@/services/authorization";

const listCostCategories = mock(async () => ({
  list: [
    {
      id: "category-1",
      tenant_id: "tenant-1",
      code: "labor",
      name: "人工",
      status: "active",
      sort_order: 10,
      is_system: true,
      created_at: "2026-06-24T10:00:00.000Z",
      updated_at: "2026-06-24T10:00:00.000Z",
    },
  ],
  pagination: {
    page: 1,
    pageSize: 20,
    total: 1,
    totalPages: 1,
  },
}));
const createCostCategory = mock(async () => ({
  id: "category-2",
  tenant_id: "tenant-1",
  code: "cleaning",
  name: "保洁",
  status: "active",
  sort_order: 90,
  is_system: false,
  created_at: "2026-06-24T10:10:00.000Z",
  updated_at: "2026-06-24T10:10:00.000Z",
}));
const updateCostCategory = mock(async () => ({
  id: "category-2",
  tenant_id: "tenant-1",
  code: "cleaning",
  name: "现场保洁",
  status: "inactive",
  sort_order: 95,
  is_system: false,
  created_at: "2026-06-24T10:10:00.000Z",
  updated_at: "2026-06-24T10:20:00.000Z",
}));

mock.module("@/repositories/finance-cost-categories", () => ({
  financeCostCategoryRepository: {
    list: listCostCategories,
    create: createCostCategory,
    update: updateCostCategory,
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

describe("financeCostCategoryService", () => {
  beforeEach(() => {
    listCostCategories.mockClear();
    createCostCategory.mockClear();
    updateCostCategory.mockClear();
  });

  test("lists active cost categories for finance viewers", async () => {
    const { financeCostCategoryService } =
      await import("./finance-cost-categories");

    const result = await financeCostCategoryService.list(
      authContextWithPermissions([{ code: "finance.view", scope: "all" }]),
      { page: 1, pageSize: 20, status: "active" },
    );

    expect(listCostCategories).toHaveBeenCalledWith("tenant-1", {
      page: 1,
      pageSize: 20,
      status: "active",
    });
    expect(result.list[0]).toMatchObject({
      code: "labor",
      name: "人工",
      status: "active",
    });
    expect(result.pagination.total).toBe(1);
  });

  test("creates custom cost categories for category managers", async () => {
    const { financeCostCategoryService } =
      await import("./finance-cost-categories");

    const result = await financeCostCategoryService.create(
      authContextWithPermissions([
        { code: "finance.cost-category.manage", scope: "all" },
      ]),
      {
        code: "cleaning",
        name: "保洁",
        sort_order: 90,
      },
    );

    expect(createCostCategory).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      employeeId: "employee-1",
      input: {
        code: "cleaning",
        name: "保洁",
        sort_order: 90,
      },
    });
    expect(result).toMatchObject({
      code: "cleaning",
      name: "保洁",
      status: "active",
    });
  });

  test("updates cost categories for category managers", async () => {
    const { financeCostCategoryService } =
      await import("./finance-cost-categories");

    const result = await financeCostCategoryService.update(
      authContextWithPermissions([
        { code: "finance.cost-category.manage", scope: "all" },
      ]),
      "category-2",
      {
        name: "现场保洁",
        status: "inactive",
        sort_order: 95,
      },
    );

    expect(updateCostCategory).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      employeeId: "employee-1",
      id: "category-2",
      input: {
        name: "现场保洁",
        status: "inactive",
        sort_order: 95,
      },
    });
    expect(result).toMatchObject({
      name: "现场保洁",
      status: "inactive",
      sort_order: 95,
    });
  });

  test("rejects category creation without manage permission", async () => {
    const { financeCostCategoryService } =
      await import("./finance-cost-categories");

    await expect(
      financeCostCategoryService.create(
        authContextWithPermissions([
          { code: "finance.cost-category.view", scope: "all" },
        ]),
        {
          code: "cleaning",
          name: "保洁",
          sort_order: 90,
        },
      ),
    ).rejects.toMatchObject({
      statusCode: 403,
      code: "FORBIDDEN",
    });
    expect(createCostCategory).not.toHaveBeenCalled();
  });
});
