import { beforeEach, describe, expect, mock, test } from "bun:test";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const REQUISITION_ID = "64000000-0000-4000-8000-000000000001";
const PROJECT_ID = "64000000-0000-4000-8000-000000000002";
const RELATIONSHIP_ID = "64000000-0000-4000-8000-000000000003";
const SKU_ID = "64000000-0000-4000-8000-000000000004";
const COST_CATEGORY_ID = "64000000-0000-4000-8000-000000000005";
const PURCHASE_ORDER_ID = "64000000-0000-4000-8000-000000000006";
const auth = {
  authUserId: "64000000-0000-4000-8000-000000000007",
  employeeId: "64000000-0000-4000-8000-000000000008",
  tenantId: "64000000-0000-4000-8000-000000000009",
};
const emptyPage = {
  list: [],
  pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
};

const listRequisitions = mock(async () => emptyPage);
const getRequisition = mock(async () => ({ id: REQUISITION_ID }));
const listItems = mock(async () => emptyPage);
const listProjectOptions = mock(async () => emptyPage);
const listSupplierOptions = mock(async () => emptyPage);
const listCatalog = mock(async () => emptyPage);
const listCostCategories = mock(async () => emptyPage);
const saveDraft = mock(async () => ({ status: "saved" }));
const submit = mock(async () => ({ status: "submitted" }));
const review = mock(async () => ({ status: "approved" }));
const cancel = mock(async () => ({ status: "cancelled" }));
const convert = mock(async () => ({
  status: "converted",
  purchase_order_id: PURCHASE_ORDER_ID,
}));

