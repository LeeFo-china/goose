import { describe, expect, test } from "bun:test";
import { createClient } from "@supabase/supabase-js";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const TENANT_ID = "a1000000-0000-4000-8000-000000000001";
const CATEGORY_ID = "a1000000-0000-4000-8000-000000000002";
const AT = "2026-09-08T00:00:00.000Z";

async function repositoryFor(response: {
  body: unknown;
  count?: number;
  status?: number;
}) {
  const requests: Request[] = [];
  const fetchStub = (async (
    input: string | URL | Request,
    init?: RequestInit,
  ) => {
    const request = input instanceof Request
      ? input
      : new Request(input.toString(), init);
    requests.push(request);
    return new Response(JSON.stringify(response.body), {
      status: response.status ?? 200,
      headers: {
        "content-type": "application/json",
        ...(response.count === undefined
          ? {}
          : { "content-range": `0-0/${response.count}` }),
      },
    });
  }) as typeof fetch;
  const client = createClient("http://127.0.0.1:54321", "test-key", {
    global: { fetch: fetchStub },
  });
  const { SupplierPurchaseBatchCatalogRepository } = await import(
    "./supplier-purchase-batch-catalog"
  );
  return {
    repository: new SupplierPurchaseBatchCatalogRepository(
      () => client as never,
    ),
    requests,
  };
}

describe("SupplierPurchaseBatchCatalogRepository category options", () => {
  test("returns only whitelisted category fields from one bounded candidate query", async () => {
    const { repository, requests } = await repositoryFor({
      body: [{
        id: CATEGORY_ID,
        code: "MAIN",
        name: "主材",
        full_name: "材料 / 主材",
        status: "active",
        ownership_scope: "tenant",
        _products: [{ id: "product" }],
      }],
      count: 41,
    });

    const result = await repository.listCategoryOptions({
      tenant_id: TENANT_ID,
      priced_at: AT,
      keyword: "主材",
      page: 2,
      pageSize: 20,
    });

    expect(result).toEqual({
      list: [{
        id: CATEGORY_ID,
        code: "MAIN",
        name: "主材",
        full_name: "材料 / 主材",
        status: "active",
      }],
      pagination: { page: 2, pageSize: 20, total: 41, totalPages: 3 },
    });
    expect(requests).toHaveLength(1);
    const request = requests[0]!;
    const url = new URL(request.url);
    expect(url.pathname).toEndWith("/rest/v1/catalog_categories");
    expect(url.searchParams.get("select")).toContain(
      "id,code,name,full_name,status",
    );
    expect(url.searchParams.get("select")).toContain(
      "_products:supplier_products!supplier_products_category_id_fkey!inner",
    );
    expect(url.searchParams.get("select")).toContain("!inner");
    expect(url.searchParams.get("select")).not.toContain("*");
    expect(url.searchParams.get("status")).toBe("eq.active");
    expect(url.searchParams.get("is_leaf")).toBe("eq.true");
    const ownershipFilters = [...url.searchParams.entries()]
      .filter(([key, value]) =>
        key.endsWith("or") && value.includes("ownership_scope.eq.platform")
      )
      .map(([, value]) => value);
    expect(ownershipFilters).toHaveLength(4);
    expect(ownershipFilters.every((value) =>
      value.includes("owner_tenant_id.is.null") &&
      value.includes("ownership_scope.eq.tenant") &&
      value.includes(`owner_tenant_id.eq.${TENANT_ID}`)
    )).toBeTrue();
    expect(url.searchParams.get("_products.status")).toBe("eq.active");
    expect(url.searchParams.get("_products._price_items.tenant_id")).toBe(
      `eq.${TENANT_ID}`,
    );
    expect(url.searchParams.get("_products._price_items._sku.status")).toBe(
      "eq.active",
    );
    expect(
      url.searchParams.get(
        "_products._price_items._price_list.lifecycle_status",
      ),
    ).toBe("eq.published");
    expect(url.searchParams.get(
      "_products._price_items._price_list._relationship.relationship_status",
    )).toBe("eq.active");
    expect(url.searchParams.get(
      "_products._price_items._price_list._supplier.onboarding_status",
    )).toBe("eq.approved");
    expect(url.searchParams.get(
      "_products._price_items._price_list._supplier.operational_status",
    )).toBe("eq.active");
    expect(url.searchParams.get("offset")).toBe("20");
    expect(url.searchParams.get("limit")).toBe("20");
    expect(request.headers.get("prefer")).toContain("count=exact");
    expect(url.searchParams.getAll("or").some((value) =>
      value.includes("code.ilike") && value.includes("full_name.ilike")
    )).toBeTrue();
  });

  test("wraps database failures with the shared database error", async () => {
    const { repository } = await repositoryFor({
      body: { message: "database unavailable" },
      status: 500,
    });

    await expect(repository.listCategoryOptions({
      tenant_id: TENANT_ID,
      priced_at: AT,
      page: 1,
      pageSize: 20,
    })).rejects.toMatchObject({ statusCode: 500, code: "DB_ERROR" });
  });
});
