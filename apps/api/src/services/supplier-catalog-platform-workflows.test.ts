import { describe, expect, mock, test } from "bun:test";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const IDs = {
  user: "00000000-0000-4000-8000-000000000101",
  employee: "00000000-0000-4000-8000-000000000102",
  category: "00000000-0000-4000-8000-000000000103",
  spec: "00000000-0000-4000-8000-000000000104",
  suggestion: "00000000-0000-4000-8000-000000000105",
  unit: "00000000-0000-4000-8000-000000000106",
} as const;

async function setup() {
  const { SupplierCatalogService } = await import("./supplier-catalog");
  const repository = {
    listSpecDefinitions: mock(async () => ({ list: [], pagination: {} })),
    createSpecDefinition: mock(async (input: unknown) => input),
    findVisibleSpecDefinition: mock(async () => specDefinition),
    updateSpecDefinition: mock(async (input: unknown) => input),
    listUnitSuggestions: mock(async (input: unknown) => input),
    reviewUnitSuggestion: mock(async (input: unknown) => input),
  };
  const accessPolicy = {
    assertTenantContext: mock(() => ""),
    assertPermission: mock(() => "all"),
  };
  return {
    repository,
    service: new SupplierCatalogService({
      repository,
      accessPolicy,
      settingsRepository: { getSettings: mock(async () => null) },
      idFactory: () => IDs.spec,
    } as never),
  };
}

describe("SupplierCatalogService platform catalog workflows", () => {
  test("uses platform visibility and injects null ownership for specs", async () => {
    const { service, repository } = await setup();

    await service.listPlatformSpecDefinitions(platformAuth, IDs.category, {
      page: 1,
      pageSize: 20,
    });
    await service.createPlatformSpecDefinition(
      platformAuth,
      IDs.category,
      createSpec,
      "platform-spec-create-1",
    );
    await service.updatePlatformSpecDefinition(
      platformAuth,
      IDs.category,
      IDs.spec,
      { expected_version: 1, name: "新颜色" },
      "platform-spec-update-1",
    );

    expect(repository.listSpecDefinitions).toHaveBeenCalledWith(
      IDs.category,
      { page: 1, pageSize: 20 },
      { kind: "platform" },
    );
    expect(repository.findVisibleSpecDefinition).toHaveBeenCalledWith(
      IDs.category,
      IDs.spec,
      { kind: "platform" },
    );
    expect(repository.createSpecDefinition).toHaveBeenCalledWith(
      expect.objectContaining({
        spec_definition_id: IDs.spec,
        category_id: IDs.category,
        tenant_id: null,
        actor_user_id: IDs.user,
        actor_employee_id: IDs.employee,
        idempotency_key: "platform-spec-create-1",
      }),
    );
    expect(repository.updateSpecDefinition).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "新颜色",
        code: "COLOR",
        value_type: "single_enum",
        enum_options: ["红", "蓝"],
        tenant_id: null,
        expected_version: 1,
      }),
    );
  });

  test("passes platform actor and optional tenant filter to suggestions", async () => {
    const { service, repository } = await setup();

    await service.listPlatformUnitSuggestions(platformAuth, {
      status: "submitted",
      page: 2,
      pageSize: 10,
    });
    await service.reviewPlatformUnitSuggestion(
      platformAuth,
      IDs.suggestion,
      {
        action: "approved",
        approved_catalog_unit_id: IDs.unit,
        expected_version: 1,
      },
      "review-suggestion-1",
    );

    expect(repository.listUnitSuggestions).toHaveBeenCalledWith({
      status: "submitted",
      page: 2,
      pageSize: 10,
      tenant_id: null,
      actor_user_id: IDs.user,
      actor_employee_id: IDs.employee,
    });
    expect(repository.reviewUnitSuggestion).toHaveBeenCalledWith({
      suggestion_id: IDs.suggestion,
      action: "approved",
      approved_catalog_unit_id: IDs.unit,
      expected_version: 1,
      actor_user_id: IDs.user,
      actor_employee_id: IDs.employee,
      idempotency_key: "review-suggestion-1",
    });
  });
});

const platformAuth = {
  tenantId: null,
  authUserId: IDs.user,
  employeeId: IDs.employee,
  isPlatformAdmin: true,
  isPlatformStaff: false,
  permissions: [{ code: "platform.catalog.manage", scope: "all" }],
} as never;

const createSpec = {
  code: "COLOR",
  name: "颜色",
  value_type: "single_enum" as const,
  enum_options: ["红", "蓝"],
  unit_dimension: null,
  is_required: true,
  participates_in_sku_name: true,
  is_filterable: true,
  sort_order: 100,
  status: "active" as const,
};

const specDefinition = {
  id: IDs.spec,
  category_id: IDs.category,
  ownership_scope: "platform" as const,
  owner_tenant_id: null,
  source_platform_spec_id: null,
  version: 1,
  created_at: "2026-08-18T00:00:00.000Z",
  updated_at: "2026-08-18T00:00:00.000Z",
  ...createSpec,
};
