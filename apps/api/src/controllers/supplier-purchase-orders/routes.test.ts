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
const getFulfillmentDetail = mock(async () => ({
  fulfillment: null,
  item_fulfillments: [],
}));
const listShipments = mock(async () => emptyPage);
const listReceipts = mock(async () => emptyPage);
const confirmFulfillment = mock(async () => ({ status: "confirmed" }));
const createShipment = mock(async () => ({ status: "shipment_created" }));
const createReceipt = mock(async () => ({ status: "receipt_created" }));

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

mock.module("@/services/supplier-purchase-fulfillments", () => ({
  supplierPurchaseFulfillmentsService: {
    getDetail: getFulfillmentDetail,
    listShipments,
    listReceipts,
    confirm: confirmFulfillment,
    createShipment,
    createReceipt,
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
        getFulfillmentDetail,
        listShipments,
        listReceipts,
        confirmFulfillment,
        createShipment,
        createReceipt,
      ]
    ) {
      fn.mockClear();
    }
  });

  test("registers all fifteen purchase order routes", async () => {
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
      { method: "GET", path: "/supplier-purchase-orders/:id/fulfillment" },
      { method: "GET", path: "/supplier-purchase-orders/:id/shipments" },
      { method: "GET", path: "/supplier-purchase-orders/:id/receipts" },
      { method: "GET", path: "/supplier-purchase-order-catalog" },
      { method: "GET", path: "/supplier-purchase-order-project-options" },
      { method: "GET", path: "/supplier-purchase-order-supplier-options" },
      { method: "POST", path: "/supplier-purchase-orders/:id/save-draft" },
      { method: "POST", path: "/supplier-purchase-orders/:id/submit" },
      { method: "POST", path: "/supplier-purchase-orders/:id/cancel" },
      {
        method: "POST",
        path: "/supplier-purchase-orders/:id/confirm-fulfillment",
      },
      { method: "POST", path: "/supplier-purchase-orders/:id/shipments" },
      { method: "POST", path: "/supplier-purchase-orders/:id/receipts" },
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

  test("passes validated ids and pagination to fulfillment reads", async () => {
    const value = await controller();

    const detailResponse = await value.getFulfillment({
      params: { id: ORDER_ID },
    } as never);
    await value.listFulfillmentShipments({
      params: { id: ORDER_ID },
      query: { page: "2", pageSize: "10" },
    } as never);
    await value.listFulfillmentReceipts({
      params: { id: ORDER_ID },
      query: { page: "3", pageSize: "20" },
    } as never);

    expect(getFulfillmentDetail).toHaveBeenCalledWith(auth, ORDER_ID);
    expect(listShipments).toHaveBeenCalledWith(auth, ORDER_ID, {
      page: 2,
      pageSize: 10,
    });
    expect(listReceipts).toHaveBeenCalledWith(auth, ORDER_ID, {
      page: 3,
      pageSize: 20,
    });
    expect(detailResponse).toEqual({
      data: { fulfillment: null, item_fulfillments: [] },
      message: "success",
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

  test("passes validated fulfillment commands and idempotency keys", async () => {
    const value = await controller();
    const headers = { "idempotency-key": "fulfillment:command" };

    await value.confirmFulfillment({
      params: { id: ORDER_ID },
      headers,
      body: {
        expected_version: 2,
        confirmed_at: "2026-07-30T02:00:00.000Z",
        remark: "供应商已确认",
      },
    } as never);
    await value.createFulfillmentShipment({
      params: { id: ORDER_ID },
      headers,
      body: {
        id: "62000000-0000-4000-8000-000000000008",
        expected_fulfillment_version: 1,
        shipment_no: "SHIP-001",
        shipped_at: "2026-07-30T03:00:00.000Z",
        items: [{ purchase_order_item_id: SKU_ID, quantity: 6 }],
      },
    } as never);
    await value.createFulfillmentReceipt({
      params: { id: ORDER_ID },
      headers,
      body: {
        id: "62000000-0000-4000-8000-000000000009",
        expected_fulfillment_version: 2,
        receipt_no: "RCV-001",
        received_at: "2026-07-30T04:00:00.000Z",
        items: [{
          purchase_order_item_id: SKU_ID,
          accepted_quantity: 5,
          rejected_quantity: 1,
          variance_reason: "破损",
        }],
      },
    } as never);

    expect(confirmFulfillment).toHaveBeenCalledWith(
      auth,
      ORDER_ID,
      {
        expected_version: 2,
        confirmed_at: "2026-07-30T02:00:00.000Z",
        remark: "供应商已确认",
      },
      "fulfillment:command",
    );
    expect(createShipment).toHaveBeenCalledWith(
      auth,
      ORDER_ID,
      expect.objectContaining({
        shipment_no: "SHIP-001",
        items: [{ purchase_order_item_id: SKU_ID, quantity: 6 }],
      }),
      "fulfillment:command",
    );
    expect(createReceipt).toHaveBeenCalledWith(
      auth,
      ORDER_ID,
      expect.objectContaining({
        receipt_no: "RCV-001",
        items: [expect.objectContaining({
          accepted_quantity: 5,
          rejected_quantity: 1,
        })],
      }),
      "fulfillment:command",
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

  test.each([
    ["confirmFulfillment", {
      expected_version: 2,
      confirmed_at: "2026-07-30T02:00:00.000Z",
    }, confirmFulfillment],
    ["createFulfillmentShipment", {
      id: "62000000-0000-4000-8000-000000000008",
      expected_fulfillment_version: 1,
      shipment_no: "SHIP-001",
      shipped_at: "2026-07-30T03:00:00.000Z",
      items: [{ purchase_order_item_id: SKU_ID, quantity: 6 }],
    }, createShipment],
    ["createFulfillmentReceipt", {
      id: "62000000-0000-4000-8000-000000000009",
      expected_fulfillment_version: 2,
      receipt_no: "RCV-001",
      received_at: "2026-07-30T04:00:00.000Z",
      items: [{
        purchase_order_item_id: SKU_ID,
        accepted_quantity: 5,
        rejected_quantity: 1,
        variance_reason: "破损",
      }],
    }, createReceipt],
  ] as const)("rejects %s without idempotency before its service", async (
    method,
    body,
    service,
  ) => {
    const value = await controller();

    await expect(value[method]({
      params: { id: ORDER_ID },
      headers: {},
      body,
    } as never)).rejects.toMatchObject({
      statusCode: 400,
      code: "VALIDATION_ERROR",
    });
    expect(service).not.toHaveBeenCalled();
  });

  test("keeps database access out of the HTTP controller", async () => {
    const source = await Bun.file(new URL("./index.ts", import.meta.url)).text();
    const forbiddenClientName = ["Supabase", "DB"].join("");

    expect(source).not.toContain(forbiddenClientName);
    expect(source).not.toContain(".from(");
    expect(source).not.toContain(".rpc(");
  });
});
