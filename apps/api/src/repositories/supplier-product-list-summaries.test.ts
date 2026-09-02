import { describe, expect, test } from "bun:test";
import { createClient } from "@supabase/supabase-js";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const SUPPLIER_ID = "40000000-0000-4000-8000-000000000001";
const PRODUCT_ID = "40000000-0000-4000-8000-000000000002";
const TENANT_ID = "40000000-0000-4000-8000-000000000005";
const CATEGORY_ID = "40000000-0000-4000-8000-000000000010";
const BRAND_ID = "40000000-0000-4000-8000-000000000011";
const SKU_ID = "40000000-0000-4000-8000-000000000012";
const TENANT_SUPPLIER_ID = "40000000-0000-4000-8000-000000000013";
const COST_CATEGORY_ID = "40000000-0000-4000-8000-000000000014";
const PRICE_LIST_ID = "40000000-0000-4000-8000-000000000015";
const PRICE_ITEM_ID = "40000000-0000-4000-8000-000000000016";
const PARENT_CATEGORY_ID = "40000000-0000-4000-8000-000000000017";

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

describe("SupplierProductsRepository list summaries", () => {
  test("attaches effective cost category summaries to tenant product lists", async () => {
    const { repository } = await repositoryFor((request) => {
      const url = new URL(request.url);
      if (url.pathname.endsWith("/rpc/list_supplier_product_sku_counts")) {
        return { body: [] };
      }
      if (url.pathname.endsWith("/tenant_catalog_cost_category_rules")) {
        return {
          body: [{
            rule_scope: "product",
            catalog_category_id: null,
            supplier_product_id: PRODUCT_ID,
            cost_category_id: COST_CATEGORY_ID,
          }],
        };
      }
      if (url.pathname.endsWith("/finance_cost_categories")) {
        return { body: [{ id: COST_CATEGORY_ID, name: "主材" }] };
      }
      return { body: [product], count: 1 };
    });

    const result = await repository.listProducts({
      supplier_id: SUPPLIER_ID,
      tenant_id: TENANT_ID,
      page: 1,
      pageSize: 20,
    });

    expect(result.list[0]).toMatchObject({
      default_cost_category_id: COST_CATEGORY_ID,
      default_cost_category_name: "主材",
      cost_category_source: "product",
    });
  });

  test("attaches current published price summaries to tenant SKU lists", async () => {
    const { repository, requests } = await repositoryFor((request) => {
      const url = new URL(request.url);
      if (url.pathname.endsWith("/supplier_price_list_items")) {
        return {
          body: [{
            id: PRICE_ITEM_ID,
            supplier_sku_id: SKU_ID,
            supplier_price_list_id: PRICE_LIST_ID,
            minimum_quantity: "1.000000",
            unit_price: "88.00",
            tax_rate: "0.130000",
            tax_inclusive: false,
            price_list: {
              id: PRICE_LIST_ID,
              version_number: 2,
              row_version: 5,
              effective_from: "2026-08-20T00:00:00.000Z",
              effective_until: null,
            },
          }],
        };
      }
      return { body: [sku], count: 1 };
    });

    const result = await repository.listSkus({
      supplier_id: SUPPLIER_ID,
      supplier_product_id: PRODUCT_ID,
      tenant_id: TENANT_ID,
      tenant_supplier_id: TENANT_SUPPLIER_ID,
      page: 1,
      pageSize: 20,
    });

    expect(result.list[0]?.current_price).toEqual({
      supplier_price_list_id: PRICE_LIST_ID,
      supplier_price_list_version: 2,
      supplier_price_list_row_version: 5,
      supplier_price_list_item_id: PRICE_ITEM_ID,
      unit_price: "88.00",
      tax_rate: "0.130000",
      tax_inclusive: false,
      effective_from: "2026-08-20T00:00:00.000Z",
      effective_until: null,
    });
    const priceUrl = new URL(requests.at(-1)!.url);
    expect(priceUrl.pathname).toEndWith("/supplier_price_list_items");
    expect(priceUrl.searchParams.get("supplier_sku_id")).toBe(`in.(${SKU_ID})`);
    expect(priceUrl.searchParams.get("price_list.tenant_supplier_id"))
      .toBe(`eq.${TENANT_SUPPLIER_ID}`);
    expect(priceUrl.searchParams.get("price_list.lifecycle_status"))
      .toBe("eq.published");
    expect(priceUrl.searchParams.get("price_list.price_list_code"))
      .toBe("eq.DEFAULT");
    expect(priceUrl.searchParams.get("price_list.order"))
      .toContain("effective_from.desc");
  });

  test("keeps ancestor category defaults when the ancestor is also on the current page", async () => {
    const { repository } = await repositoryFor((request) => {
      const url = new URL(request.url);
      if (url.pathname.endsWith("/rpc/list_supplier_product_sku_counts")) {
        return { body: [] };
      }
      if (url.pathname.endsWith("/catalog_categories")) {
        return { body: [{ id: PARENT_CATEGORY_ID, parent_id: null }] };
      }
      if (url.pathname.endsWith("/tenant_catalog_cost_category_rules")) {
        return url.searchParams.get("rule_scope") === "eq.category"
          ? {
            body: [{
              rule_scope: "category",
              catalog_category_id: PARENT_CATEGORY_ID,
              supplier_product_id: null,
              cost_category_id: COST_CATEGORY_ID,
            }],
          }
          : { body: [] };
      }
      if (url.pathname.endsWith("/finance_cost_categories")) {
        return { body: [{ id: COST_CATEGORY_ID, name: "辅材" }] };
      }
      return {
        body: [
          { ...product, category: parentCategory },
          { ...product, id: "40000000-0000-4000-8000-000000000018", category: childCategory },
        ],
        count: 2,
      };
    });

    const result = await repository.listProducts({
      supplier_id: SUPPLIER_ID,
      tenant_id: TENANT_ID,
      page: 1,
      pageSize: 20,
    });

    expect(result.list[1]).toMatchObject({
      default_cost_category_name: "辅材",
      cost_category_source: "ancestor",
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
  category: { id: CATEGORY_ID, code: "CAT", name: "瓷砖", status: "active" },
  brand: { id: BRAND_ID, code: "BRAND", name: "品牌", status: "active" },
  updated_at: "2026-07-29T00:00:00.000Z",
};

const parentCategory = {
  id: PARENT_CATEGORY_ID,
  code: "PARENT",
  name: "材料",
  status: "active",
  parent_id: null,
};

const childCategory = {
  id: CATEGORY_ID,
  code: "CHILD",
  name: "瓷砖",
  status: "active",
  parent_id: PARENT_CATEGORY_ID,
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
