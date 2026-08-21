import { describe, expect, test } from "bun:test";
import { createClient } from "@supabase/supabase-js";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const CATEGORY_ID = "00000000-0000-4000-8000-000000000101";
const PARENT_ID = "00000000-0000-4000-8000-000000000102";
const BRAND_ID = "00000000-0000-4000-8000-000000000201";
const MAPPED_CATEGORY_ID = "00000000-0000-4000-8000-000000000202";
const MAPPED_BRAND_ID = "00000000-0000-4000-8000-000000000203";
const UNIT_ID = "00000000-0000-4000-8000-000000000301";
const BASE_UNIT_ID = "00000000-0000-4000-8000-000000000302";
const SECOND_UNIT_ID = "00000000-0000-4000-8000-000000000303";
const SECOND_BASE_UNIT_ID = "00000000-0000-4000-8000-000000000304";
const EMPLOYEE_ID = "00000000-0000-4000-8000-000000000401";
const USER_ID = "00000000-0000-4000-8000-000000000402";
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

  test("lists leaf categories across the complete hierarchy", async () => {
    const { repository, requests } = await createRepository(() => ({
      body: [category],
      count: 1,
    }));

    await repository.listCategories({
      is_leaf: true,
      page: 1,
      pageSize: 20,
    });

    const url = new URL(requests[0]!.url);
    expect(url.searchParams.get("is_leaf")).toBe("eq.true");
    expect(url.searchParams.has("parent_id")).toBe(false);
  });

  test("paginates brand and unit rows with explicit filters", async () => {
    const { repository, requests } = await createRepository((request) => {
      const url = new URL(request.url);
      if (request.url.includes("catalog_brands")) {
        return { body: [brand], count: 21 };
      }
      if (url.searchParams.get("id")?.startsWith("in.")) {
        return { body: [baseUnitProjection, secondBaseUnitProjection] };
      }
      return {
        body: [unitListItem, secondUnitListItem],
        count: 35,
      };
    });

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
    expect(units.list[0]?.base_unit).toEqual(baseUnitProjection);
    expect(units.list[1]?.base_unit).toEqual(secondBaseUnitProjection);
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
    expect(unitUrl.searchParams.get("select")).not.toContain("base_unit:");
    const baseUnitUrl = new URL(requests[2]!.url);
    expect(baseUnitUrl.searchParams.get("select"))
      .toBe("id,code,name,symbol,unit_dimension,status");
    expect(baseUnitUrl.searchParams.get("id")).toBe(
      `in.(${BASE_UNIT_ID},${SECOND_BASE_UNIT_ID})`,
    );
    expect(baseUnitUrl.searchParams.get("limit")).toBe("2");
    expect(requests).toHaveLength(3);
  });

  test("embeds stable mapped platform summaries with explicit selects", async () => {
    const tenantCategory = {
      ...category,
      ownership_scope: "tenant" as const,
      owner_tenant_id: USER_ID,
      mapped_platform_category_id: MAPPED_CATEGORY_ID,
      mapped_platform_category: {
        id: MAPPED_CATEGORY_ID,
        code: "PLATFORM-TILE",
        name: "地砖",
        full_name: "主材 / 瓷砖 / 地砖",
        status: "active" as const,
      },
    };
    const tenantBrand = {
      ...brand,
      ownership_scope: "tenant" as const,
      owner_tenant_id: USER_ID,
      mapped_platform_brand_id: MAPPED_BRAND_ID,
      mapped_platform_brand: {
        id: MAPPED_BRAND_ID,
        code: "PLATFORM-BRAND",
        name: "平台品牌",
        status: "active" as const,
      },
    };
    const { repository, requests } = await createRepository((request) => ({
      body: request.url.includes("catalog_categories")
        ? [tenantCategory]
        : [tenantBrand],
      count: 1,
    }));

    const categories = await repository.listCategories({ page: 1, pageSize: 20 });
    const brands = await repository.listBrands({ page: 1, pageSize: 20 });

    expect(categories.list[0]?.mapped_platform_category).toEqual(
      tenantCategory.mapped_platform_category,
    );
    expect(brands.list[0]?.mapped_platform_brand).toEqual(
      tenantBrand.mapped_platform_brand,
    );
    expect(new URL(requests[0]!.url).searchParams.get("select")).toContain(
      "mapped_platform_category:catalog_categories!catalog_categories_mapped_platform_category_id_fkey(id,code,name,full_name,status)",
    );
    expect(new URL(requests[1]!.url).searchParams.get("select")).toContain(
      "mapped_platform_brand:catalog_brands!catalog_brands_mapped_platform_brand_id_fkey(id,code,name,status)",
    );
  });

  test("filters base and derived unit pages without losing exact counts", async () => {
    const { repository, requests } = await createRepository((request) => {
      const url = new URL(request.url);
      if (url.searchParams.get("id")?.startsWith("in.")) {
        return { body: [baseUnitProjection] };
      }
      return {
        body: url.searchParams.get("base_unit_id") === "is.null"
          ? [baseUnitListItem]
          : [unitListItem],
        count: 41,
      };
    });

    const base = await repository.listUnits({
      unit_kind: "base",
      page: 1,
      pageSize: 20,
    });
    const derived = await repository.listUnits({
      unit_kind: "derived",
      page: 2,
      pageSize: 20,
    });

    expect(base.list[0]?.base_unit).toBeNull();
    expect(derived.list[0]?.base_unit?.name).toBe("件");
    expect(base.pagination.total).toBe(41);
    expect(derived.pagination).toEqual({
      page: 2,
      pageSize: 20,
      total: 41,
      totalPages: 3,
    });
    expect(new URL(requests[0]!.url).searchParams.get("base_unit_id"))
      .toBe("is.null");
    expect(new URL(requests[1]!.url).searchParams.get("base_unit_id"))
      .toBe("not.is.null");
    expect(new URL(requests[2]!.url).searchParams.get("id"))
      .toBe(`in.(${BASE_UNIT_ID})`);
    for (const request of requests.slice(0, 2)) {
      expect(request.headers.get("prefer")).toContain("count=exact");
    }
    expect(requests).toHaveLength(3);
  });

  test("wraps invalid list rows as database errors", async () => {
    const invalid = await createRepository(() => ({ body: [{}], count: 1 }));

    await expect(invalid.repository.listBrands({
      page: 1,
      pageSize: 20,
    })).rejects.toMatchObject({ code: "DB_ERROR" });
  });

  test("rejects numeric conversion factors instead of losing precision", async () => {
    const numeric = await createRepository(() => ({
      body: [{
        ...unitListItem,
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
  conversion_factor: PRECISE_FACTOR,
  unit_dimension: "quantity",
  status: "active",
  sort_order: 100,
  ...audit,
};
const baseUnitProjection = {
  id: BASE_UNIT_ID,
  code: "UNIT-PC",
  name: "件",
  symbol: "件",
  unit_dimension: "quantity",
  status: "active" as const,
};
const secondBaseUnitProjection = {
  id: SECOND_BASE_UNIT_ID,
  code: "UNIT-KG",
  name: "千克",
  symbol: "kg",
  unit_dimension: "weight",
  status: "active" as const,
};
const unitListItem = {
  ...unit,
};
const secondUnitListItem = {
  ...unit,
  id: SECOND_UNIT_ID,
  code: "UNIT-BAG",
  name: "袋",
  symbol: "袋",
  base_unit_id: SECOND_BASE_UNIT_ID,
};
const baseUnitListItem = {
  ...unit,
  id: BASE_UNIT_ID,
  base_unit_id: null,
  conversion_factor: "1.000000",
};
