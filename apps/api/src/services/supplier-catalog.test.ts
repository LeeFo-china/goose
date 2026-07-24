import { describe, expect, mock, test } from "bun:test";

import type { AuthContext } from "@/services/authorization";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const TENANT_ID = "00000000-0000-4000-8000-000000000101";
const CATEGORY_ID = "00000000-0000-4000-8000-000000000201";
const BRAND_ID = "00000000-0000-4000-8000-000000000301";
const UNIT_ID = "00000000-0000-4000-8000-000000000401";
const USER_ID = "00000000-0000-4000-8000-000000000501";
const EMPLOYEE_ID = "00000000-0000-4000-8000-000000000601";
const NOW = "2026-07-24T00:00:00.000Z";

async function createService(overrides: Record<string, unknown> = {}) {
  const dependencies = createDependencies(overrides);
  const { SupplierCatalogService } = await import("./supplier-catalog");
  return {
    service: new SupplierCatalogService(dependencies as never),
    dependencies,
  };
}

describe("SupplierCatalogService read boundaries", () => {
  test("exposes separate platform reads and allows active or inactive filters", async () => {
    const { service, dependencies } = await createService();
    const context = auth(["platform.catalog.manage"], null, true);

    await service.listPlatformCategories(context, {
      parent_id: null,
      status: "inactive",
      page: 1,
      pageSize: 20,
    });
    await service.listPlatformBrands(context, {
      status: "active",
      page: 1,
      pageSize: 20,
    });
    await service.listPlatformUnits(context, {
      status: "inactive",
      page: 1,
      pageSize: 20,
    });

    expect(dependencies.repository.listCategories).toHaveBeenCalledWith(
      expect.objectContaining({ parent_id: null, status: "inactive" }),
    );
    expect(dependencies.repository.listBrands).toHaveBeenCalledWith(
      expect.objectContaining({ status: "active" }),
    );
    expect(dependencies.repository.listUnits).toHaveBeenCalledWith(
      expect.objectContaining({ status: "inactive" }),
    );
    expect(dependencies.accessPolicy.assertPermission).toHaveBeenCalledTimes(3);
    expect(dependencies.accessPolicy.assertTenantContext).not.toHaveBeenCalled();
  });

  test("tenant reads require tenant context and always force active rows", async () => {
    const { service, dependencies } = await createService();
    const context = auth(["supplier.view"], TENANT_ID, false);

    await service.listTenantCategories(context, {
      parent_id: CATEGORY_ID,
      status: "inactive",
      page: 2,
      pageSize: 20,
    } as never);
    await service.listTenantBrands(context, {
      status: "inactive",
      page: 1,
      pageSize: 20,
    } as never);
    await service.listTenantUnits(context, {
      status: "inactive",
      page: 1,
      pageSize: 20,
    } as never);

    expect(dependencies.repository.listCategories).toHaveBeenCalledWith({
      parent_id: CATEGORY_ID,
      page: 2,
      pageSize: 20,
      status: "active",
    });
    expect(dependencies.repository.listBrands).toHaveBeenCalledWith({
      page: 1,
      pageSize: 20,
      status: "active",
    });
    expect(dependencies.repository.listUnits).toHaveBeenCalledWith({
      page: 1,
      pageSize: 20,
      status: "active",
    });
    expect(dependencies.accessPolicy.assertTenantContext).toHaveBeenCalledTimes(3);
    expect(dependencies.accessPolicy.assertPermission).toHaveBeenCalledWith(
      context,
      "supplier.view",
    );
  });

  test("rejects wrong identity or permission before repository access", async () => {
    const platform = await createService();
    await expect(Promise.resolve().then(() =>
      platform.service.listPlatformBrands(
        auth(["platform.catalog.manage"], TENANT_ID, false),
        { page: 1, pageSize: 20 },
      )
    )).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(platform.dependencies.repository.listBrands).not.toHaveBeenCalled();

    const tenant = await createService();
    await expect(Promise.resolve().then(() =>
      tenant.service.listTenantBrands(
        auth(["supplier.view"], null, false),
        { page: 1, pageSize: 20 },
      )
    )).rejects.toMatchObject({ code: "TENANT_CONTEXT_REQUIRED" });
    expect(tenant.dependencies.repository.listBrands).not.toHaveBeenCalled();

    const permission = await createService();
    await expect(Promise.resolve().then(() =>
      permission.service.listTenantBrands(
        auth([], TENANT_ID, false),
        { page: 1, pageSize: 20 },
      )
    )).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(permission.dependencies.repository.listBrands).not.toHaveBeenCalled();
  });
});

