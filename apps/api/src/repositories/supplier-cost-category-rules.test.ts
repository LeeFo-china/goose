import { describe, expect, test } from "bun:test";
import { createClient } from "@supabase/supabase-js";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const TENANT_ID = "21000000-0000-4000-8000-000000000001";
const COST_CATEGORY_ID = "21000000-0000-4000-8000-000000000002";

describe("SupplierCostCategoryRulesRepository", () => {
  test("filters active options before bounded pagination and omits codes", async () => {
    const requests: Request[] = [];
    const fetchStub = (async (input: string | URL | Request, init?: RequestInit) => {
      const request = input instanceof Request
        ? input
        : new Request(input.toString(), init);
      requests.push(request);
      return new Response(JSON.stringify([{
        id: COST_CATEGORY_ID,
        name: "主材",
      }]), {
        headers: {
          "content-type": "application/json",
          "content-range": "20-20/21",
        },
      });
    }) as typeof fetch;
    const client = createClient("http://127.0.0.1:54321", "test-key", {
      global: { fetch: fetchStub },
    });
    const { SupplierCostCategoryRulesRepository } = await import(
      "./supplier-cost-category-rules"
    );
    const repository = new SupplierCostCategoryRulesRepository(
      () => client as never,
    );

    const result = await repository.listCostCategories(TENANT_ID, {
      page: 2,
      pageSize: 20,
      keyword: "主材",
    });

    expect(result.list).toEqual([{ id: COST_CATEGORY_ID, name: "主材" }]);
    expect(result.pagination).toEqual({
      page: 2,
      pageSize: 20,
      total: 21,
      totalPages: 2,
    });
    const query = new URL(requests[0]!.url).searchParams;
    expect(query.get("select")).toBe("id,name");
    expect(query.get("tenant_id")).toBe(`eq.${TENANT_ID}`);
    expect(query.get("status")).toBe("eq.active");
    expect(query.get("name")).toBe("ilike.%主材%");
    expect(query.get("offset")).toBe("20");
    expect(query.get("limit")).toBe("20");
  });
});
