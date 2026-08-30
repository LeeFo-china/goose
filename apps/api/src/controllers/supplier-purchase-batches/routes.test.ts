import { beforeEach, describe, expect, mock, test } from "bun:test";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const BATCH_ID = "69000000-0000-4000-8000-000000000001";
const PROJECT_ID = "69000000-0000-4000-8000-000000000002";
const SKU_ID = "69000000-0000-4000-8000-000000000003";
const COST_CATEGORY_ID = "69000000-0000-4000-8000-000000000004";
const auth = {
  authUserId: "69000000-0000-4000-8000-000000000005",
  employeeId: "69000000-0000-4000-8000-000000000006",
  tenantId: "69000000-0000-4000-8000-000000000007",
};
const emptyPage = {
  list: [],
  pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
};

const listBatches = mock(async () => emptyPage);
const getBatch = mock(async () => ({ id: BATCH_ID }));
const listItems = mock(async () => emptyPage);
const listRequisitions = mock(async () => emptyPage);
const listOrders = mock(async () => emptyPage);
const listProjectOptions = mock(async () => emptyPage);
const listCostCategories = mock(async () => emptyPage);
const listCatalog = mock(async () => emptyPage);
const saveDraft = mock(async () => ({ status: "saved" }));
const submit = mock(async () => ({ status: "submitted" }));
const review = mock(async () => ({ status: "ordered" }));
const cancel = mock(async () => ({ status: "cancelled" }));
const withdraw = mock(async () => ({ status: "withdrawn" }));

