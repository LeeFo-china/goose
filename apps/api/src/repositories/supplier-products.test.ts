import { describe, expect, test } from "bun:test";
import { createClient } from "@supabase/supabase-js";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const SUPPLIER_ID = "40000000-0000-4000-8000-000000000001";
const PRODUCT_ID = "40000000-0000-4000-8000-000000000002";
const USER_ID = "40000000-0000-4000-8000-000000000003";
const EMPLOYEE_ID = "40000000-0000-4000-8000-000000000004";
const TENANT_ID = "40000000-0000-4000-8000-000000000005";
const CATEGORY_ID = "40000000-0000-4000-8000-000000000010";
const BRAND_ID = "40000000-0000-4000-8000-000000000011";
const SKU_ID = "40000000-0000-4000-8000-000000000012";
const TENANT_SUPPLIER_ID = "40000000-0000-4000-8000-000000000013";
const PRODUCT_READ_SCOPE_FILTER =
  `(ownership_scope.eq.platform,and(ownership_scope.eq.tenant,owner_tenant_id.eq.${TENANT_ID}))`;

async function repositoryFor(
  responder: (request: Request) => {
    body: unknown;
    count?: number;
    status?: number;
  },
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
  const { SupplierProductsRepository } = await import("./supplier-products");
  return {
    repository: new SupplierProductsRepository(() => client as never),
    requests,
  };
}

