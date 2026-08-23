import { describe, expect, mock, test } from "bun:test";
import type { AuthContext } from "@/services/authorization";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const TENANT_ID = "00000000-0000-4000-8000-000000000101";
const USER_ID = "00000000-0000-4000-8000-000000000102";
const EMPLOYEE_ID = "00000000-0000-4000-8000-000000000103";
const CATEGORY_ID = "00000000-0000-4000-8000-000000000201";
const BRAND_ID = "00000000-0000-4000-8000-000000000401";

const auth: AuthContext = {
  tenantId: TENANT_ID,
  tenantName: "测试租户",
  tenantSlug: "test-tenant",
  tenantStatus: "active",
  authUserId: USER_ID,
  employeeId: EMPLOYEE_ID,
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
  isPlatformAdmin: false,
  isPlatformStaff: false,
  permissions: [
    { code: "supplier.view", scope: "all" },
    { code: "supplier.catalog.manage", scope: "all" },
  ],
};

function authWithPermissions(...codes: string[]): AuthContext {
  return {
    ...auth,
    permissions: codes.map((code) => ({ code, scope: "all" as const })),
  };
}

const enabledSettings = {
  module_enabled: true,
  ownership_reads_enabled: true,
  private_supplier_writes_enabled: true,
  private_catalog_writes_enabled: true,
  procurement_snapshot_v1_enabled: false,
};

async function setup(settings = enabledSettings) {
  const { SupplierCatalogService } = await import("./supplier-catalog");
  const repository = {
    findCatalogUpdateReplay: mock(async () => null),
    listCategories: mock(async () => ({ list: [], pagination: {} })),
    listBrands: mock(async () => ({ list: [], pagination: {} })),
    listUnits: mock(async () => ({ list: [], pagination: {} })),
    listSpecDefinitions: mock(async () => ({ list: [], pagination: {} })),
    createTenantCategory: mock(async (input: unknown) => input),
    updateTenantCategory: mock(async (input: unknown) => input),
    createTenantBrand: mock(async (input: unknown) => input),
    updateTenantBrand: mock(async (input: unknown) => input),
    listUnitSuggestions: mock(async (input: unknown) => input),
    findVisibleCategory: mock(async () => ({
      id: "00000000-0000-4000-8000-000000000201",
      ownership_scope: "tenant",
      owner_tenant_id: TENANT_ID,
      parent_id: null,
      code: "CAT-1",
      name: "分类",
      status: "active",
      sort_order: 100,
      version: 1,
    })),
    findVisibleBrand: mock(async () => ({
      id: BRAND_ID,
      ownership_scope: "tenant",
      owner_tenant_id: TENANT_ID,
      code: "TB-OLD",
      name: "旧品牌",
      legal_name: "旧品牌法定名称",
      logo_file_id: null,
      status: "active",
      sort_order: 100,
      mapped_platform_brand_id: "00000000-0000-4000-8000-000000000402",
      version: 1,
    })),
  };
  const settingsRepository = {
    getSettings: mock(async () => settings),
  };
  const accessPolicy = {
    assertTenantContext: mock(() => TENANT_ID),
    hasPermission: mock((context: typeof auth, permission: string) =>
      context.permissions.some(({ code }) => code === permission)
    ),
    assertPermission: mock((context: typeof auth, permission: string) => {
      if (context.permissions.some(({ code }) => code === permission)) {
        return "all";
      }
      throw Object.assign(new Error("Forbidden"), {
        statusCode: 403,
        code: "FORBIDDEN",
      });
    }),
  };
  return {
    repository,
    settingsRepository,
    service: new SupplierCatalogService({
      repository: repository as never,
      settingsRepository: settingsRepository as never,
      accessPolicy: accessPolicy as never,
      commandIdFactory: () => "00000000-0000-4000-8000-000000000301",
    } as never),
  };
}