mock.module("@/services/supplier-purchase-batches", () => ({
  supplierPurchaseBatchesService: {
    listBatches,
    getBatch,
    listItems,
    listRequisitions,
    listOrders,
    listProjectOptions,
    listCostCategories,
    listCatalog,
    saveDraft,
    submit,
    review,
    cancel,
    withdraw,
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

describe("SupplierPurchaseBatchesController", () => {
  beforeEach(() => {
    for (const fn of [
      listBatches,
      getBatch,
      listItems,
      listRequisitions,
      listOrders,
      listProjectOptions,
      listCostCategories,
      listCatalog,
      saveDraft,
      submit,
      review,
      cancel,
      withdraw,
    ]) fn.mockClear();
  });

  test("registers exactly thirteen supplier purchase batch routes", async () => {
    const value = await controller();
    const routes: Array<{ method: string; path: string }> = [];

    value.registerExtraRoutes({
      get: (path: string) => routes.push({ method: "GET", path }),
      post: (path: string) => routes.push({ method: "POST", path }),
    } as never);

    expect(routes).toEqual([
      { method: "GET", path: "/supplier-purchase-batch-project-options" },
      { method: "GET", path: "/supplier-purchase-batch-cost-categories" },
      { method: "GET", path: "/supplier-purchase-batch-catalog" },
      { method: "GET", path: "/supplier-purchase-batches" },
      { method: "GET", path: "/supplier-purchase-batches/:id" },
      { method: "GET", path: "/supplier-purchase-batches/:id/items" },
      {
        method: "GET",
        path: "/supplier-purchase-batches/:id/requisitions",
      },
      { method: "GET", path: "/supplier-purchase-batches/:id/orders" },
      {
        method: "POST",
        path: "/supplier-purchase-batches/:id/save-draft",
      },
      { method: "POST", path: "/supplier-purchase-batches/:id/submit" },
      { method: "POST", path: "/supplier-purchase-batches/:id/review" },
      { method: "POST", path: "/supplier-purchase-batches/:id/cancel" },
      { method: "POST", path: "/supplier-purchase-batches/:id/withdraw" },
    ]);
  });

  test("strictly parses and wraps batch list and child pages", async () => {
    const value = await controller();
    const response = await value.listBatches({
      query: {
        page: "2",
        pageSize: "100",
        status: "pending_approval",
        projectId: PROJECT_ID,
        keyword: "补料",
      },
    } as never);
    await value.getBatch({ params: { id: BATCH_ID } } as never);
    await value.listItems({
      params: { id: BATCH_ID },
      query: { page: "3", pageSize: "20" },
    } as never);
    await value.listRequisitions({
      params: { id: BATCH_ID },
      query: { page: "4", pageSize: "20" },
    } as never);
    await value.listOrders({
      params: { id: BATCH_ID },
      query: { page: "5", pageSize: "20" },
    } as never);

    expect(listBatches).toHaveBeenCalledWith(auth, {
      page: 2,
      pageSize: 100,
      status: "pending_approval",
      projectId: PROJECT_ID,
      keyword: "补料",
    });
    expect(getBatch).toHaveBeenCalledWith(auth, BATCH_ID);
    expect(listItems).toHaveBeenCalledWith(auth, BATCH_ID, {
      page: 3,
      pageSize: 20,
    });
    expect(listRequisitions).toHaveBeenCalledWith(auth, BATCH_ID, {
      page: 4,
      pageSize: 20,
    });
    expect(listOrders).toHaveBeenCalledWith(auth, BATCH_ID, {
      page: 5,
      pageSize: 20,
    });
    expect(response).toEqual({ data: emptyPage, message: "success" });

    await expect(value.listBatches({
      query: { pageSize: "101", unknown: "x" },
    } as never)).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  test("preserves workflow state and withdraw actions from the service", async () => {
    const value = await controller();
    const workflowPage = {
      list: [{
        id: BATCH_ID,
        workflow_state: {
          instance_id: "69000000-0000-4000-8000-000000000008",
          instance_status: "running",
          current_node_key: "purchase_review",
          current_node_title: "采购审批",
          pending_task_count: 1,
          actions: [],
        },
        actions: { can_review: false, can_withdraw: true },
      }],
      pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
    };
    listBatches.mockImplementationOnce(async () => workflowPage as never);

    const response = await value.listBatches({ query: {} } as never);

    expect(response as unknown).toEqual({
      data: workflowPage,
      message: "success",
    });
  });

  test("parses and wraps the three auxiliary pages", async () => {
    const value = await controller();

    await value.listProjectOptions({
      query: {
        page: "2",
        pageSize: "100",
        keyword: "项目",
        updatedWindow: "current_month",
        timezone: "Asia/Shanghai",
      },
    } as never);
    await value.listCostCategories({
      query: { page: "3", pageSize: "20", keyword: "材料" },
    } as never);
    const response = await value.listCatalog({
      query: {
        projectId: PROJECT_ID,
        page: "4",
        pageSize: "20",
        keyword: "瓷砖",
      },
    } as never);

    expect(listProjectOptions).toHaveBeenCalledWith(auth, {
      page: 2,
      pageSize: 100,
      keyword: "项目",
      updatedWindow: "current_month",
      timezone: "Asia/Shanghai",
    });
    expect(listCostCategories).toHaveBeenCalledWith(auth, {
      page: 3,
      pageSize: 20,
      keyword: "材料",
    });
    expect(listCatalog).toHaveBeenCalledWith(auth, {
      projectId: PROJECT_ID,
      page: 4,
      pageSize: 20,
      keyword: "瓷砖",
    });
    expect(response).toEqual({ data: emptyPage, message: "success" });

    await expect(value.listProjectOptions({
      query: { updatedWindow: "last_month" },
    } as never)).rejects.toMatchObject({
      statusCode: 400,
      code: "VALIDATION_ERROR",
    });
    await expect(value.listProjectOptions({
      query: { timezone: "UTC" },
    } as never)).rejects.toMatchObject({
      statusCode: 400,
      code: "VALIDATION_ERROR",
    });
  });

  test("passes validated mutations and idempotency keys", async () => {
    const value = await controller();
    const headers = { "idempotency-key": "batch:command" };

    await value.saveDraft({
      params: { id: BATCH_ID },
      headers,
      body: {
        project_id: PROJECT_ID,
        expected_version: 0,
        reason: "现场补料",
        items: [{
          supplier_sku_id: SKU_ID,
          cost_category_id: COST_CATEGORY_ID,
          quantity: "2.5000",
        }],
      },
    } as never);
    await value.submit({
      params: { id: BATCH_ID }, headers, body: { expected_version: 1 },
    } as never);
    await value.review({
      params: { id: BATCH_ID },
      headers,
      body: { expected_version: 2, action: "approve", remark: "同意" },
    } as never);
    await value.cancel({
      params: { id: BATCH_ID },
      headers,
      body: { expected_version: 2, reason: "计划调整" },
    } as never);
    await value.withdraw({
      params: { id: BATCH_ID },
      headers,
      body: { expected_version: 2, reason: "采购内容需调整" },
    } as never);

    expect(saveDraft).toHaveBeenCalledWith(
      auth,
      BATCH_ID,
      expect.objectContaining({ items: [expect.objectContaining({
        quantity: "2.5000",
      })] }),
      "batch:command",
    );
    expect(submit).toHaveBeenCalledWith(
      auth, BATCH_ID, { expected_version: 1 }, "batch:command",
    );
    expect(review).toHaveBeenCalledWith(auth, BATCH_ID, {
      expected_version: 2,
      action: "approve",
      remark: "同意",
    }, "batch:command");
    expect(cancel).toHaveBeenCalledWith(auth, BATCH_ID, {
      expected_version: 2,
      reason: "计划调整",
    }, "batch:command");
    expect(withdraw).toHaveBeenCalledWith(auth, BATCH_ID, {
      expected_version: 2,
      reason: "采购内容需调整",
    }, "batch:command");
  });

  test.each([
    ["saveDraft", {
      project_id: PROJECT_ID,
      expected_version: 0,
      reason: "现场补料",
      items: [{
        supplier_sku_id: SKU_ID,
        cost_category_id: COST_CATEGORY_ID,
        quantity: "1",
      }],
    }, saveDraft],
    ["submit", { expected_version: 1 }, submit],
    ["review", { expected_version: 2, action: "reject", remark: "驳回" }, review],
    ["cancel", { expected_version: 2, reason: "计划调整" }, cancel],
    ["withdraw", { expected_version: 2 }, withdraw],
  ] as const)("rejects %s without idempotency before service", async (
    method,
    body,
    service,
  ) => {
    const value = await controller();
    await expect(value[method]({
      params: { id: BATCH_ID },
      headers: {},
      body,
    } as never)).rejects.toMatchObject({
      statusCode: 400,
      code: "VALIDATION_ERROR",
    });
    expect(service).not.toHaveBeenCalled();
  });

  test("rejects invalid requests and keeps DB access out of HTTP", async () => {
    const value = await controller();
    await expect(value.getBatch({ params: { id: "bad" } } as never))
      .rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(value.listCatalog({ query: { projectId: "bad" } } as never))
      .rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    for (const body of [
      { expected_version: 0 },
      { expected_version: 2, reason: "   " },
    ]) {
      await expect(value.withdraw({
        params: { id: BATCH_ID },
        headers: { "idempotency-key": "withdraw:invalid" },
        body,
      } as never)).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    }
    expect(getBatch).not.toHaveBeenCalled();
    expect(listCatalog).not.toHaveBeenCalled();
    expect(withdraw).not.toHaveBeenCalled();

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
      'import SupplierPurchaseBatchesController from "@/controllers/supplier-purchase-batches";',
    );
    expect(routesSource.match(
      /SupplierPurchaseBatchesController\.registerExtraRoutes\(app\);/g,
    )).toHaveLength(1);
  });
});
