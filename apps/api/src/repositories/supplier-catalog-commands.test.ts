import { describe, expect, test } from "bun:test";
import { createClient } from "@supabase/supabase-js";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const IDs = {
  tenant: "00000000-0000-4000-8000-000000000101",
  user: "00000000-0000-4000-8000-000000000102",
  employee: "00000000-0000-4000-8000-000000000103",
  category: "00000000-0000-4000-8000-000000000104",
  platformCategory: "00000000-0000-4000-8000-000000000105",
  unit: "00000000-0000-4000-8000-000000000106",
  suggestion: "00000000-0000-4000-8000-000000000107",
  spec: "00000000-0000-4000-8000-000000000108",
  brand: "00000000-0000-4000-8000-000000000109",
} as const;

async function setup(responder?: (request: Request) => unknown) {
  const requests: Request[] = [];
  const fetchStub = (async (input: string | URL | Request, init?: RequestInit) => {
    const request = input instanceof Request
      ? input
      : new Request(input.toString(), init);
    requests.push(request);
    const name = new URL(request.url).pathname.split("/").at(-1);
    const body = responder?.(request) ?? (name === "copy_platform_category_specs"
      ? { status: "copied", copied_count: 2, ids: [], idempotent: false, version: 2 }
      : { status: "created", idempotent: false, version: 1 });
    return new Response(JSON.stringify(body), {
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
  const client = createClient("http://127.0.0.1:54321", "test-key", {
    global: { fetch: fetchStub },
  });
  const { SupplierCatalogRepository } = await import("./supplier-catalog");
  return {
    repository: new SupplierCatalogRepository(() => client as never),
    requests,
  };
}

describe("SupplierCatalogRepository canonical commands", () => {
  test("creates tenant categories brands and specs through canonical RPCs", async () => {
    const { repository, requests } = await setup((request) => {
      const name = new URL(request.url).pathname.split("/").at(-1);
      return name === "create_tenant_catalog_category"
        ? commandResult("catalog_category", category)
        : name === "create_tenant_catalog_brand"
          ? commandResult("catalog_brand", brand)
        : commandResult("spec_definition", specDefinition);
    });

    await repository.createTenantCategory({
      category_id: IDs.category,
      parent_id: null,
      code: "PRIVATE-MATERIAL",
      name: "租户主材",
      status: "active",
      sort_order: 100,
      mapped_platform_category_id: IDs.platformCategory,
      ...tenantContext("tenant-category-1"),
    });
    await repository.createTenantBrand({
      brand_id: IDs.brand,
      category_id: IDs.category,
      code: "TB-PRIVATE",
      name: "租户品牌",
      legal_name: null,
      logo_file_id: null,
      status: "active",
      sort_order: 100,
      mapped_platform_brand_id: null,
      ...tenantContext("tenant-brand-1"),
    });
    await repository.createSpecDefinition({
      spec_definition_id: IDs.spec,
      category_id: IDs.category,
      code: "COLOR",
      name: "颜色",
      value_type: "single_enum",
      enum_options: ["红", "蓝"],
      unit_dimension: null,
      is_required: true,
      participates_in_sku_name: true,
      is_filterable: true,
      sort_order: 100,
      status: "active",
      tenant_id: IDs.tenant,
      actor_user_id: IDs.user,
      actor_employee_id: IDs.employee,
      idempotency_key: "tenant-spec-1",
    });

    expect(requests.map((request) => new URL(request.url).pathname)).toEqual([
      "/rest/v1/rpc/create_tenant_catalog_category",
      "/rest/v1/rpc/create_tenant_catalog_brand",
      "/rest/v1/rpc/create_catalog_spec_definition",
    ]);
    expect(await requests[0]!.clone().json()).toMatchObject({
      p_tenant_id: IDs.tenant,
      p_category_id: IDs.category,
      p_mapped_platform_category_id: IDs.platformCategory,
    });
    expect(await requests[1]!.clone().json()).toMatchObject({
      p_tenant_id: IDs.tenant,
      p_brand_id: IDs.brand,
      p_category_id: IDs.category,
    });
    expect(await requests[2]!.clone().json()).toMatchObject({
      p_tenant_id: IDs.tenant,
      p_spec_definition_id: IDs.spec,
      p_value_type: "single_enum",
      p_enum_options: ["红", "蓝"],
    });
  });

  test("copy command injects tenant and authenticated actor context", async () => {
    const { repository, requests } = await setup();
    const copy = (repository as unknown as {
      copyPlatformSpecDefinitions(input: Record<string, unknown>): Promise<unknown>;
    }).copyPlatformSpecDefinitions.bind(repository);

    await copy({
      tenant_category_id: IDs.category,
      platform_category_id: IDs.platformCategory,
      expected_version: 1,
      tenant_id: IDs.tenant,
      actor_user_id: IDs.user,
      actor_employee_id: IDs.employee,
      idempotency_key: "copy-specs-1",
    });

    expect(new URL(requests[0]!.url).pathname)
      .toBe("/rest/v1/rpc/copy_platform_category_specs");
    expect(await requests[0]!.clone().json()).toEqual({
      p_tenant_category_id: IDs.category,
      p_platform_category_id: IDs.platformCategory,
      p_expected_version: 1,
      p_tenant_id: IDs.tenant,
      p_actor_user_id: IDs.user,
      p_actor_employee_id: IDs.employee,
      p_idempotency_key: "copy-specs-1",
    });
  });

  test("platform create unit sends the canonical twelve-parameter RPC", async () => {
    const { repository, requests } = await setup();

    await repository.createUnit({
      unit_id: IDs.unit,
      code: "UNIT-BOX",
      name: "箱",
      symbol: "箱",
      base_unit_id: null,
      conversion_factor: "1",
      unit_dimension: "quantity",
      status: "active",
      sort_order: 100,
      actor_user_id: IDs.user,
      actor_employee_id: IDs.employee,
      idempotency_key: "unit-create-1",
    } as never).catch(() => undefined);

    const payload = await requests[0]!.clone().json() as Record<string, unknown>;
    expect(Object.keys(payload)).toHaveLength(12);
    expect(payload).toMatchObject({
      p_unit_dimension: "quantity",
      p_unit_id: IDs.unit,
      p_actor_user_id: IDs.user,
      p_idempotency_key: "unit-create-1",
    });
  });

  test("submits and paginates suggestions with tenant-scoped RPC context", async () => {
    const { repository, requests } = await setup((request) => {
      const name = new URL(request.url).pathname.split("/").at(-1);
      if (name === "list_catalog_unit_suggestions") {
        return {
          list: [suggestion],
          pagination: { page: 2, pageSize: 10, total: 11, totalPages: 2 },
        };
      }
      return {
        status: name === "review_catalog_unit_suggestion"
          ? "approved"
          : "submitted",
        idempotent: false,
        catalog_unit_suggestion: name === "review_catalog_unit_suggestion"
          ? { ...suggestion, status: "approved", version: 2 }
          : suggestion,
        version: name === "review_catalog_unit_suggestion" ? 2 : 1,
      };
    });

    await repository.submitUnitSuggestion({
      suggestion_id: IDs.suggestion,
      suggested_code: "BOX",
      suggested_name: "箱",
      suggested_symbol: "箱",
      unit_dimension: "quantity",
      reason: "业务需要",
      tenant_id: IDs.tenant,
      actor_user_id: IDs.user,
      actor_employee_id: IDs.employee,
      idempotency_key: "suggest-unit-1",
    });
    const page = await repository.listUnitSuggestions({
      status: "submitted",
      tenant_id: IDs.tenant,
      page: 2,
      pageSize: 10,
      actor_user_id: IDs.user,
      actor_employee_id: IDs.employee,
    });
    await repository.reviewUnitSuggestion({
      suggestion_id: IDs.suggestion,
      action: "approved",
      approved_catalog_unit_id: IDs.unit,
      expected_version: 1,
      actor_user_id: IDs.user,
      actor_employee_id: IDs.employee,
      idempotency_key: "review-unit-1",
    });

    expect(page).toMatchObject({
      list: [{ id: IDs.suggestion, tenant_id: IDs.tenant }],
      pagination: { page: 2, pageSize: 10, total: 11, totalPages: 2 },
    });
    expect(await requests[0]!.clone().json()).toMatchObject({
      p_tenant_id: IDs.tenant,
      p_actor_user_id: IDs.user,
      p_idempotency_key: "suggest-unit-1",
    });
    expect(await requests[1]!.clone().json()).toEqual({
      p_actor_user_id: IDs.user,
      p_actor_employee_id: IDs.employee,
      p_status: "submitted",
      p_tenant_id: IDs.tenant,
      p_page: 2,
      p_page_size: 10,
    });
    expect(await requests[2]!.clone().json()).toMatchObject({
      p_suggestion_id: IDs.suggestion,
      p_action: "approved",
      p_approved_catalog_unit_id: IDs.unit,
      p_expected_version: 1,
      p_idempotency_key: "review-unit-1",
    });
  });
});

function tenantContext(idempotencyKey: string) {
  return {
    tenant_id: IDs.tenant,
    actor_user_id: IDs.user,
    actor_employee_id: IDs.employee,
    idempotency_key: idempotencyKey,
  };
}

function commandResult(key: string, resource: object) {
  return {
    status: "created",
    idempotent: false,
    [key]: resource,
    version: 1,
  };
}

const audit = {
  version: 1,
  created_by_employee_id: IDs.employee,
  updated_by_employee_id: IDs.employee,
  created_at: "2026-08-18T00:00:00.000Z",
  updated_at: "2026-08-18T00:00:00.000Z",
};
const category = {
  id: IDs.category,
  parent_id: null,
  code: "PRIVATE-MATERIAL",
  name: "租户主材",
  level: 1,
  full_name: "租户主材",
  is_leaf: true,
  mapped_platform_category_id: IDs.platformCategory,
  ownership_scope: "tenant" as const,
  owner_tenant_id: IDs.tenant,
  status: "active" as const,
  sort_order: 100,
  ...audit,
};
const brand = {
  id: IDs.brand,
  category_id: IDs.category,
  code: "TB-PRIVATE",
  name: "租户品牌",
  legal_name: null,
  logo_file_id: null,
  mapped_platform_brand_id: null,
  ownership_scope: "tenant" as const,
  owner_tenant_id: IDs.tenant,
  status: "active" as const,
  sort_order: 100,
  ...audit,
};
const specDefinition = {
  id: IDs.spec,
  category_id: IDs.category,
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
  ownership_scope: "tenant" as const,
  owner_tenant_id: IDs.tenant,
  source_platform_spec_id: null,
  ...audit,
};

const suggestion = {
  id: IDs.suggestion,
  tenant_id: IDs.tenant,
  suggested_code: "BOX",
  suggested_name: "箱",
  suggested_symbol: "箱",
  unit_dimension: "quantity",
  reason: "业务需要",
  status: "submitted" as const,
  version: 1,
  submitted_by_employee_id: IDs.employee,
  reviewed_by_employee_id: null,
  reviewed_at: null,
  review_remark: null,
  approved_catalog_unit_id: null,
  created_at: "2026-08-18T00:00:00.000Z",
  updated_at: "2026-08-18T00:00:00.000Z",
};
