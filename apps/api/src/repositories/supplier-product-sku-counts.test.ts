import { describe, expect, test } from "bun:test";
import { createClient } from "@supabase/supabase-js";

import { attachProductSkuCounts } from "./supplier-product-sku-counts";
import type { SupplierProductRow } from "./supplier-products-model";

const SUPPLIER_ID = "40000000-0000-4000-8000-000000000001";
const PRODUCT_ID = "40000000-0000-4000-8000-000000000002";
const TENANT_ID = "40000000-0000-4000-8000-000000000005";

describe("attachProductSkuCounts", () => {
  test("loads current-page SKU totals in one bounded ownership-scoped batch", async () => {
    const calls: Array<{ name: string; params: Record<string, unknown> }> = [];
    const client = {
      rpc: async (name: string, params: Record<string, unknown>) => {
        calls.push({ name, params });
        return {
          data: [{
            supplier_product_id: PRODUCT_ID,
            sku_count: 3,
            active_sku_count: 1,
          }],
          error: null,
        };
      },
    };

    const result = await attachProductSkuCounts(
      client as never,
      SUPPLIER_ID,
      [product],
      { ownershipScope: "tenant", tenantId: TENANT_ID },
    );

    expect(result[0]).toMatchObject({
      id: PRODUCT_ID,
      sku_count: 3,
      active_sku_count: 1,
    });
    expect(calls).toEqual([{
      name: "list_supplier_product_sku_counts",
      params: {
        p_supplier_id: SUPPLIER_ID,
        p_product_ids: [PRODUCT_ID],
        p_ownership_scope: "tenant",
        p_tenant_id: TENANT_ID,
      },
    }]);
  });

  test("internal product validation skips the SKU aggregate query", async () => {
    const requests: Request[] = [];
    const fetchStub = (async (
      input: string | URL | Request,
      init?: RequestInit,
    ) => {
      const request = input instanceof Request
        ? input
        : new Request(input.toString(), init);
      requests.push(request);
      return new Response(JSON.stringify(product), {
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;
    const client = createClient("http://127.0.0.1:54321", "test-key", {
      global: { fetch: fetchStub },
    });
    const { SupplierProductsRepository } = await import("./supplier-products");
    const repository = new SupplierProductsRepository(() => client as never);

    const result = await repository.findProduct(
      SUPPLIER_ID,
      PRODUCT_ID,
      TENANT_ID,
      false,
    );

    expect(result).toMatchObject({ sku_count: 0, active_sku_count: 0 });
    expect(requests).toHaveLength(1);
    expect(new URL(requests[0]!.url).pathname).not.toContain("/rpc/");
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
  ownership_scope: "tenant",
  owner_tenant_id: TENANT_ID,
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
} satisfies SupplierProductRow;
