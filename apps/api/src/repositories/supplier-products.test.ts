import { describe, expect, test } from "bun:test";
import { createClient } from "@supabase/supabase-js";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const SUPPLIER_ID = "40000000-0000-4000-8000-000000000001";
const PRODUCT_ID = "40000000-0000-4000-8000-000000000002";
const SKU_ID = "40000000-0000-4000-8000-000000000012";
const USER_ID = "40000000-0000-4000-8000-000000000003";
const EMPLOYEE_ID = "40000000-0000-4000-8000-000000000004";
const TENANT_ID = "40000000-0000-4000-8000-000000000005";

async function repositoryFor(
  responder: (request: Request) => { body: unknown; count?: number },
) {
  const requests: Request[] = [];
  const fetchStub = (async (
    input: string | URL | Request,
    init?: RequestInit,
  ) => {
    const request = input instanceof Request
      ? input
      : new Request(input.toString(), init);
    requests.push(request);
    const response = responder(request);
    return new Response(JSON.stringify(response.body), {
      status: 200,
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
  const { SupplierProductsRepository } = await import("./supplier-products");
  return {
    repository: new SupplierProductsRepository(() => client as never),
    requests,
  };
}

describe("SupplierProductsRepository", () => {
  test("paginates products under the server-derived supplier id", async () => {
    const { repository, requests } = await repositoryFor(() => ({
      body: [product],
      count: 21,
    }));

    const result = await repository.listProducts({
      supplier_id: SUPPLIER_ID,
      tenant_id: TENANT_ID,
      page: 2,
      pageSize: 20,
    });

    expect(result.pagination.totalPages).toBe(2);
    const url = new URL(requests[0]!.url);
    expect(url.searchParams.get("supplier_id")).toBe(`eq.${SUPPLIER_ID}`);
    expect(url.searchParams.get("offset")).toBe("20");
    expect(url.searchParams.get("limit")).toBe("20");
    expect(url.searchParams.get("select")).not.toContain("unit_price");
    expect(requests[0]!.headers.get("prefer")).toContain("count=exact");
  });

  test("creates products only through the idempotent RPC", async () => {
    const { repository, requests } = await repositoryFor(() => ({
      body: {
        status: "created",
        idempotent: false,
        product,
        version: 1,
      },
    }));

    await repository.createProduct({
      product_id: PRODUCT_ID,
      supplier_id: SUPPLIER_ID,
      tenant_id: TENANT_ID,
      product_code: "P-1",
      name: "瓷砖",
      category_id: product.category.id,
      brand_id: product.brand.id,
      description: null,
      actor_user_id: USER_ID,
      actor_employee_id: EMPLOYEE_ID,
      idempotency_key: "product:create",
      proxy_reason: "供应商资料代录",
    });

    const request = requests[0]!;
    expect(new URL(request.url).pathname).toEndWith(
      "/rpc/create_supplier_product",
    );
    expect(await request.clone().json()).toMatchObject({
      p_supplier_id: SUPPLIER_ID,
      p_product_id: PRODUCT_ID,
      p_idempotency_key: "product:create",
    });
  });

  test("reports a SKU-specific conflict when an optimistic update misses", async () => {
    const { repository, requests } = await repositoryFor(() => ({ body: null }));

    await expect(repository.updateSku({
      supplier_id: SUPPLIER_ID,
      supplier_product_id: PRODUCT_ID,
      sku_id: SKU_ID,
      expected_version: 2,
      name: "新 SKU 名称",
    })).rejects.toMatchObject({
      statusCode: 409,
      code: "SUPPLIER_SKU_VERSION_CONFLICT",
    });
    expect(
      new URL(requests[0]!.url).searchParams.get("supplier_product_id"),
    ).toBe(`eq.${PRODUCT_ID}`);
  });

  test("mutates a SKU through the parent-validating command", async () => {
    const { repository, requests } = await repositoryFor(() => ({
      body: { status: "updated", idempotent: false, version: 2 },
    }));

    await repository.mutateSku({
      supplier_id: SUPPLIER_ID,
      tenant_id: TENANT_ID,
      product_id: PRODUCT_ID,
      sku_id: SKU_ID,
      action: "activate",
      expected_version: 1,
      actor_user_id: USER_ID,
      actor_employee_id: EMPLOYEE_ID,
      idempotency_key: "sku:activate",
      proxy_reason: "供应商确认启用",
    });

    const request = requests[0]!;
    expect(new URL(request.url).pathname).toEndWith(
      "/rpc/mutate_supplier_sku_for_product",
    );
    expect(await request.clone().json()).toMatchObject({
      p_product_id: PRODUCT_ID,
      p_sku_id: SKU_ID,
    });
  });
});

const product = {
  id: PRODUCT_ID,
  supplier_id: SUPPLIER_ID,
  product_code: "P-1",
  name: "瓷砖",
  description: null,
  status: "draft",
  version: 1,
  category: {
    id: "40000000-0000-4000-8000-000000000010",
    code: "CAT",
    name: "瓷砖",
    status: "active",
  },
  brand: {
    id: "40000000-0000-4000-8000-000000000011",
    code: "BRAND",
    name: "品牌",
    status: "active",
  },
  updated_at: "2026-07-29T00:00:00.000Z",
};
