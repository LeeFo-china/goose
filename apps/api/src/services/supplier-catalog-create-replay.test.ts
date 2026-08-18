import { describe, expect, mock, test } from "bun:test";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const IDs = {
  tenant: "00000000-0000-4000-8000-000000000101",
  user: "00000000-0000-4000-8000-000000000102",
  employee: "00000000-0000-4000-8000-000000000103",
  category: "00000000-0000-4000-8000-000000000104",
} as const;

describe("SupplierCatalogService create replay identity", () => {
  test("keeps every command resource id stable and separates namespaces", async () => {
    const { service, repository } = await setup();

    for (let retry = 0; retry < 2; retry += 1) {
      await service.createTenantCategory(tenantAuth, categoryInput, "same-key");
      await service.createTenantBrand(tenantAuth, brandInput, "same-key");
      await service.createTenantSpecDefinition(
        tenantAuth,
        IDs.category,
        specInput,
        "same-key",
      );
      await service.submitTenantUnitSuggestion(
        tenantAuth,
        suggestionInput,
        "same-key",
      );
      await service.createPlatformSpecDefinition(
        platformAuth,
        IDs.category,
        specInput,
        "same-key",
      );
    }

    const specIds = calls(repository.createSpecDefinition, "spec_definition_id");
    const ids = [
      calls(repository.createTenantCategory, "category_id"),
      calls(repository.createTenantBrand, "brand_id"),
      calls(repository.submitUnitSuggestion, "suggestion_id"),
      [specIds[0] ?? "", specIds[2] ?? ""],
      [specIds[1] ?? "", specIds[3] ?? ""],
    ];
    for (const commandIds of ids) {
      expect(commandIds[1]).toBe(commandIds[0]);
      expect(commandIds[0]).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      );
    }
    expect(new Set(ids.map(([first]) => first)).size).toBe(ids.length);

  });
});

async function setup() {
  const repository = {
    createTenantCategory: mock(async (input: unknown) => input),
    createTenantBrand: mock(async (input: unknown) => input),
    createSpecDefinition: mock(async (input: unknown) => input),
    submitUnitSuggestion: mock(async (input: unknown) => input),
    findVisibleCategory: mock(async () => ({
      id: IDs.category,
      ownership_scope: "tenant",
      owner_tenant_id: IDs.tenant,
    })),
  };
  const { SupplierCatalogService } = await import("./supplier-catalog");
  return {
    repository,
    service: new SupplierCatalogService({
      repository,
      settingsRepository: { getSettings: mock(async () => enabledSettings) },
      accessPolicy: {
        assertTenantContext: mock(() => IDs.tenant),
        assertPermission: mock(() => "all"),
      },
    } as never),
  };
}

function calls(fn: ReturnType<typeof mock>, field: string): string[] {
  return fn.mock.calls.map(([input]) =>
    (input as Record<string, string>)[field] ?? ""
  );
}

const categoryInput = {
  parent_id: null,
  code: "CAT-1",
  name: "分类",
  status: "active" as const,
  sort_order: 100,
  mapped_platform_category_id: null,
};
const brandInput = {
  code: "BR-1",
  name: "品牌",
  status: "active" as const,
  sort_order: 100,
  mapped_platform_brand_id: null,
};
const specInput = {
  code: "COLOR",
  name: "颜色",
  value_type: "single_enum" as const,
  enum_options: ["红", "蓝"],
  unit_dimension: null,
  is_required: false,
  participates_in_sku_name: false,
  is_filterable: true,
  sort_order: 100,
  status: "active" as const,
};
const suggestionInput = {
  suggested_code: "BOX",
  suggested_name: "箱",
  suggested_symbol: "箱",
  unit_dimension: "quantity",
  reason: null,
};
const enabledSettings = {
  module_enabled: true,
  ownership_reads_enabled: true,
  private_supplier_writes_enabled: true,
  private_catalog_writes_enabled: true,
  procurement_snapshot_v1_enabled: false,
};
const tenantAuth = {
  tenantId: IDs.tenant,
  authUserId: IDs.user,
  employeeId: IDs.employee,
  isPlatformAdmin: false,
  isPlatformStaff: false,
  permissions: [{ code: "supplier.catalog.manage", scope: "all" }],
} as never;
const platformAuth = {
  tenantId: null,
  authUserId: IDs.user,
  employeeId: IDs.employee,
  isPlatformAdmin: true,
  isPlatformStaff: false,
  permissions: [{ code: "platform.catalog.manage", scope: "all" }],
} as never;