describe("SupplierCatalogService write boundary", () => {
  test("creates every resource with the authenticated platform employee", async () => {
    const { service, dependencies } = await createService();
    const context = auth(["platform.catalog.manage"], null, true);

    await service.createCategory(context, {
      parent_id: null,
      code: "CAT-001",
      name: "主材",
      level: 1,
      status: "active",
      sort_order: 100,
    });
    await service.createBrand(context, {
      code: "BR-001",
      name: "雨虹",
      status: "active",
      sort_order: 100,
    });
    await service.createUnit(context, {
      code: "UNIT-BOX",
      name: "箱",
      symbol: "箱",
      base_unit_id: null,
      conversion_factor: "1",
      status: "active",
      sort_order: 100,
    });

    for (const method of [
      dependencies.repository.createCategory,
      dependencies.repository.createBrand,
      dependencies.repository.createUnit,
    ]) {
      expect(method).toHaveBeenCalledWith(expect.objectContaining({
        created_by_employee_id: EMPLOYEE_ID,
        updated_by_employee_id: EMPLOYEE_ID,
      }));
    }
  });

  test("updates every resource with route id and authenticated employee", async () => {
    const { service, dependencies } = await createService();
    const context = auth(["platform.catalog.manage"], null, true);

    await service.updateCategory(context, CATEGORY_ID, {
      expected_version: 1,
      name: "新主材",
    });
    await service.updateBrand(context, BRAND_ID, {
      expected_version: 1,
      legal_name: null,
    });
    await service.updateUnit(context, UNIT_ID, {
      expected_version: 1,
      name: "整箱",
    });

    expect(dependencies.repository.updateCategory).toHaveBeenCalledWith({
      category_id: CATEGORY_ID,
      expected_version: 1,
      name: "新主材",
      updated_by_employee_id: EMPLOYEE_ID,
    });
    expect(dependencies.repository.updateBrand).toHaveBeenCalledWith({
      brand_id: BRAND_ID,
      expected_version: 1,
      legal_name: null,
      updated_by_employee_id: EMPLOYEE_ID,
    });
    expect(dependencies.repository.updateUnit).toHaveBeenCalledWith({
      unit_id: UNIT_ID,
      expected_version: 1,
      name: "整箱",
      updated_by_employee_id: EMPLOYEE_ID,
    });
  });

  test("requires platform.catalog.manage and a platform employee for writes", async () => {
    const missingPermission = await createService();
    await expect(Promise.resolve().then(() =>
      missingPermission.service.createBrand(
        auth([], null, true),
        { code: "BR-001", name: "雨虹", status: "active", sort_order: 100 },
      )
    )).rejects.toMatchObject({ code: "FORBIDDEN" });

    const missingEmployee = await createService();
    await expect(Promise.resolve().then(() =>
      missingEmployee.service.createBrand(
        { ...auth(["platform.catalog.manage"], null, true), employeeId: null },
        { code: "BR-001", name: "雨虹", status: "active", sort_order: 100 },
      )
    )).rejects.toMatchObject({ code: "FORBIDDEN" });

    expect(missingPermission.dependencies.repository.createBrand)
      .not.toHaveBeenCalled();
    expect(missingEmployee.dependencies.repository.createBrand)
      .not.toHaveBeenCalled();
  });
});

