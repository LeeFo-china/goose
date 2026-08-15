import { describe, expect, mock, test } from "bun:test";

import {
  auth,
  brand,
  BRAND_ID,
  category,
  CATEGORY_ID,
  createDependencies,
  EMPLOYEE_ID,
  NOW,
  pageOf,
  TENANT_ID,
  unit,
  UNIT_ID,
  USER_ID,
} from "./supplier-catalog-test-support";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

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
      tenant_id: TENANT_ID,
    });
    expect(dependencies.repository.listBrands).toHaveBeenCalledWith({
      page: 1,
      pageSize: 20,
      status: "active",
      tenant_id: TENANT_ID,
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
    }, "category-create");
    await service.createBrand(context, {
      code: "BR-001",
      name: "雨虹",
      status: "active",
      sort_order: 100,
    }, "brand-create");
    await service.createUnit(context, {
      code: "UNIT-BOX",
      name: "箱",
      symbol: "箱",
      base_unit_id: null,
      conversion_factor: "1",
      status: "active",
      sort_order: 100,
    }, "unit-create");

    for (const method of [
      dependencies.repository.createCategory,
      dependencies.repository.createBrand,
      dependencies.repository.createUnit,
    ]) {
      expect(method).toHaveBeenCalledWith(expect.objectContaining({
        actor_user_id: USER_ID,
        actor_employee_id: EMPLOYEE_ID,
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
        "brand-create",
      )
    )).rejects.toMatchObject({ code: "FORBIDDEN" });

    const missingEmployee = await createService();
    await expect(Promise.resolve().then(() =>
      missingEmployee.service.createBrand(
        { ...auth(["platform.catalog.manage"], null, true), employeeId: null },
        { code: "BR-001", name: "雨虹", status: "active", sort_order: 100 },
        "brand-create",
      )
    )).rejects.toMatchObject({ code: "FORBIDDEN" });

    expect(missingPermission.dependencies.repository.createBrand)
      .not.toHaveBeenCalled();
    expect(missingEmployee.dependencies.repository.createBrand)
      .not.toHaveBeenCalled();
  });
});

