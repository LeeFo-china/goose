import { describe, expect, mock, test } from "bun:test";

import type { CatalogUpdateReplay } from "@/repositories/supplier-catalog";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const IDs = {
  tenant: "00000000-0000-4000-8000-000000000101",
  user: "00000000-0000-4000-8000-000000000102",
  employee: "00000000-0000-4000-8000-000000000103",
  category: "00000000-0000-4000-8000-000000000104",
  brand: "00000000-0000-4000-8000-000000000105",
  spec: "00000000-0000-4000-8000-000000000106",
} as const;

describe("SupplierCatalogService state-independent update replay", () => {
  test("replays tenant category and brand with their exact recorded requests", async () => {
    const fixture = await setup();
    fixture.repository.findCatalogUpdateReplay
      .mockResolvedValueOnce(categoryReplay)
      .mockResolvedValueOnce(brandReplay);

    await fixture.service.updateTenantCategory(
      tenantAuth,
      IDs.category,
      { expected_version: 1, name: "首次名称" },
      "category-key",
    );
    await fixture.service.updateTenantBrand(
      tenantAuth,
      IDs.brand,
      { expected_version: 2, name: "品牌" },
      "brand-key",
    );

    expect(fixture.repository.updateTenantCategory).toHaveBeenCalledWith({
      ...categoryReplay.request,
      actor_user_id: IDs.user,
      idempotency_key: "category-key",
    });
    expect(fixture.repository.updateTenantBrand).toHaveBeenCalledWith({
      ...brandReplay.request,
      actor_user_id: IDs.user,
      idempotency_key: "brand-key",
    });
    expect(fixture.repository.findVisibleCategory).not.toHaveBeenCalled();
    expect(fixture.repository.findVisibleBrand).not.toHaveBeenCalled();
  });

  test("replays tenant and platform specs without reading changed rows", async () => {
    const fixture = await setup();
    fixture.repository.findCatalogUpdateReplay
      .mockResolvedValueOnce(tenantSpecReplay)
      .mockResolvedValueOnce(platformSpecReplay);

    await fixture.service.updateTenantSpecDefinition(
      tenantAuth,
      IDs.category,
      IDs.spec,
      { expected_version: 3, enum_options: ["红", "蓝", "绿"] },
      "tenant-spec-key",
    );
    await fixture.service.updatePlatformSpecDefinition(
      platformAuth,
      IDs.category,
      IDs.spec,
      { expected_version: 4, name: "平台颜色" },
      "platform-spec-key",
    );

    expect(fixture.repository.updateSpecDefinition.mock.calls[0]?.[0]).toEqual({
      ...tenantSpecReplay.request,
      actor_user_id: IDs.user,
      idempotency_key: "tenant-spec-key",
    });
    expect(fixture.repository.updateSpecDefinition.mock.calls[1]?.[0]).toEqual({
      ...platformSpecReplay.request,
      actor_user_id: IDs.user,
      idempotency_key: "platform-spec-key",
    });
    expect(fixture.repository.findVisibleSpecDefinition).not.toHaveBeenCalled();
  });

  test("rejects a replay whose submitted patch differs from the event", async () => {
    const fixture = await setup();
    fixture.repository.findCatalogUpdateReplay.mockResolvedValue(categoryReplay);

    await expect(fixture.service.updateTenantCategory(
      tenantAuth,
      IDs.category,
      { expected_version: 1, name: "不同名称" },
      "category-key",
    )).rejects.toMatchObject({
      statusCode: 409,
      code: "SUPPLIER_IDEMPOTENCY_CONFLICT",
    });
    expect(fixture.repository.updateTenantCategory).not.toHaveBeenCalled();
    expect(fixture.repository.findVisibleCategory).not.toHaveBeenCalled();
  });

  test("rejects another command or tenant without exposing its resource", async () => {
    const fixture = await setup();
    fixture.repository.findCatalogUpdateReplay.mockResolvedValue({
      ...categoryReplay,
      tenant_id: "00000000-0000-4000-8000-000000000999",
      command: "update_tenant_catalog_brand",
      resource_type: "catalog_brand",
      request: null,
    });

    await expect(fixture.service.updateTenantCategory(
      tenantAuth,
      IDs.category,
      { expected_version: 1, name: "首次名称" },
      "reused-key",
    )).rejects.toMatchObject({
      statusCode: 409,
      code: "SUPPLIER_IDEMPOTENCY_CONFLICT",
      details: undefined,
    });
    expect(fixture.repository.updateTenantCategory).not.toHaveBeenCalled();
  });
});