describe("SupplierCatalogService database conflict mapping", () => {
  test("maps unique and hierarchy database violations to one stable domain error", async () => {
    const violations = [
      { code: "23505", message: "duplicate key" },
      { message: "目录分类层级不能形成环" },
      { message: "存在启用的子分类，当前目录分类不能停用" },
      { message: "启用的目录分类必须属于启用的父分类" },
      { message: "派生单位只能引用启用的基准单位" },
      { message: "有派生单位引用的基准单位不能停用" },
    ];

    for (const violation of violations) {
      const { service } = await createService({
        createCategory: mock(async () => {
          throw {
            code: "DB_ERROR",
            details: violation,
          };
        }),
      });
      await expect(service.createCategory(
        auth(["platform.catalog.manage"], null, true),
        {
          parent_id: null,
          code: "CAT-001",
          name: "主材",
          level: 1,
          status: "active",
          sort_order: 100,
        },
      )).rejects.toMatchObject({
        statusCode: 409,
        code: "SUPPLIER_CATALOG_CONFLICT",
      });
    }
  });

  test("does not hide unrelated database failures", async () => {
    const original = {
      code: "DB_ERROR",
      details: { code: "42P01", message: "missing relation" },
    };
    const { service } = await createService({
      createBrand: mock(async () => {
        throw original;
      }),
    });

    await expect(service.createBrand(
      auth(["platform.catalog.manage"], null, true),
      { code: "BR-001", name: "雨虹", status: "active", sort_order: 100 },
    )).rejects.toBe(original);
  });
});

function auth(
  permissions: string[],
  tenantId: string | null,
  isPlatformAdmin: boolean,
): AuthContext {
  return {
    authUserId: USER_ID,
    employeeId: EMPLOYEE_ID,
    tenantId,
    tenantName: null,
    tenantSlug: null,
    tenantStatus: null,
    isPlatformAdmin,
    employeeName: "目录管理员",
    employeeStatus: "active",
    departmentId: null,
    tenantDepartmentId: null,
    departmentCode: null,
    departmentName: null,
    postId: null,
    postName: null,
    avatar: null,
    roleCodes: [],
    roles: [],
    permissions: permissions.map((code) => ({ code, scope: "all" })),
  };
}

function createDependencies(overrides: Record<string, unknown>) {
  const repository = {
    listCategories: mock(async ({ page, pageSize }) =>
      pageOf([category], page, pageSize)),
    listBrands: mock(async ({ page, pageSize }) =>
      pageOf([brand], page, pageSize)),
    listUnits: mock(async ({ page, pageSize }) =>
      pageOf([unit], page, pageSize)),
    createCategory: mock(async (input) => ({ ...category, ...input })),
    updateCategory: mock(async (input) => ({
      ...category,
      ...input,
      version: 2,
    })),
    createBrand: mock(async (input) => ({ ...brand, ...input })),
    updateBrand: mock(async (input) => ({ ...brand, ...input, version: 2 })),
    createUnit: mock(async (input) => ({ ...unit, ...input })),
    updateUnit: mock(async (input) => ({ ...unit, ...input, version: 2 })),
    ...overrides,
  };
  return {
    repository,
    accessPolicy: {
      assertTenantContext: mock((context: AuthContext) => {
        if (!context.tenantId) {
          throw Object.assign(new Error("tenant required"), {
            statusCode: 403,
            code: "TENANT_CONTEXT_REQUIRED",
          });
        }
        return context.tenantId;
      }),
      assertPermission: mock((context: AuthContext, permission: string) => {
        if (!context.permissions.some((item) => item.code === permission)) {
          throw Object.assign(new Error("forbidden"), {
            statusCode: 403,
            code: "FORBIDDEN",
          });
        }
        return "all";
      }),
    },
  };
}

function pageOf<T>(list: T[], page: number, pageSize: number) {
  return {
    list,
    pagination: {
      page,
      pageSize,
      total: list.length,
      totalPages: list.length ? 1 : 0,
    },
  };
}

const base = {
  status: "active",
  sort_order: 100,
  version: 1,
  created_at: NOW,
  updated_at: NOW,
};
const category = {
  ...base,
  id: CATEGORY_ID,
  parent_id: null,
  code: "CAT-001",
  name: "主材",
  level: 1,
};
const brand = {
  ...base,
  id: BRAND_ID,
  code: "BR-001",
  name: "雨虹",
  legal_name: null,
  logo_file_id: null,
};
const unit = {
  ...base,
  id: UNIT_ID,
  code: "UNIT-BOX",
  name: "箱",
  symbol: "箱",
  base_unit_id: null,
  conversion_factor: "1.000000",
};