mock.module("@/services/supplier-purchase-requisitions", () => ({
  supplierPurchaseRequisitionsService: {
    listRequisitions,
    getRequisition,
    listItems,
    listProjectOptions,
    listSupplierOptions,
    listCatalog,
    listCostCategories,
    saveDraft,
    submit,
    review,
    cancel,
    convert,
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

describe("SupplierPurchaseRequisitionsController", () => {
  beforeEach(() => {
    for (
      const fn of [
        listRequisitions,
        getRequisition,
        listItems,
        listProjectOptions,
        listSupplierOptions,
        listCatalog,
        listCostCategories,
        saveDraft,
        submit,
        review,
        cancel,
        convert,
      ]
    ) {
      fn.mockClear();
    }
  });

  test("registers exactly twelve purchase requisition routes", async () => {
    const value = await controller();
    const routes: Array<{ method: string; path: string }> = [];

    value.registerExtraRoutes({
      get: (path: string) => routes.push({ method: "GET", path }),
      post: (path: string) => routes.push({ method: "POST", path }),
    } as never);

    expect(routes).toEqual([
      { method: "GET", path: "/supplier-purchase-requisitions" },
      { method: "GET", path: "/supplier-purchase-requisitions/:id" },
      {
        method: "GET",
        path: "/supplier-purchase-requisitions/:id/items",
      },
      {
        method: "GET",
        path: "/supplier-purchase-requisition-project-options",
      },
      {
        method: "GET",
        path: "/supplier-purchase-requisition-supplier-options",
      },
      {
        method: "GET",
        path: "/supplier-purchase-requisition-catalog",
      },
      {
        method: "GET",
        path: "/supplier-purchase-requisition-cost-categories",
      },
      {
        method: "POST",
        path: "/supplier-purchase-requisitions/:id/save-draft",
      },
      {
        method: "POST",
        path: "/supplier-purchase-requisitions/:id/submit",
      },
      {
        method: "POST",
        path: "/supplier-purchase-requisitions/:id/review",
      },
      {
        method: "POST",
        path: "/supplier-purchase-requisitions/:id/cancel",
      },
      {
        method: "POST",
        path: "/supplier-purchase-requisitions/:id/convert",
      },
    ]);
  });

  test("strictly parses list filters and wraps the response", async () => {
    const value = await controller();
    const response = await value.listRequisitions({
      query: {
        page: "2",
        pageSize: "100",
        status: "pending_approval",
        budget_status: "over_budget",
        project_id: PROJECT_ID,
        tenant_supplier_id: RELATIONSHIP_ID,
        keyword: "补料",
      },
    } as never);

    expect(listRequisitions).toHaveBeenCalledWith(auth, {
      page: 2,
      pageSize: 100,
      status: "pending_approval",
      budget_status: "over_budget",
      project_id: PROJECT_ID,
      tenant_supplier_id: RELATIONSHIP_ID,
      keyword: "补料",
    });
    expect(response).toEqual({ data: emptyPage, message: "success" });

    await expect(value.listRequisitions({
      query: { pageSize: "101", unknown: "x" },
    } as never)).rejects.toMatchObject({
      statusCode: 400,
      code: "VALIDATION_ERROR",
    });
  });

  test("passes validated request ids and paginated item query", async () => {
    const value = await controller();

    await value.getRequisition({
      params: { id: REQUISITION_ID },
    } as never);
    await value.listItems({
      params: { id: REQUISITION_ID },
      query: { page: "3", pageSize: "20" },
    } as never);

    expect(getRequisition).toHaveBeenCalledWith(auth, REQUISITION_ID);
    expect(listItems).toHaveBeenCalledWith(auth, REQUISITION_ID, {
      page: 3,
      pageSize: 20,
    });
  });

  test("parses and wraps four requisition-specific auxiliary pages", async () => {
    const value = await controller();

    await value.listProjectOptions({
      query: { page: "2", pageSize: "100", keyword: "项目" },
    } as never);
    await value.listSupplierOptions({
      query: { page: "3", pageSize: "20", keyword: "供应商" },
    } as never);
    await value.listCatalog({
      query: {
        tenantSupplierId: RELATIONSHIP_ID,
        page: "4",
        pageSize: "20",
        keyword: "SKU",
      },
    } as never);
    const response = await value.listCostCategories({
      query: { page: "2", pageSize: "100", status: "active" },
    } as never);

    expect(listProjectOptions).toHaveBeenCalledWith(auth, {
      page: 2,
      pageSize: 100,
      keyword: "项目",
    });
    expect(listSupplierOptions).toHaveBeenCalledWith(auth, {
      page: 3,
      pageSize: 20,
      keyword: "供应商",
    });
    expect(listCatalog).toHaveBeenCalledWith(auth, {
      tenantSupplierId: RELATIONSHIP_ID,
      page: 4,
      pageSize: 20,
      keyword: "SKU",
    });
    expect(listCostCategories).toHaveBeenCalledWith(auth, {
      page: 2,
      pageSize: 100,
      status: "active",
    });
    expect(response).toEqual({ data: emptyPage, message: "success" });

    await expect(value.listCatalog({
      query: { tenantSupplierId: "bad" },
    } as never)).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  test("passes strictly validated bodies, request id, order id, and key", async () => {
    const value = await controller();
    const headers = { "idempotency-key": "requisition:command" };

    await value.saveDraft({
      params: { id: REQUISITION_ID },
      headers,
      body: {
        project_id: PROJECT_ID,
        tenant_supplier_id: RELATIONSHIP_ID,
        expected_version: 0,
        reason: "现场临时补料",
        expected_delivery_date: null,
        remark: null,
        items: [{
          supplier_sku_id: SKU_ID,
          cost_category_id: COST_CATEGORY_ID,
          quantity: "2.5000",
        }],
      },
    } as never);
    await value.submit({
      params: { id: REQUISITION_ID },
      headers,
      body: { expected_version: 1 },
    } as never);
    await value.review({
      params: { id: REQUISITION_ID },
      headers,
      body: {
        expected_version: 2,
        action: "approve",
        remark: "同意",
      },
    } as never);
    await value.cancel({
      params: { id: REQUISITION_ID },
      headers,
      body: { expected_version: 2, reason: "计划调整" },
    } as never);
    await value.convert({
      params: { id: REQUISITION_ID },
      headers,
      body: {
        expected_version: 3,
        purchase_order_id: PURCHASE_ORDER_ID,
      },
    } as never);

    expect(saveDraft).toHaveBeenCalledWith(
      auth,
      REQUISITION_ID,
      expect.objectContaining({
        project_id: PROJECT_ID,
        tenant_supplier_id: RELATIONSHIP_ID,
        items: [expect.objectContaining({ quantity: "2.5000" })],
      }),
      "requisition:command",
    );
    expect(submit).toHaveBeenCalledWith(
      auth,
      REQUISITION_ID,
      { expected_version: 1 },
      "requisition:command",
    );
    expect(review).toHaveBeenCalledWith(
      auth,
      REQUISITION_ID,
      { expected_version: 2, action: "approve", remark: "同意" },
      "requisition:command",
    );
    expect(cancel).toHaveBeenCalledWith(
      auth,
      REQUISITION_ID,
      { expected_version: 2, reason: "计划调整" },
      "requisition:command",
    );
    expect(convert).toHaveBeenCalledWith(
      auth,
      REQUISITION_ID,
      {
        expected_version: 3,
        purchase_order_id: PURCHASE_ORDER_ID,
      },
      "requisition:command",
    );
  });

  test.each([
    ["saveDraft", {
      project_id: PROJECT_ID,
      tenant_supplier_id: RELATIONSHIP_ID,
      expected_version: 0,
      reason: "现场临时补料",
      items: [{
        supplier_sku_id: SKU_ID,
        cost_category_id: COST_CATEGORY_ID,
        quantity: "1",
      }],
    }, saveDraft],
    ["submit", { expected_version: 1 }, submit],
    ["review", {
      expected_version: 2,
      action: "reject",
      remark: "不同意",
    }, review],
    ["cancel", {
      expected_version: 2,
      reason: "计划调整",
    }, cancel],
    ["convert", {
      expected_version: 3,
      purchase_order_id: PURCHASE_ORDER_ID,
    }, convert],
  ] as const)(
    "rejects %s without idempotency before service",
    async (method, body, service) => {
      const value = await controller();

      await expect(value[method]({
        params: { id: REQUISITION_ID },
        headers: {},
        body,
      } as never)).rejects.toMatchObject({
        statusCode: 400,
        code: "VALIDATION_ERROR",
      });
      expect(service).not.toHaveBeenCalled();
    },
  );

  test("rejects invalid params and bodies before service", async () => {
    const value = await controller();
    const headers = { "idempotency-key": "requisition:command" };

    await expect(value.getRequisition({
      params: { id: "not-a-uuid" },
    } as never)).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(value.convert({
      params: { id: REQUISITION_ID },
      headers,
      body: {
        expected_version: 3,
        purchase_order_id: PURCHASE_ORDER_ID,
        tenant_id: auth.tenantId,
      },
    } as never)).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(getRequisition).not.toHaveBeenCalled();
    expect(convert).not.toHaveBeenCalled();
  });

  test("registers controller once and keeps DB access out of HTTP", async () => {
    const controllerSource = await Bun.file(
      new URL("./index.ts", import.meta.url),
    ).text();
    const routesSource = await Bun.file(
      new URL("../../routes/index.ts", import.meta.url),
    ).text();
    const forbiddenClientName = ["Supabase", "DB"].join("");

    expect(controllerSource).not.toContain(forbiddenClientName);
    expect(controllerSource).not.toContain(".from(");
    expect(controllerSource).not.toContain(".rpc(");
    expect(routesSource).toContain(
      'import SupplierPurchaseRequisitionsController from "@/controllers/supplier-purchase-requisitions";',
    );
    expect(routesSource.match(
      /SupplierPurchaseRequisitionsController\.registerExtraRoutes\(app\);/g,
    )).toHaveLength(1);
  });
});