describe("SupplierCatalogService final spec validation", () => {
  test("merges and accepts enum-options-only and unit-dimension-only patches", async () => {
    const tenant = await setup({ currentSpec: enumSpec });
    await tenant.service.updateTenantSpecDefinition(
      tenantAuth,
      IDs.category,
      IDs.spec,
      { expected_version: 1, enum_options: ["红", "蓝", "绿"] },
      "enum-only",
    );
    expect(tenant.repository.updateSpecDefinition).toHaveBeenCalledWith(
      expect.objectContaining({
        value_type: "single_enum",
        enum_options: ["红", "蓝", "绿"],
      }),
    );

    const platform = await setup({ currentSpec: numberSpec });
    await platform.service.updatePlatformSpecDefinition(
      platformAuth,
      IDs.category,
      IDs.spec,
      { expected_version: 1, unit_dimension: "mass" },
      "dimension-only",
    );
    expect(platform.repository.updateSpecDefinition).toHaveBeenCalledWith(
      expect.objectContaining({ value_type: "number", unit_dimension: "mass" }),
    );
  });

  test("rejects invalid complete states after merging partial patches", async () => {
    const tenant = await setup({ currentSpec: enumSpec });
    await expect(tenant.service.updateTenantSpecDefinition(
      tenantAuth,
      IDs.category,
      IDs.spec,
      { expected_version: 1, value_type: "text" },
      "enum-to-text",
    )).rejects.toMatchObject({ code: "VALIDATION_ERROR" });

    const platform = await setup({ currentSpec: textSpec });
    await expect(platform.service.updatePlatformSpecDefinition(
      platformAuth,
      IDs.category,
      IDs.spec,
      { expected_version: 1, value_type: "single_enum" },
      "text-to-enum",
    )).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(tenant.repository.updateSpecDefinition).not.toHaveBeenCalled();
    expect(platform.repository.updateSpecDefinition).not.toHaveBeenCalled();
  });
});

async function setup(options: { currentSpec?: object } = {}) {
  const currentSpec = options.currentSpec ?? enumSpec;
  const repository = {
    findCatalogUpdateReplay: mock(async () =>
      null as CatalogUpdateReplay | null),
    findVisibleCategory: mock(async () => tenantCategory),
    findVisibleBrand: mock(async () => tenantBrand),
    findVisibleSpecDefinition: mock(async () => currentSpec),
    updateTenantCategory: mock(async (input: unknown) => input),
    updateTenantBrand: mock(async (input: unknown) => input),
    updateSpecDefinition: mock(async (input: unknown) => input),
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

const categoryRequest = {
  category_id: IDs.category,
  parent_id: null,
  code: "CAT-1",
  name: "首次名称",
  status: "active" as const,
  sort_order: 100,
  mapped_platform_category_id: null,
  expected_version: 1,
  tenant_id: IDs.tenant,
  actor_employee_id: IDs.employee,
};
const brandRequest = {
  brand_id: IDs.brand,
  code: "BR-1",
  name: "品牌",
  legal_name: null,
  logo_file_id: null,
  status: "active" as const,
  sort_order: 100,
  mapped_platform_brand_id: null,
  expected_version: 2,
  tenant_id: IDs.tenant,
  actor_employee_id: IDs.employee,
};
const specRequest = {
  spec_definition_id: IDs.spec,
  category_id: IDs.category,
  code: "COLOR",
  name: "颜色",
  value_type: "single_enum" as const,
  enum_options: ["红", "蓝", "绿"],
  unit_dimension: null,
  is_required: true,
  participates_in_sku_name: true,
  is_filterable: true,
  sort_order: 100,
  status: "active" as const,
  expected_version: 3,
  tenant_id: IDs.tenant,
  actor_employee_id: IDs.employee,
};

const categoryReplay = replay(
  IDs.tenant,
  "update_tenant_catalog_category",
  "catalog_category",
  IDs.category,
  categoryRequest,
);
const brandReplay = replay(
  IDs.tenant,
  "update_tenant_catalog_brand",
  "catalog_brand",
  IDs.brand,
  brandRequest,
);
const tenantSpecReplay = replay(
  IDs.tenant,
  "update_catalog_spec_definition",
  "catalog_spec_definition",
  IDs.spec,
  specRequest,
);
const platformSpecReplay = replay(
  null,
  "update_catalog_spec_definition",
  "catalog_spec_definition",
  IDs.spec,
  { ...specRequest, name: "平台颜色", expected_version: 4, tenant_id: null },
);

function replay(
  tenant_id: string | null,
  command: string,
  resource_type: string,
  resource_id: string,
  request: object,
) {
  return { tenant_id, command, resource_type, resource_id, request };
}

const baseSpec = {
  id: IDs.spec,
  category_id: IDs.category,
  code: "SPEC",
  name: "规格",
  unit_dimension: null,
  is_required: false,
  participates_in_sku_name: false,
  is_filterable: false,
  sort_order: 100,
  status: "active" as const,
  version: 1,
  ownership_scope: "tenant" as const,
  owner_tenant_id: IDs.tenant,
  source_platform_spec_id: null,
  created_at: "2026-08-18T00:00:00Z",
  updated_at: "2026-08-18T00:00:00Z",
};
const enumSpec = {
  ...baseSpec,
  value_type: "single_enum" as const,
  enum_options: ["红", "蓝"],
};
const numberSpec = {
  ...baseSpec,
  value_type: "number" as const,
  enum_options: [],
  ownership_scope: "platform" as const,
  owner_tenant_id: null,
};
const textSpec = {
  ...numberSpec,
  value_type: "text" as const,
};
const tenantCategory = {
  id: IDs.category,
  parent_id: null,
  code: "CAT-1",
  name: "分类",
  status: "active" as const,
  sort_order: 100,
  version: 1,
  ownership_scope: "tenant" as const,
  owner_tenant_id: IDs.tenant,
};
const tenantBrand = {
  id: IDs.brand,
  code: "BR-1",
  name: "品牌",
  legal_name: null,
  logo_file_id: null,
  status: "active" as const,
  sort_order: 100,
  version: 1,
  ownership_scope: "tenant" as const,
  owner_tenant_id: IDs.tenant,
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
