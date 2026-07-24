import { describe, expect, test } from "bun:test";
import { createClient } from "@supabase/supabase-js";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const CATEGORY_ID = "00000000-0000-4000-8000-000000000101";
const PARENT_ID = "00000000-0000-4000-8000-000000000102";
const BRAND_ID = "00000000-0000-4000-8000-000000000201";
const UNIT_ID = "00000000-0000-4000-8000-000000000301";
const BASE_UNIT_ID = "00000000-0000-4000-8000-000000000302";
const EMPLOYEE_ID = "00000000-0000-4000-8000-000000000401";
const NOW = "2026-07-24T00:00:00.000Z";
const PRECISE_FACTOR = "999999999999.123456";

type StubResponse = {
  body: unknown;
  count?: number;
  status?: number;
};

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
    const length = Array.isArray(response.body) ? response.body.length : 1;
    return new Response(JSON.stringify(response.body), {
      status: response.status ?? 200,
      headers: {
        "content-type": "application/json",
        ...(response.count === undefined
          ? {}
          : { "content-range": `0-${Math.max(0, length - 1)}/${response.count}` }),
      },
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

describe("SupplierCatalogRepository paginated reads", () => {
  test("defaults list pagination to page one and twenty rows", async () => {
    const { repository, requests } = await createRepository(() => ({
      body: [brand],
      count: 1,
    }));

    const result = await repository.listBrands({} as never);

    expect(result.pagination).toEqual({
      page: 1,
      pageSize: 20,
      total: 1,
      totalPages: 1,
    });
    const url = new URL(requests[0]!.url);
    expect(url.searchParams.get("offset")).toBe("0");
    expect(url.searchParams.get("limit")).toBe("20");
  });

  test("always scopes category pages by parent and clamps page size", async () => {
    const { repository, requests } = await createRepository(() => ({
      body: [category],
      count: 201,
    }));

    const roots = await repository.listCategories({
      keyword: " 主材,().%_ ",
      page: 2,
      pageSize: 500,
    });
    const children = await repository.listCategories({
      parent_id: PARENT_ID,
      status: "inactive",
      level: 2,
      page: 1,
      pageSize: 20,
    });

    expect(roots.pagination).toEqual({
      page: 2,
      pageSize: 100,
      total: 201,
      totalPages: 3,
    });
    const rootUrl = new URL(requests[0]!.url);
    expect(rootUrl.searchParams.get("parent_id")).toBe("is.null");
    expect(rootUrl.searchParams.get("offset")).toBe("100");
    expect(rootUrl.searchParams.get("limit")).toBe("100");
    expect(rootUrl.searchParams.get("or")).toBe(
      "(code.ilike.%主材%,name.ilike.%主材%)",
    );
    const childUrl = new URL(requests[1]!.url);
    expect(childUrl.searchParams.get("parent_id")).toBe(`eq.${PARENT_ID}`);
    expect(childUrl.searchParams.get("status")).toBe("eq.inactive");
    expect(childUrl.searchParams.get("level")).toBe("eq.2");
    for (const request of requests) {
      expect(request.headers.get("prefer")).toContain("count=exact");
      expect(new URL(request.url).searchParams.get("select")).not.toContain("*");
    }
  });

  test("paginates brand and unit rows with explicit filters", async () => {
    const { repository, requests } = await createRepository((request) => ({
      body: request.url.includes("catalog_brands") ? [brand] : [unit],
      count: request.url.includes("catalog_brands") ? 21 : 35,
    }));

    const brands = await repository.listBrands({
      status: "active",
      page: 2,
      pageSize: 20,
    });
    const units = await repository.listUnits({
      status: "inactive",
      base_unit_id: BASE_UNIT_ID,
      page: 3,
      pageSize: 10,
    });

    expect(brands.pagination.totalPages).toBe(2);
    expect(units.pagination).toEqual({
      page: 3,
      pageSize: 10,
      total: 35,
      totalPages: 4,
    });
    expect(units.list[0]?.conversion_factor).toBe(PRECISE_FACTOR);
    const brandUrl = new URL(requests[0]!.url);
    expect(brandUrl.searchParams.get("status")).toBe("eq.active");
    expect(brandUrl.searchParams.get("offset")).toBe("20");
    const unitUrl = new URL(requests[1]!.url);
    expect(unitUrl.searchParams.get("status")).toBe("eq.inactive");
    expect(unitUrl.searchParams.get("base_unit_id")).toBe(`eq.${BASE_UNIT_ID}`);
    expect(unitUrl.searchParams.get("offset")).toBe("20");
    expect(unitUrl.searchParams.get("limit")).toBe("10");
    expect(unitUrl.searchParams.get("select"))
      .toContain("conversion_factor::text");
  });
});

describe("SupplierCatalogRepository writes", () => {
  test("creates each catalog resource with explicit returned columns", async () => {
    const { repository, requests } = await createRepository((request) => ({
      body: request.url.includes("catalog_categories")
        ? category
        : request.url.includes("catalog_brands")
        ? brand
        : unit,
    }));

    await repository.createCategory({
      parent_id: null,
      code: "CAT-001",
      name: "主材",
      level: 1,
      status: "active",
      sort_order: 100,
      created_by_employee_id: EMPLOYEE_ID,
      updated_by_employee_id: EMPLOYEE_ID,
    });
    await repository.createBrand({
      code: "BR-001",
      name: "雨虹",
      status: "active",
      sort_order: 100,
      created_by_employee_id: EMPLOYEE_ID,
      updated_by_employee_id: EMPLOYEE_ID,
    });
    await repository.createUnit({
      code: "UNIT-BOX",
      name: "箱",
      symbol: "箱",
      base_unit_id: BASE_UNIT_ID,
      conversion_factor: "12",
      status: "active",
      sort_order: 100,
      created_by_employee_id: EMPLOYEE_ID,
      updated_by_employee_id: EMPLOYEE_ID,
    });

    expect(requests).toHaveLength(3);
    for (const request of requests) {
      expect(request.method).toBe("POST");
      expect(new URL(request.url).searchParams.get("select")).not.toContain("*");
      expect(await request.clone().json()).toMatchObject({
        created_by_employee_id: EMPLOYEE_ID,
        updated_by_employee_id: EMPLOYEE_ID,
      });
    }
    expect(new URL(requests[2]!.url).searchParams.get("select"))
      .toContain("conversion_factor::text");
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
    expect(new URL(requests[2]!.url).searchParams.get("select"))
      .toContain("conversion_factor::text");
  });

  test("wraps invalid rows and Supabase failures as database errors", async () => {
    const invalid = await createRepository(() => ({ body: [{}], count: 1 }));
    await expect(invalid.repository.listBrands({
      page: 1,
      pageSize: 20,
    })).rejects.toMatchObject({ code: "DB_ERROR" });

    const failed = await createRepository(() => ({
      body: {
        code: "23505",
        message: "duplicate key value violates unique constraint",
      },
      status: 409,
    }));
    await expect(failed.repository.createBrand({
      code: "BR-001",
      name: "重复品牌",
      status: "active",
      sort_order: 100,
      created_by_employee_id: EMPLOYEE_ID,
      updated_by_employee_id: EMPLOYEE_ID,
    })).rejects.toMatchObject({
      code: "DB_ERROR",
      details: expect.objectContaining({ code: "23505" }),
    });
  });

  test("rejects numeric conversion factors instead of returning false precision", async () => {
    const numeric = await createRepository(() => ({
      body: [{
        ...unit,
        conversion_factor: 999999999999.123456,
      }],
      count: 1,
    }));

    await expect(numeric.repository.listUnits({
      page: 1,
      pageSize: 20,
    })).rejects.toMatchObject({ code: "DB_ERROR" });
  });
});

const audit = {
  version: 1,
  created_at: NOW,
  updated_at: NOW,
};
const category = {
  id: CATEGORY_ID,
  parent_id: null,
  code: "CAT-001",
  name: "主材",
  level: 1,
  status: "active",
  sort_order: 100,
  ...audit,
};
const brand = {
  id: BRAND_ID,
  code: "BR-001",
  name: "雨虹",
  legal_name: null,
  logo_file_id: null,
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
  conversion_factor: PRECISE_FACTOR,
  status: "active",
  sort_order: 100,
  ...audit,
};
