import { describe, expect, mock, test } from "bun:test";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const TENANT_ID = "00000000-0000-4000-8000-000000000101";
const USER_ID = "00000000-0000-4000-8000-000000000102";
const EMPLOYEE_ID = "00000000-0000-4000-8000-000000000103";

const auth = {
  tenantId: TENANT_ID,
  authUserId: USER_ID,
  employeeId: EMPLOYEE_ID,
  isPlatformAdmin: false,
  isPlatformStaff: false,
  permissions: [
    { code: "supplier.view", scope: "all" },
    { code: "supplier.catalog.manage", scope: "all" },
  ],
} as never;

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
    createTenantCategory: mock(async (input: unknown) => input),
    updateTenantCategory: mock(async (input: unknown) => input),
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
  };
  const settingsRepository = {
    getSettings: mock(async () => settings),
  };
  const accessPolicy = {
    assertTenantContext: mock(() => TENANT_ID),
    assertPermission: mock(() => "all"),
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