describe("SupplierProductsRepository", () => {
  test("paginates the exact platform plus current-tenant product scope", async () => {
    const { repository, requests } = await repositoryFor((request) =>
      new URL(request.url).pathname.includes("/rpc/")
        ? { body: [] }
        : { body: [product], count: 21 });

    const result = await repository.listProducts({
      supplier_id: SUPPLIER_ID,
      tenant_id: TENANT_ID,
      page: 2,
      pageSize: 20,
    });

    expect(result.pagination.totalPages).toBe(2);
    const url = new URL(requests[0]!.url);
    expect(url.searchParams.get("supplier_id")).toBe(`eq.${SUPPLIER_ID}`);
    expect(url.searchParams.get("or")).toBe(PRODUCT_READ_SCOPE_FILTER);
    expect(url.searchParams.get("offset")).toBe("20");
    expect(url.searchParams.get("limit")).toBe("20");
    expect(url.searchParams.get("select")).toContain("ownership_scope");
    expect(url.searchParams.get("select")).not.toContain("unit_price");
    expect(url.searchParams.get("select")).not.toContain("*");
    expect(requests[0]!.headers.get("prefer")).toContain("count=exact");
  });

  test("tenant scopes product details and SKU lists without legacy rows", async () => {
    const { repository, requests } = await repositoryFor((request) => {
      const url = new URL(request.url);
      if (url.pathname.includes("/rpc/")) return { body: [] };
      return {
        body: request.url.includes("supplier_skus") ? [] : product,
        count: 0,
      };
    });

    await repository.findProduct(SUPPLIER_ID, PRODUCT_ID, TENANT_ID);
    await repository.listSkus({
      supplier_id: SUPPLIER_ID,
      supplier_product_id: PRODUCT_ID,
      tenant_id: TENANT_ID,
      page: 1,
      pageSize: 20,
    });

    for (const request of requests.filter((item) =>
      !new URL(item.url).pathname.includes("/rpc/"))) {
      const url = new URL(request.url);
      expect(url.searchParams.get("supplier_id")).toBe(`eq.${SUPPLIER_ID}`);
      expect(url.searchParams.get("or")).toBe(PRODUCT_READ_SCOPE_FILTER);
      expect(url.searchParams.get("select")).not.toContain("*");
    }
    expect(new URL(requests[2]!.url).searchParams.get("select"))
      .toContain("spec_values");
  });

  test("preserves legacy NULL spec values without failing the whole SKU page", async () => {
    const { repository } = await repositoryFor(() => ({
      body: [{ ...sku, spec_values: null }],
      count: 1,
    }));

    const result = await repository.listSkus({
      supplier_id: SUPPLIER_ID,
      supplier_product_id: PRODUCT_ID,
      tenant_id: TENANT_ID,
      page: 1,
      pageSize: 20,
    });

    expect(result.list[0]?.spec_values).toBeNull();
  });

  test("searches SKU keywords by sku_code instead of product_code", async () => {
    const { repository, requests } = await repositoryFor(() => ({
      body: [],
      count: 0,
    }));

    await repository.listSkus({
      supplier_id: SUPPLIER_ID,
      supplier_product_id: PRODUCT_ID,
      tenant_id: TENANT_ID,
      keyword: "SKU-1",
      page: 1,
      pageSize: 20,
    });

    const filter = new URL(requests[0]!.url).searchParams.getAll("or").join("|");
    expect(filter).toContain("sku_code.ilike.%SKU-1%");
    expect(filter).not.toContain("product_code");
  });

  test("reads at most 100 current conversion edges after a scoped SKU lookup", async () => {
    const { repository, requests } = await repositoryFor((request) => ({
      body: request.url.includes("supplier_sku_unit_conversions")
        ? [conversion]
        : sku,
    }));

    const result = await repository.listSkuUnitConversions({
      supplier_id: SUPPLIER_ID,
      supplier_product_id: PRODUCT_ID,
      sku_id: SKU_ID,
      tenant_id: TENANT_ID,
    });

    expect(result).toEqual([conversion]);
    const skuUrl = new URL(requests[0]!.url);
    expect(skuUrl.pathname).toEndWith("/supplier_skus");
    expect(skuUrl.searchParams.get("supplier_id")).toBe(`eq.${SUPPLIER_ID}`);
    expect(skuUrl.searchParams.get("supplier_product_id")).toBe(`eq.${PRODUCT_ID}`);
    expect(skuUrl.searchParams.get("id")).toBe(`eq.${SKU_ID}`);
    expect(skuUrl.searchParams.get("or")).toBe(PRODUCT_READ_SCOPE_FILTER);

    const conversionUrl = new URL(requests[1]!.url);
    expect(conversionUrl.pathname).toEndWith("/supplier_sku_unit_conversions");
    expect(conversionUrl.searchParams.get("supplier_sku_id")).toBe(`eq.${SKU_ID}`);
    expect(conversionUrl.searchParams.get("status")).toBe("eq.active");
    expect(conversionUrl.searchParams.get("limit")).toBe("100");
    expect(conversionUrl.searchParams.get("select")).not.toContain("*");
  });

  test("platform conversion reads cannot resolve a tenant SKU", async () => {
    const { repository, requests } = await repositoryFor((request) => ({
      body: request.url.includes("supplier_sku_unit_conversions")
        ? [conversion]
        : sku,
    }));

    await repository.listPlatformSkuUnitConversions({
      supplier_id: SUPPLIER_ID,
      supplier_product_id: PRODUCT_ID,
      sku_id: SKU_ID,
    });

    const skuUrl = new URL(requests[0]!.url);
    expect(skuUrl.searchParams.get("ownership_scope")).toBe("eq.platform");
    expect(skuUrl.searchParams.get("owner_tenant_id")).toBe("is.null");
  });

  test("writes tenant products only through the audited v2 command", async () => {
    const { repository, requests } = await repositoryFor(() => ({
      body: { status: "updated", idempotent: false, version: 2 },
    }));

    await repository.createProduct({
      product_id: PRODUCT_ID,
      supplier_id: SUPPLIER_ID,
      tenant_id: TENANT_ID,
      tenant_supplier_id: TENANT_SUPPLIER_ID,
      product_code: "P-1",
      name: "瓷砖",
      category_id: CATEGORY_ID,
      brand_id: BRAND_ID,
      description: null,
      actor_user_id: USER_ID,
      actor_employee_id: EMPLOYEE_ID,
      idempotency_key: "product:create",
    });
    await repository.updateProduct({
      supplier_id: SUPPLIER_ID,
      tenant_id: TENANT_ID,
      tenant_supplier_id: TENANT_SUPPLIER_ID,
      product_id: PRODUCT_ID,
      expected_version: 1,
      name: "防滑瓷砖",
      actor_user_id: USER_ID,
      actor_employee_id: EMPLOYEE_ID,
      idempotency_key: "product:update",
    });

    expect(requests).toHaveLength(2);
    expect(requests.every((request) =>
      new URL(request.url).pathname.endsWith("/rpc/command_supplier_product_v2")
    )).toBe(true);
    expect(await requests[0]!.clone().json()).toMatchObject({
      p_action: "create",
      p_ownership_scope: "tenant",
      p_tenant_id: TENANT_ID,
      p_tenant_supplier_id: TENANT_SUPPLIER_ID,
      p_supplier_id: SUPPLIER_ID,
      p_product_id: PRODUCT_ID,
      p_idempotency_key: "product:create",
    });
    expect(await requests[1]!.clone().json()).toMatchObject({
      p_action: "update",
      p_expected_version: 1,
      p_idempotency_key: "product:update",
    });
  });

  test("maps the atomic product category guard to a stable conflict", async () => {
    const { repository } = await repositoryFor(() => ({
      status: 400,
      body: {
        code: "P0001",
        message: "PRODUCT_CATEGORY_CHANGE_REQUIRES_SKU_MIGRATION",
        details: null,
        hint: null,
      },
    }));

    await expect(repository.updateProduct({
      supplier_id: SUPPLIER_ID,
      tenant_id: TENANT_ID,
      tenant_supplier_id: TENANT_SUPPLIER_ID,
      product_id: PRODUCT_ID,
      expected_version: 1,
      category_id: CATEGORY_ID,
      actor_user_id: USER_ID,
      actor_employee_id: EMPLOYEE_ID,
      idempotency_key: "product:category",
    })).rejects.toMatchObject({
      statusCode: 409,
      code: "PRODUCT_CATEGORY_CHANGE_REQUIRES_SKU_MIGRATION",
      message: "商品已有 SKU，变更分类前必须先迁移 SKU 规格",
    });
  });

  test("writes tenant SKUs only through the system-code v3 command", async () => {
    const { repository, requests } = await repositoryFor(() => ({
      body: { status: "updated", idempotent: false, version: 3 },
    }));

    await repository.updateSku({
      supplier_id: SUPPLIER_ID,
      tenant_id: TENANT_ID,
      tenant_supplier_id: TENANT_SUPPLIER_ID,
      supplier_product_id: PRODUCT_ID,
      sku_id: SKU_ID,
      expected_version: 2,
      name: "新 SKU 名称",
      spec_values: { size: "600×600" },
      actor_user_id: USER_ID,
      actor_employee_id: EMPLOYEE_ID,
      idempotency_key: "sku:update",
    });
    await repository.mutateSku({
      supplier_id: SUPPLIER_ID,
      tenant_id: TENANT_ID,
      tenant_supplier_id: TENANT_SUPPLIER_ID,
      product_id: PRODUCT_ID,
      sku_id: SKU_ID,
      action: "activate",
      expected_version: 3,
      actor_user_id: USER_ID,
      actor_employee_id: EMPLOYEE_ID,
      idempotency_key: "sku:activate",
    });

    expect(requests.every((request) =>
      new URL(request.url).pathname.endsWith("/rpc/command_supplier_sku_v3")
    )).toBe(true);
    expect(await requests[0]!.clone().json()).toMatchObject({
      p_action: "update",
      p_ownership_scope: "tenant",
      p_supplier_product_id: PRODUCT_ID,
      p_sku_id: SKU_ID,
      p_expected_version: 2,
    });
  });

  test("platform reads are strictly platform-owned and paginated", async () => {
    const { repository, requests } = await repositoryFor((request) => {
      const url = new URL(request.url);
      if (url.pathname.includes("/rpc/")) return { body: [] };
      return {
        body: request.url.includes(`id=eq.${PRODUCT_ID}`) ? product : [product],
        count: 1,
      };
    });
    const platformRepository = repository as unknown as {
      listPlatformProducts: (input: Record<string, unknown>) => Promise<unknown>;
      findPlatformProduct: (
        supplierId: string,
        productId: string,
      ) => Promise<unknown>;
    };

    expect(typeof platformRepository.listPlatformProducts).toBe("function");
    await platformRepository.listPlatformProducts({
      supplier_id: SUPPLIER_ID,
      page: 1,
      pageSize: 20,
    });
    await platformRepository.findPlatformProduct(SUPPLIER_ID, PRODUCT_ID);

    for (const request of requests.filter((item) =>
      !new URL(item.url).pathname.includes("/rpc/"))) {
      const url = new URL(request.url);
      expect(url.searchParams.get("supplier_id")).toBe(`eq.${SUPPLIER_ID}`);
      expect(url.searchParams.get("ownership_scope")).toBe("eq.platform");
      expect(url.searchParams.get("owner_tenant_id")).toBe("is.null");
      expect(url.searchParams.get("select")).not.toContain("*");
    }
    const countRequests = requests.filter((item) =>
      new URL(item.url).pathname.endsWith("/rpc/list_supplier_product_sku_counts")
    );
    expect(countRequests).toHaveLength(2);
    for (const request of countRequests) {
      expect(await request.clone().json()).toMatchObject({
        p_ownership_scope: "platform",
        p_tenant_id: null,
      });
    }
  });

  test("replaces SKU conversions through the replay-safe v3 command", async () => {
    const { repository, requests } = await repositoryFor(() => ({
      body: { status: "updated", idempotent: false, version: 4 },
    }));
    const commandRepository = repository as unknown as {
      replaceSkuUnitConversions: (
        input: Record<string, unknown>,
      ) => Promise<unknown>;
    };

    expect(typeof commandRepository.replaceSkuUnitConversions).toBe("function");
    await commandRepository.replaceSkuUnitConversions({
      ownership_scope: "tenant",
      tenant_id: TENANT_ID,
      tenant_supplier_id: TENANT_SUPPLIER_ID,
      supplier_id: SUPPLIER_ID,
      product_id: PRODUCT_ID,
      sku_id: SKU_ID,
      expected_version: 3,
      purchase_unit_id: CATEGORY_ID,
      base_unit_id: BRAND_ID,
      conversions: [{
        from_unit_id: CATEGORY_ID,
        to_unit_id: BRAND_ID,
        factor: "8",
      }],
      actor_user_id: USER_ID,
      actor_employee_id: EMPLOYEE_ID,
      idempotency_key: "sku:conversions",
    });

    const request = requests[0]!;
    expect(new URL(request.url).pathname).toEndWith(
      "/rpc/replace_supplier_sku_unit_conversions_v3",
    );
    expect(await request.clone().json()).toMatchObject({
      p_ownership_scope: "tenant",
      p_tenant_supplier_id: TENANT_SUPPLIER_ID,
      p_supplier_product_id: PRODUCT_ID,
      p_supplier_sku_id: SKU_ID,
      p_expected_sku_version: 3,
      p_purchase_unit_id: CATEGORY_ID,
      p_base_unit_id: BRAND_ID,
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
  ownership_scope: "platform",
  owner_tenant_id: null,
  category: {
    id: CATEGORY_ID,
    code: "CAT",
    name: "瓷砖",
    status: "active",
  },
  brand: {
    id: BRAND_ID,
    code: "BRAND",
    name: "品牌",
    status: "active",
  },
  updated_at: "2026-07-29T00:00:00.000Z",
};

const sku = {
  id: SKU_ID,
  supplier_id: SUPPLIER_ID,
  supplier_product_id: PRODUCT_ID,
  sku_code: "SKU-1",
  name: "瓷砖 SKU",
  specification: null,
  model: null,
  spec_values: { size: "600×600" },
  purchase_unit_id: CATEGORY_ID,
  base_unit_id: CATEGORY_ID,
  base_unit_conversion: "1.00000000",
  batch_managed: false,
  color_managed: false,
  serial_managed: false,
  status: "draft",
  version: 1,
  ownership_scope: "tenant",
  owner_tenant_id: TENANT_ID,
  purchase_unit: {
    id: CATEGORY_ID,
    code: "BOX",
    name: "箱",
    symbol: "箱",
    status: "active",
  },
  base_unit: {
    id: CATEGORY_ID,
    code: "BOX",
    name: "箱",
    symbol: "箱",
    status: "active",
  },
  updated_at: "2026-08-19T00:00:00.000Z",
};

const conversion = {
  from_unit_id: CATEGORY_ID,
  to_unit_id: BRAND_ID,
  factor: "8.000000",
  from_unit: {
    id: CATEGORY_ID,
    code: "BOX",
    name: "箱",
    symbol: "箱",
    unit_dimension: "count",
  },
  to_unit: {
    id: BRAND_ID,
    code: "PIECE",
    name: "片",
    symbol: "片",
    unit_dimension: "count",
  },
};
