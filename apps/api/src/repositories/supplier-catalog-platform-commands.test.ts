import { describe, expect, test } from "bun:test";
import { createClient } from "@supabase/supabase-js";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const CATEGORY_ID = "00000000-0000-4000-8000-000000000101";
const BRAND_ID = "00000000-0000-4000-8000-000000000201";
const UNIT_ID = "00000000-0000-4000-8000-000000000301";
const BASE_UNIT_ID = "00000000-0000-4000-8000-000000000302";
const EMPLOYEE_ID = "00000000-0000-4000-8000-000000000401";
const USER_ID = "00000000-0000-4000-8000-000000000402";
const NOW = "2026-07-24T00:00:00.000Z";

type StubResponse = { body: unknown; count?: number; status?: number };

async function createRepository(
  responder: (request: Request) => StubResponse,
) {
  const requests: Request[] = [];
  const fetchStub = (async (input: string | URL | Request, init?: RequestInit) => {
    const request = input instanceof Request
      ? input
      : new Request(input.toString(), init);
    requests.push(request);
    const response = responder(request);
    return new Response(JSON.stringify(response.body), {
      status: response.status ?? 200,
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

describe("SupplierCatalogRepository platform writes", () => {
  test("creates each catalog resource through an atomic command RPC", async () => {
    const { repository, requests } = await createRepository((request) => {
      const name = new URL(request.url).pathname.split("/").at(-1);
      const resource = name === "create_catalog_category"
        ? { category: platformCategory }
        : name === "create_catalog_brand"
        ? { brand: platformBrand }
        : { unit };
      return {
        body: {
          status: "created",
          idempotent: false,
          ...resource,
          version: 1,
        },
      };
    });
    const context = {
      actor_user_id: USER_ID,
      actor_employee_id: EMPLOYEE_ID,
      idempotency_key: "catalog-create",
    };

    await repository.createCategory({
      category_id: CATEGORY_ID,
      parent_id: null,
      code: "CAT-001",
      name: "主材",
      level: 1,
      status: "active",
      sort_order: 100,
      ...context,
    });
    await repository.createBrand({
      brand_id: BRAND_ID,
      code: "BR-001",
      name: "雨虹",
      status: "active",
      sort_order: 100,
      ...context,
    });
    await repository.createUnit({
      unit_id: UNIT_ID,
      code: "UNIT-BOX",
      name: "箱",
      symbol: "箱",
      base_unit_id: BASE_UNIT_ID,
      conversion_factor: "12",
      unit_dimension: "quantity",
      status: "active",
      sort_order: 100,
      ...context,
    });

    expect(requests).toHaveLength(3);
    for (const request of requests) {
      expect(request.method).toBe("POST");
      expect(await request.clone().json()).toMatchObject({
        p_actor_user_id: USER_ID,
        p_actor_employee_id: EMPLOYEE_ID,
        p_idempotency_key: "catalog-create",
      });
    }
    expect(await requests[2]!.clone().json()).toMatchObject({
      p_unit_dimension: "quantity",
    });
    expect(requests.map((request) => new URL(request.url).pathname)).toEqual([
      "/rest/v1/rpc/create_catalog_category",
      "/rest/v1/rpc/create_catalog_brand",
      "/rest/v1/rpc/create_catalog_unit",
    ]);
  });

  test("updates each resource with id and optimistic version guards", async () => {
    const { repository, requests } = await createRepository((request) => ({
      body: request.url.includes("catalog_categories")
        ? { ...category, name: "新主材", version: 2 }
        : request.url.includes("catalog_brands")
        ? { ...brand, name: "新雨虹", version: 2 }
        : { ...unit, name: "整箱", version: 2 },
    }));

    await repository.updateCategory({
      category_id: CATEGORY_ID,
      expected_version: 1,
      name: "新主材",
      updated_by_employee_id: EMPLOYEE_ID,
    });
    await repository.updateBrand({
      brand_id: BRAND_ID,
      expected_version: 1,
      name: "新雨虹",
      updated_by_employee_id: EMPLOYEE_ID,
    });
    await repository.updateUnit({
      unit_id: UNIT_ID,
      expected_version: 1,
      name: "整箱",
      updated_by_employee_id: EMPLOYEE_ID,
    });

    for (const request of requests) {
      const url = new URL(request.url);
      expect(request.method).toBe("PATCH");
      expect(url.searchParams.get("version")).toBe("eq.1");
      expect(url.searchParams.get("select")).not.toContain("*");
      expect(await request.clone().json()).toMatchObject({
        version: 2,
        updated_by_employee_id: EMPLOYEE_ID,
      });
    }
    expect(new URL(requests[0]!.url).searchParams.get("id"))
      .toBe(`eq.${CATEGORY_ID}`);
    expect(new URL(requests[1]!.url).searchParams.get("id"))
      .toBe(`eq.${BRAND_ID}`);
    expect(new URL(requests[2]!.url).searchParams.get("id"))
      .toBe(`eq.${UNIT_ID}`);
  });

  test("returns the latest status and version after an optimistic conflict", async () => {
    const { repository, requests } = await createRepository((request) =>
      request.method === "PATCH"
        ? { body: null }
        : { body: { version: 3, status: "active" } }
    );

    await expect(repository.updateBrand({
      brand_id: BRAND_ID,
      expected_version: 2,
      status: "inactive",
      updated_by_employee_id: EMPLOYEE_ID,
    })).rejects.toMatchObject({
      statusCode: 409,
      code: "SUPPLIER_VERSION_CONFLICT",
      details: { current_version: 3, current_status: "active" },
    });
    expect(requests).toHaveLength(2);
    const refreshUrl = new URL(requests[1]!.url);
    expect(refreshUrl.searchParams.get("select")).toBe("version,status");
  });

  test("wraps Supabase failures as database errors", async () => {
    const failed = await createRepository(() => ({
      body: { code: "23505", message: "duplicate key" },
      status: 409,
    }));
    await expect(failed.repository.createBrand({
      brand_id: BRAND_ID,
      code: "BR-001",
      name: "重复品牌",
      status: "active",
      sort_order: 100,
      actor_user_id: USER_ID,
      actor_employee_id: EMPLOYEE_ID,
      idempotency_key: "brand-create",
    })).rejects.toMatchObject({
      code: "DB_ERROR",
      details: expect.objectContaining({ code: "23505" }),
    });
  });
});

const audit = { version: 1, created_at: NOW, updated_at: NOW };
const category = {
  id: CATEGORY_ID,
  parent_id: null,
  code: "CAT-001",
  name: "主材",
  level: 1,
  full_name: "主材",
  is_leaf: true,
  mapped_platform_category_id: null,
  ownership_scope: "platform" as const,
  owner_tenant_id: null,
  status: "active",
  sort_order: 100,
  ...audit,
};
const brand = {
  id: BRAND_ID,
  category_id: null,
  code: "BR-001",
  name: "雨虹",
  legal_name: null,
  logo_file_id: null,
  mapped_platform_brand_id: null,
  ownership_scope: "platform" as const,
  owner_tenant_id: null,
  status: "active",
  sort_order: 100,
  ...audit,
};
const unit = {
  id: UNIT_ID,
  code: "UNIT-BOX",
  name: "箱",
  symbol: "箱",
  base_unit_id: BASE_UNIT_ID,
  conversion_factor: "12.000000",
  unit_dimension: "quantity",
  status: "active",
  sort_order: 100,
  ...audit,
};
const {
  full_name: _fullName,
  is_leaf: _isLeaf,
  mapped_platform_category_id: _mappedCategoryId,
  ownership_scope: _categoryScope,
  owner_tenant_id: _categoryTenantId,
  ...platformCategory
} = category;
const {
  mapped_platform_brand_id: _mappedBrandId,
  ownership_scope: _brandScope,
  owner_tenant_id: _brandTenantId,
  ...platformBrand
} = brand;
