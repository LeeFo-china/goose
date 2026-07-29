import { beforeEach, describe, expect, mock, test } from "bun:test";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const emptyPage = {
  list: [],
  pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
};
const listOrders = mock(async () => emptyPage);
const getOrder = mock(async () => ({ id: ORDER_ID }));
const listItems = mock(async () => emptyPage);
const listCatalog = mock(async () => emptyPage);
const listProjectOptions = mock(async () => emptyPage);
const listSupplierOptions = mock(async () => emptyPage);
const saveDraft = mock(async () => ({ status: "saved" }));
const submit = mock(async () => ({ status: "submitted" }));
const cancel = mock(async () => ({ status: "cancelled" }));

mock.module("@/services/supplier-purchase-orders", () => ({
  supplierPurchaseOrdersService: {
    listOrders,
    getOrder,
    listItems,
    listCatalog,
    listProjectOptions,
    listSupplierOptions,
    saveDraft,
    submit,
    cancel,
  },
}));

const ORDER_ID = "62000000-0000-4000-8000-000000000001";
const PROJECT_ID = "62000000-0000-4000-8000-000000000002";
const RELATIONSHIP_ID = "62000000-0000-4000-8000-000000000003";
const SKU_ID = "62000000-0000-4000-8000-000000000004";
const auth = {
  authUserId: "62000000-0000-4000-8000-000000000005",
  employeeId: "62000000-0000-4000-8000-000000000006",
  tenantId: "62000000-0000-4000-8000-000000000007",
};

async function controller() {
  const { default: value } = await import(".");
  Object.defineProperty(value, "getRequiredTenantContext", {
    configurable: true,
    value: mock(async () => auth),
  });
  return value;
}

describe("SupplierPurchaseOrdersController", () => {
  beforeEach(() => {
    for (
      const fn of [
        listOrders,
        getOrder,
        listItems,
        listCatalog,
        listProjectOptions,
        listSupplierOptions,
        saveDraft,
        submit,
        cancel,
      ]
    ) {
      fn.mockClear();
    }
  });

  test("registers all nine purchase order routes", async () => {
    const value = await controller();
    const routes: Array<{ method: string; path: string }> = [];

    value.registerExtraRoutes({
      get: (path: string) => routes.push({ method: "GET", path }),
      post: (path: string) => routes.push({ method: "POST", path }),
    } as never);

    expect(routes).toEqual([
      { method: "GET", path: "/supplier-purchase-orders" },
      { method: "GET", path: "/supplier-purchase-orders/:id" },
      { method: "GET", path: "/supplier-purchase-orders/:id/items" },
      { method: "GET", path: "/supplier-purchase-order-catalog" },
      { method: "GET", path: "/supplier-purchase-order-project-options" },
      { method: "GET", path: "/supplier-purchase-order-supplier-options" },
      { method: "POST", path: "/supplier-purchase-orders/:id/save-draft" },
      { method: "POST", path: "/supplier-purchase-orders/:id/submit" },
      { method: "POST", path: "/supplier-purchase-orders/:id/cancel" },
    ]);
  });

  test("parses list and catalog queries and wraps service responses", async () => {
    const value = await controller();

    const listResponse = await value.listOrders({
      query: { page: "2", pageSize: "10", status: "draft" },
    } as never);
    const catalogResponse = await value.listCatalog({
      query: {
        tenantSupplierId: RELATIONSHIP_ID,
        page: "1",
        pageSize: "20",
      },
    } as never);

    expect(listOrders).toHaveBeenCalledWith(auth, {
      page: 2,
      pageSize: 10,
      status: "draft",
    });
    expect(listCatalog).toHaveBeenCalledWith(auth, {
      tenantSupplierId: RELATIONSHIP_ID,
      page: 1,
      pageSize: 20,
    });
    expect(listResponse).toEqual({ data: emptyPage, message: "success" });
    expect(catalogResponse).toEqual({
      data: emptyPage,
      message: "success",
    });
  });

  test("parses paginated project and supplier option queries", async () => {
    const value = await controller();

    await value.listProjectOptions({
      query: { page: "2", pageSize: "100", keyword: "示范" },
    } as never);
    await value.listSupplierOptions({
      query: { page: "3", pageSize: "20", keyword: "建材" },
    } as never);

    expect(listProjectOptions).toHaveBeenCalledWith(auth, {
      page: 2,
      pageSize: 100,
      keyword: "示范",
    });
    expect(listSupplierOptions).toHaveBeenCalledWith(auth, {
      page: 3,
      pageSize: 20,
      keyword: "建材",
    });
  });

  test("passes validated ids and pagination to detail reads", async () => {
    const value = await controller();

    await value.getOrder({ params: { id: ORDER_ID } } as never);
    await value.listItems({
      params: { id: ORDER_ID },
      query: { page: "1", pageSize: "20" },
    } as never);

    expect(getOrder).toHaveBeenCalledWith(auth, ORDER_ID);
    expect(listItems).toHaveBeenCalledWith(auth, ORDER_ID, {
      page: 1,
      pageSize: 20,
    });
  });

  test("passes validated command bodies and idempotency keys", async () => {
    const value = await controller();
    const headers = { "idempotency-key": "purchase-order:command" };

    await value.saveDraft({
      params: { id: ORDER_ID },
      headers,
      body: {
        project_id: PROJECT_ID,
        tenant_supplier_id: RELATIONSHIP_ID,
        expected_version: 0,
        items: [{ supplier_sku_id: SKU_ID, quantity: 2 }],
      },
    } as never);
    await value.submit({
      params: { id: ORDER_ID },
      headers,
      body: { expected_version: 1 },
    } as never);
    await value.cancel({
      params: { id: ORDER_ID },
      headers,
      body: { expected_version: 2, reason: "项目需求已取消" },
    } as never);

    expect(saveDraft).toHaveBeenCalledWith(
      auth,
      ORDER_ID,
      expect.objectContaining({
        project_id: PROJECT_ID,
        tenant_supplier_id: RELATIONSHIP_ID,
      }),
      "purchase-order:command",
    );
    expect(submit).toHaveBeenCalledWith(
      auth,
      ORDER_ID,
      { expected_version: 1 },
      "purchase-order:command",
    );
    expect(cancel).toHaveBeenCalledWith(
      auth,
      ORDER_ID,
      { expected_version: 2, reason: "项目需求已取消" },
      "purchase-order:command",
    );
  });

  test("rejects mutation without a valid idempotency key", async () => {
    const value = await controller();

    await expect(value.submit({
      params: { id: ORDER_ID },
      headers: {},
      body: { expected_version: 1 },
    } as never)).rejects.toMatchObject({
      statusCode: 400,
      code: "VALIDATION_ERROR",
    });
    expect(submit).not.toHaveBeenCalled();
  });

  test("keeps database access out of the HTTP controller", async () => {
    const source = await Bun.file(new URL("./index.ts", import.meta.url)).text();
    const forbiddenClientName = ["Supabase", "DB"].join("");

    expect(source).not.toContain(forbiddenClientName);
    expect(source).not.toContain(".from(");
    expect(source).not.toContain(".rpc(");
  });
});