describe("SupplierCatalogService tenant rollout and ownership", () => {
  test("allows every tenant catalog read with manage permission only", async () => {
    const { service } = await setup();
    const manageOnly = authWithPermissions("supplier.catalog.manage");
    const query = { page: 1, pageSize: 20 };

    await service.listTenantCategories(manageOnly, query);
    await service.listTenantBrands(manageOnly, query);
    await service.listTenantUnits(manageOnly, query);
    await service.listTenantSpecDefinitions(manageOnly, CATEGORY_ID, query);
    await service.listTenantUnitSuggestions(manageOnly, query);
  });

  test("denies every tenant catalog read with supplier view permission only", async () => {
    const { service, repository } = await setup();
    const viewOnly = authWithPermissions("supplier.view");
    const query = { page: 1, pageSize: 20 };

    for (const operation of [
      () => service.listTenantCategories(viewOnly, query),
      () => service.listTenantBrands(viewOnly, query),
      () => service.listTenantUnits(viewOnly, query),
      () => service.listTenantSpecDefinitions(viewOnly, CATEGORY_ID, query),
      () => service.listTenantUnitSuggestions(viewOnly, query),
    ]) {
      await expect(operation()).rejects.toMatchObject({
        statusCode: 403,
        code: "FORBIDDEN",
      });
    }
    expect(repository.listCategories).not.toHaveBeenCalled();
    expect(repository.listBrands).not.toHaveBeenCalled();
    expect(repository.listUnits).not.toHaveBeenCalled();
    expect(repository.listSpecDefinitions).not.toHaveBeenCalled();
    expect(repository.listUnitSuggestions).not.toHaveBeenCalled();
  });

  test("denies tenant catalog reads without management permission", async () => {
    const { service, repository } = await setup();

    await expect(service.listTenantCategories(
      authWithPermissions(),
      { page: 1, pageSize: 20 },
    )).rejects.toMatchObject({ statusCode: 403, code: "FORBIDDEN" });
    expect(repository.listCategories).not.toHaveBeenCalled();
  });

  test("keeps tenant catalog writes restricted to manage permission", async () => {
    const { service, repository } = await setup();

    await expect(service.createTenantCategory(
      authWithPermissions("supplier.view"),
      {
        parent_id: null,
        code: "CAT-VIEW",
        name: "只读账号分类",
        status: "active",
        sort_order: 100,
        mapped_platform_category_id: null,
      },
      "category-view-only",
    )).rejects.toMatchObject({ statusCode: 403, code: "FORBIDDEN" });
    expect(repository.createTenantCategory).not.toHaveBeenCalled();
  });

  test("blocks tenant reads when ownership reads are disabled", async () => {
    const { service, repository } = await setup({
      ...enabledSettings,
      ownership_reads_enabled: false,
      private_catalog_writes_enabled: false,
    });

    await expect(service.listTenantCategories(auth, {
      page: 1,
      pageSize: 20,
    })).rejects.toMatchObject({
      statusCode: 403,
      code: "SUPPLIER_OWNERSHIP_READS_DISABLED",
    });
    expect(repository.listCategories).not.toHaveBeenCalled();
  });

  test("preserves inactive status for tenant-owned category brand and spec reads", async () => {
    const { service, repository } = await setup();
    const query = { status: "inactive" as const, page: 2, pageSize: 10 };

    await service.listTenantCategories(auth, query);
    await service.listTenantBrands(auth, query);
    await service.listTenantSpecDefinitions(auth, CATEGORY_ID, query);

    expect(repository.listCategories).toHaveBeenCalledWith(
      query,
      { kind: "tenant", tenantId: TENANT_ID },
    );
    expect(repository.listBrands).toHaveBeenCalledWith(
      query,
      { kind: "tenant", tenantId: TENANT_ID },
    );
    expect(repository.listSpecDefinitions).toHaveBeenCalledWith(
      CATEGORY_ID,
      query,
      { kind: "tenant", tenantId: TENANT_ID },
    );
  });

  test("uses server-side platform-only visibility for mapping option pages", async () => {
    const { service, repository } = await setup();

    await service.listTenantCategories(auth, {
      page: 2,
      pageSize: 20,
      status: "inactive",
      scope: "platform",
    } as never);
    await service.listTenantBrands(auth, {
      page: 3,
      pageSize: 20,
      status: "inactive",
      scope: "platform",
    } as never);

    expect(repository.listCategories).toHaveBeenCalledWith(
      { page: 2, pageSize: 20, status: "active" },
      { kind: "platform" },
    );
    expect(repository.listBrands).toHaveBeenCalledWith(
      { page: 3, pageSize: 20, status: "active" },
      { kind: "platform" },
    );
  });

  test("keeps tenant unit reads active-only", async () => {
    const { service, repository } = await setup();

    await service.listTenantUnits(auth, {
      status: "inactive",
      page: 1,
      pageSize: 20,
    });

    expect(repository.listUnits).toHaveBeenCalledWith({
      status: "active",
      page: 1,
      pageSize: 20,
    });
  });

  test("injects authenticated tenant ownership into tenant category creates", async () => {
    const { service, repository } = await setup();
    const create = (service as unknown as {
      createTenantCategory(
        auth: unknown,
        input: Record<string, unknown>,
        key: string,
      ): Promise<unknown>;
    }).createTenantCategory.bind(service);

    await create(auth, { code: "CAT-1", name: "分类" }, "category-create-1");

    expect(repository.createTenantCategory).toHaveBeenCalledWith(
      expect.objectContaining({
        tenant_id: TENANT_ID,
        actor_user_id: USER_ID,
        actor_employee_id: EMPLOYEE_ID,
        idempotency_key: "category-create-1",
      }),
    );
    expect(repository.createTenantCategory.mock.calls[0]?.[0])
      .not.toHaveProperty("ownership_scope");
    expect(repository.createTenantCategory.mock.calls[0]?.[0])
      .not.toHaveProperty("owner_tenant_id");
  });

  test("generates tenant category code sort and empty mapping for simplified creates", async () => {
    const { service, repository } = await setup();

    await service.createTenantCategory(
      auth,
      { parent_id: null, name: "系统维护字段分类", status: "active" },
      "category-create-system-fields",
    );

    expect(repository.createTenantCategory).toHaveBeenCalledWith(
      expect.objectContaining({
        category_id: "00000000-0000-4000-8000-000000000301",
        parent_id: null,
        code: "TC-00000000000040008000000000000301",
        name: "系统维护字段分类",
        status: "active",
        sort_order: 100,
        mapped_platform_category_id: null,
      }),
    );
  });

  test("pins tenant categories by moving sort ahead of visible siblings", async () => {
    const { service, repository } = await setup();
    repository.findVisibleCategory = mock(async () => ({
      id: CATEGORY_ID,
      ownership_scope: "tenant",
      owner_tenant_id: TENANT_ID,
      parent_id: null,
      code: "TC-OLD",
      name: "待置顶分类",
      status: "active",
      sort_order: 100,
      mapped_platform_category_id: null,
      version: 3,
    })) as never;
    repository.listCategories = mock(async () => ({
      list: [
        { id: CATEGORY_ID, sort_order: 100 },
        { id: "00000000-0000-4000-8000-000000000202", sort_order: 20 },
      ],
      pagination: { page: 1, pageSize: 100, total: 2, totalPages: 1 },
    })) as never;

    await (service as unknown as {
      pinTenantCategory(
        auth: unknown,
        id: string,
        input: { expected_version: number },
        key: string,
      ): Promise<unknown>;
    }).pinTenantCategory(
      auth,
      CATEGORY_ID,
      { expected_version: 3 },
      "category-pin-1",
    );

    expect(repository.listCategories).toHaveBeenCalledWith(
      { parent_id: null, page: 1, pageSize: 100 },
      { kind: "tenant", tenantId: TENANT_ID },
    );
    expect(repository.updateTenantCategory).toHaveBeenCalledWith(
      expect.objectContaining({
        category_id: CATEGORY_ID,
        parent_id: null,
        code: "TC-OLD",
        name: "待置顶分类",
        status: "active",
        sort_order: 10,
        mapped_platform_category_id: null,
        expected_version: 3,
      }),
    );
  });

  test("generates tenant brand code defaults and empty mapping for simplified creates", async () => {
    const { service, repository } = await setup();

    await service.createTenantBrand(auth, {
      name: "系统维护字段品牌", status: "active",
    }, "brand-create-system-fields");

    expect(repository.createTenantBrand).toHaveBeenCalledWith(
      expect.objectContaining({
        brand_id: "00000000-0000-4000-8000-000000000301",
        code: "TB-00000000000040008000000000000301",
        name: "系统维护字段品牌",
        legal_name: null,
        status: "active",
        sort_order: 100,
        mapped_platform_brand_id: null,
      }),
    );
  });

  test("preserves tenant brand system fields during simplified updates", async () => {
    const { service, repository } = await setup();

    await service.updateTenantBrand(auth, BRAND_ID, {
      expected_version: 1,
      name: "更新品牌名称",
    }, "brand-update-system-fields");

    expect(repository.updateTenantBrand).toHaveBeenCalledWith(
      expect.objectContaining({
        brand_id: BRAND_ID,
        code: "TB-OLD",
        name: "更新品牌名称",
        legal_name: "旧品牌法定名称",
        logo_file_id: null,
        status: "active",
        sort_order: 100,
        mapped_platform_brand_id: "00000000-0000-4000-8000-000000000402",
        expected_version: 1,
      }),
    );
  });

  test("returns SHARED_RESOURCE_READ_ONLY before a tenant update command", async () => {
    const { service, repository } = await setup();
    repository.findVisibleCategory = mock(async () => ({
      id: "00000000-0000-4000-8000-000000000202",
      ownership_scope: "platform",
      owner_tenant_id: null,
      version: 1,
    })) as never;
    const update = (service as unknown as {
      updateTenantCategory(
        auth: unknown,
        id: string,
        input: Record<string, unknown>,
        key: string,
      ): Promise<unknown>;
    }).updateTenantCategory.bind(service);

    await expect(update(auth, "00000000-0000-4000-8000-000000000202", {
      expected_version: 1,
      name: "不能修改",
    }, "category-update-1")).rejects.toMatchObject({
      statusCode: 403,
      code: "SHARED_RESOURCE_READ_ONLY",
    });
  });

  test("hides another tenant category with not-found semantics", async () => {
    const { service, repository } = await setup();
    repository.findVisibleCategory = mock(async () => null) as never;

    await expect(service.updateTenantCategory(
      auth,
      "00000000-0000-4000-8000-000000000202",
      { expected_version: 1, name: "不可见分类" },
      "category-update-2",
    )).rejects.toMatchObject({
      statusCode: 404,
      code: "SUPPLIER_CATALOG_NOT_FOUND",
    });
    expect(repository.updateTenantCategory).not.toHaveBeenCalled();
  });

  test("blocks private writes before a command when rollout is disabled", async () => {
    const { service, repository } = await setup({
      ...enabledSettings,
      private_catalog_writes_enabled: false,
    });

    await expect(service.createTenantCategory(
      auth,
      {
        parent_id: null,
        code: "CAT-1",
        name: "分类",
        status: "active",
        sort_order: 100,
        mapped_platform_category_id: null,
      },
      "category-create-disabled",
    )).rejects.toMatchObject({
      statusCode: 403,
      code: "PRIVATE_CATALOG_WRITES_DISABLED",
    });
    expect(repository.createTenantCategory).not.toHaveBeenCalled();
  });

  test("lists suggestions only with authenticated tenant actor context", async () => {
    const { service, repository } = await setup();

    await service.listTenantUnitSuggestions(auth, {
      status: "submitted",
      page: 2,
      pageSize: 10,
    });

    expect(repository.listUnitSuggestions).toHaveBeenCalledWith({
      status: "submitted",
      page: 2,
      pageSize: 10,
      tenant_id: TENANT_ID,
      actor_user_id: USER_ID,
      actor_employee_id: EMPLOYEE_ID,
    });
  });
});
