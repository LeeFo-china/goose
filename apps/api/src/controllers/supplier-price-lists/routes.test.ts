import { beforeEach, describe, expect, mock, test } from "bun:test";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const TENANT_ID = "71000000-0000-4000-8000-000000000001";
const TENANT_SUPPLIER_ID = "71000000-0000-4000-8000-000000000002";
const PRICE_LIST_ID = "71000000-0000-4000-8000-000000000003";
const auth = { tenantId: TENANT_ID };
const updateDraft = mock(async (..._args: unknown[]) => ({ status: "updated" }));

mock.module("@/services/supplier-price-lists", () => ({
  supplierPriceListsService: {
    listPriceLists: mock(async () => ({})),
    getPriceList: mock(async () => ({})),
    create: mock(async () => ({})),
    updateDraft,
    listItems: mock(async () => ({})),
    upsertItem: mock(async () => ({})),
    deleteItem: mock(async () => ({})),
    publish: mock(async () => ({})),
    createVersion: mock(async () => ({})),
    retire: mock(async () => ({})),
  },
}));

async function controller() {
  const { default: value } = await import(".");
  Object.defineProperty(value, "getRequiredTenantContext", {
    configurable: true,
    value: mock(async () => auth),
  });
  return value;
}

describe("SupplierPriceListsController routes", () => {
  beforeEach(() => updateDraft.mockClear());

  test("registers explicit draft, item and lifecycle routes", async () => {
    const value = await controller();
    const routes: string[] = [];
    const register = (method: string) => (path: string) =>
      routes.push(`${method} ${path}`);

    value.registerExtraRoutes({
      get: register("GET"),
      post: register("POST"),
      patch: register("PATCH"),
      put: register("PUT"),
      delete: register("DELETE"),
    } as never);

    expect(routes).toEqual([
      "GET /supplier-price-lists",
      "GET /supplier-price-lists/:id",
      "POST /supplier-price-lists/:id",
      "PATCH /supplier-price-lists/:id",
      "GET /supplier-price-lists/:id/items",
      "PUT /supplier-price-lists/:id/items/:itemId",
      "DELETE /supplier-price-lists/:id/items/:itemId",
      "POST /supplier-price-lists/:id/publish",
      "POST /supplier-price-lists/:id/new-version",
      "POST /supplier-price-lists/:id/retire",
    ]);
  });

  test("requires and forwards idempotency for draft updates", async () => {
    const value = await controller() as unknown as {
      updatePriceList: (request: unknown) => Promise<unknown>;
    };

    await value.updatePriceList({
      params: { id: PRICE_LIST_ID },
      query: { tenantSupplierId: TENANT_SUPPLIER_ID },
      headers: { "idempotency-key": "price:update" },
      body: { expected_version: 1, name: "租户采购价" },
    });

    expect(updateDraft).toHaveBeenCalledWith(
      auth,
      TENANT_SUPPLIER_ID,
      PRICE_LIST_ID,
      { expected_version: 1, name: "租户采购价" },
      "price:update",
    );
  });

  test("rejects draft updates without an idempotency key", async () => {
    const value = await controller() as unknown as {
      updatePriceList: (request: unknown) => Promise<unknown>;
    };

    await expect(value.updatePriceList({
      params: { id: PRICE_LIST_ID },
      query: { tenantSupplierId: TENANT_SUPPLIER_ID },
      headers: {},
      body: {
        expected_version: 1,
        name: "租户采购价",
        proxy_reason: "兼容旧版后台请求",
      },
    })).rejects.toMatchObject({ statusCode: 400 });
  });
});