describe("SupplierCatalogService tenant catalog writes", () => {
  test("requires supplier.catalog.manage and private_catalog_writes_enabled", async () => {
    const missingPermission = await createService({
      getTenantSupplierSettings: mock(async () => ({
        private_catalog_writes_enabled: true,
      })),
    });
    await expect(Promise.resolve().then(() =>
      missingPermission.service.createTenantCategory(
        auth([], TENANT_ID, false),
        {
          parent_id: null,
          code: "T-CAT-001",
          name: "主材",
          mapped_platform_category_id: null,
        },
        "tenant-category-create",
      )
    )).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(missingPermission.dependencies.repository.createTenantCategory)
      .not.toHaveBeenCalled();

    const disabledFlag = await createService({
      getTenantSupplierSettings: mock(async () => ({
        private_catalog_writes_enabled: false,
      })),
    });
    await expect(Promise.resolve().then(() =>
      disabledFlag.service.createTenantCategory(
        auth(["supplier.catalog.manage"], TENANT_ID, false),
        {
          parent_id: null,
          code: "T-CAT-001",
          name: "主材",
          mapped_platform_category_id: null,
        },
        "tenant-category-create",
      )
    )).rejects.toMatchObject({ code: "SUPPLIER_PRIVATE_WRITES_DISABLED" });
    expect(disabledFlag.dependencies.repository.createTenantCategory)
      .not.toHaveBeenCalled();
  });

  test("creates tenant categories and brands with the authenticated employee", async () => {
    const { service, dependencies } = await createService({
      getTenantSupplierSettings: mock(async () => ({
        private_catalog_writes_enabled: true,
      })),
    });
    const context = auth(["supplier.catalog.manage"], TENANT_ID, false);

    await service.createTenantCategory(context, {
      parent_id: null,
      code: "T-CAT-001",
      name: "主材",
      mapped_platform_category_id: null,
    }, "tenant-category-create");
    await service.createTenantBrand(context, {
      code: "T-BR-001",
      name: "私有品牌",
      mapped_platform_brand_id: null,
    }, "tenant-brand-create");

    expect(dependencies.repository.createTenantCategory).toHaveBeenCalledWith(
      expect.objectContaining({
        tenant_id: TENANT_ID,
        actor_user_id: USER_ID,
        actor_employee_id: EMPLOYEE_ID,
        idempotency_key: "tenant-category-create",
      }),
    );
    expect(dependencies.repository.createTenantBrand).toHaveBeenCalledWith(
      expect.objectContaining({
        tenant_id: TENANT_ID,
        actor_employee_id: EMPLOYEE_ID,
      }),
    );
  });

  test("rejects updating platform-owned records as shared read-only", async () => {
    const { service, dependencies } = await createService({
      getTenantSupplierSettings: mock(async () => ({
        private_catalog_writes_enabled: true,
      })),
      findCategoryOwnership: mock(async () => ({
        ownershipScope: "platform",
        ownerTenantId: null,
      })),
    });

    await expect(Promise.resolve().then(() =>
      service.updateTenantCategory(
        auth(["supplier.catalog.manage"], TENANT_ID, false),
        CATEGORY_ID,
        { expected_version: 1, name: "改名" },
      )
    )).rejects.toMatchObject({ code: "SHARED_RESOURCE_READ_ONLY" });
    expect(dependencies.repository.updateTenantCategory)
      .not.toHaveBeenCalled();
  });

  test("updates tenant-owned categories with expected_version", async () => {
    const { service, dependencies } = await createService({
      getTenantSupplierSettings: mock(async () => ({
        private_catalog_writes_enabled: true,
      })),
      findCategoryOwnership: mock(async () => ({
        ownershipScope: "tenant",
        ownerTenantId: TENANT_ID,
      })),
    });

    await service.updateTenantCategory(
      auth(["supplier.catalog.manage"], TENANT_ID, false),
      CATEGORY_ID,
      { expected_version: 3, name: "改名" },
    );

    expect(dependencies.repository.updateTenantCategory).toHaveBeenCalledWith(
      expect.objectContaining({
        category_id: CATEGORY_ID,
        tenant_id: TENANT_ID,
        expected_version: 3,
        name: "改名",
        actor_employee_id: EMPLOYEE_ID,
      }),
    );
  });
});

describe("SupplierCatalogService database conflict mapping", () => {
  test("maps create idempotency database conflicts without hiding others", async () => {
    let categoryCalls = 0;
    const idempotencyConflict = {
      code: "DB_ERROR",
      details: {
        code: "P0001",
        message: "SUPPLIER_IDEMPOTENCY_CONFLICT",
      },
    };
    const { service } = await createService({
      createCategory: mock(async () => {
        categoryCalls += 1;
        if (categoryCalls === 1) return { id: CATEGORY_ID };
        throw idempotencyConflict;
      }),
      createBrand: mock(async () => {
        throw idempotencyConflict;
      }),
    });
    const context = auth(["platform.catalog.manage"], null, true);
    const createCategory = (name: string) => service.createCategory(
      context,
      {
        parent_id: null,
        code: "CAT-001",
        name,
        level: 1,
        status: "active",
        sort_order: 100,
      },
      "catalog-conflict-1",
    );

    await createCategory("主材");
    await expect(createCategory("辅材")).rejects.toMatchObject({
      statusCode: 409,
      code: "SUPPLIER_IDEMPOTENCY_CONFLICT",
    });
    await expect(service.createBrand(
      context,
      {
        code: "BR-001",
        name: "雨虹",
        status: "active",
        sort_order: 100,
      },
      "catalog-conflict-1",
    )).rejects.toMatchObject({
      statusCode: 409,
      code: "SUPPLIER_IDEMPOTENCY_CONFLICT",
    });
  });

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
        }, "category-create",
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
      "brand-create",
    )).rejects.toBe(original);
  });
});
