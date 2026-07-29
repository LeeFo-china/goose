import { describe, expect, mock, test } from "bun:test";

import type { AuthContext } from "@/services/authorization";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const TENANT_ID = "61000000-0000-4000-8000-000000000001";
const ORDER_ID = "61000000-0000-4000-8000-000000000002";
const PROJECT_ID = "61000000-0000-4000-8000-000000000003";
const RELATIONSHIP_ID = "61000000-0000-4000-8000-000000000004";
const OTHER_RELATIONSHIP_ID = "61000000-0000-4000-8000-000000000005";
const USER_ID = "61000000-0000-4000-8000-000000000006";
const EMPLOYEE_ID = "61000000-0000-4000-8000-000000000007";

const auth = {
  authUserId: USER_ID,
  employeeId: EMPLOYEE_ID,
  tenantId: TENANT_ID,
  permissions: [],
} as unknown as AuthContext;

function dependencies(orderOverrides: Record<string, unknown> = {}) {
  const scope = {
    tenantId: TENANT_ID,
    authUserId: USER_ID,
    employeeId: EMPLOYEE_ID,
  };
  const purchaseOrder = {
    id: ORDER_ID,
    tenant_id: TENANT_ID,
    project_id: PROJECT_ID,
    tenant_supplier_id: RELATIONSHIP_ID,
    ...orderOverrides,
  };
  return {
    access: {
      requireRead: mock(async () => scope),
      requireManage: mock(async () => scope),
      getVisibleProjectIds: mock(async () => [PROJECT_ID]),
      assertProjectRead: mock(async () => undefined),
      assertProjectUpdate: mock(async () => undefined),
    },
    repository: {
      listOrders: mock(async (input: unknown) => ({ input })),
      findOrder: mock(async () => purchaseOrder),
      listItems: mock(async (input: unknown) => ({ input })),
      listCatalog: mock(async (input: unknown) => ({ input })),
      saveDraft: mock(async (input: unknown) => ({ input })),
      submit: mock(async (input: unknown) => ({ input })),
      cancel: mock(async (input: unknown) => ({ input })),
    },
    tenantSuppliers: {
      assertCanCreatePurchaseOrder: mock(async () => undefined),
    },
    nowFactory: () => new Date("2026-07-29T08:00:00.000Z"),
  };
}

describe("SupplierPurchaseOrdersService", () => {
  test("lists only the tenant and project scope resolved by access policy", async () => {
    const deps = dependencies();
    const { SupplierPurchaseOrdersService } = await import(
      "./supplier-purchase-orders"
    );
    const service = new SupplierPurchaseOrdersService(deps as never);

    await service.listOrders(auth, {
      page: 1,
      pageSize: 20,
      status: "draft",
    });

    expect(deps.repository.listOrders).toHaveBeenCalledWith({
      tenant_id: TENANT_ID,
      visible_project_ids: [PROJECT_ID],
      page: 1,
      pageSize: 20,
      status: "draft",
    });
  });

  test("requires project.read for detail and item reads", async () => {
    const deps = dependencies();
    const { SupplierPurchaseOrdersService } = await import(
      "./supplier-purchase-orders"
    );
    const service = new SupplierPurchaseOrdersService(deps as never);

    await service.getOrder(auth, ORDER_ID);
    await service.listItems(auth, ORDER_ID, { page: 1, pageSize: 20 });

    expect(deps.access.assertProjectRead).toHaveBeenCalledTimes(2);
    expect(deps.access.assertProjectRead).toHaveBeenCalledWith(
      auth,
      PROJECT_ID,
    );
    expect(deps.repository.listItems).toHaveBeenCalledWith({
      tenant_id: TENANT_ID,
      order_id: ORDER_ID,
      page: 1,
      pageSize: 20,
    });
  });

  test("uses one service timestamp for the paginated supplier catalog", async () => {
    const deps = dependencies();
    const { SupplierPurchaseOrdersService } = await import(
      "./supplier-purchase-orders"
    );
    const service = new SupplierPurchaseOrdersService(deps as never);

    await service.listCatalog(auth, {
      tenantSupplierId: RELATIONSHIP_ID,
      keyword: "瓷砖",
      page: 2,
      pageSize: 10,
    });

    expect(deps.repository.listCatalog).toHaveBeenCalledWith({
      tenant_id: TENANT_ID,
      tenant_supplier_id: RELATIONSHIP_ID,
      priced_at: "2026-07-29T08:00:00.000Z",
      keyword: "瓷砖",
      page: 2,
      pageSize: 10,
    });
  });

  test("checks project update and supplier eligibility before save and submit", async () => {
    const deps = dependencies();
    const { SupplierPurchaseOrdersService } = await import(
      "./supplier-purchase-orders"
    );
    const service = new SupplierPurchaseOrdersService(deps as never);

    await service.saveDraft(auth, ORDER_ID, {
      project_id: PROJECT_ID,
      tenant_supplier_id: RELATIONSHIP_ID,
      expected_version: 0,
      items: [{
        supplier_sku_id: "61000000-0000-4000-8000-000000000008",
        quantity: 2,
      }],
    }, "purchase-order:save");
    await service.submit(auth, ORDER_ID, {
      expected_version: 1,
    }, "purchase-order:submit");

    expect(deps.access.assertProjectUpdate).toHaveBeenNthCalledWith(
      1,
      auth,
      PROJECT_ID,
    );
    expect(deps.access.assertProjectUpdate).toHaveBeenNthCalledWith(
      2,
      auth,
      PROJECT_ID,
    );
    expect(deps.tenantSuppliers.assertCanCreatePurchaseOrder)
      .toHaveBeenNthCalledWith(1, auth, RELATIONSHIP_ID);
    expect(deps.tenantSuppliers.assertCanCreatePurchaseOrder)
      .toHaveBeenNthCalledWith(2, auth, RELATIONSHIP_ID);
    expect(deps.repository.saveDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        tenant_id: TENANT_ID,
        order_id: ORDER_ID,
        actor_user_id: USER_ID,
        actor_employee_id: EMPLOYEE_ID,
        idempotency_key: "purchase-order:save",
      }),
    );
  });

  test("allows cancellation without rechecking a later supplier suspension", async () => {
    const deps = dependencies();
    const { SupplierPurchaseOrdersService } = await import(
      "./supplier-purchase-orders"
    );
    const service = new SupplierPurchaseOrdersService(deps as never);

    await service.cancel(auth, ORDER_ID, {
      expected_version: 2,
      reason: "项目需求已取消",
    }, "purchase-order:cancel");

    expect(deps.access.assertProjectUpdate).toHaveBeenCalledWith(
      auth,
      PROJECT_ID,
    );
    expect(deps.tenantSuppliers.assertCanCreatePurchaseOrder)
      .not.toHaveBeenCalled();
    expect(deps.repository.cancel).toHaveBeenCalledWith(
      expect.objectContaining({
        tenant_id: TENANT_ID,
        order_id: ORDER_ID,
        reason: "项目需求已取消",
      }),
    );
  });

  test("rejects changing the project or supplier relationship of a draft", async () => {
    const deps = dependencies();
    const { SupplierPurchaseOrdersService } = await import(
      "./supplier-purchase-orders"
    );
    const service = new SupplierPurchaseOrdersService(deps as never);

    await expect(service.saveDraft(auth, ORDER_ID, {
      project_id: PROJECT_ID,
      tenant_supplier_id: OTHER_RELATIONSHIP_ID,
      expected_version: 1,
      items: [{
        supplier_sku_id: "61000000-0000-4000-8000-000000000008",
        quantity: 2,
      }],
    }, "purchase-order:save")).rejects.toMatchObject({
      statusCode: 409,
      code: "SUPPLIER_PURCHASE_ORDER_STATE_CONFLICT",
    });
    expect(deps.repository.saveDraft).not.toHaveBeenCalled();
  });

  test("returns a stable not-found error before checking project scope", async () => {
    const deps = dependencies();
    deps.repository.findOrder.mockImplementation(async () => null as never);
    const { SupplierPurchaseOrdersService } = await import(
      "./supplier-purchase-orders"
    );
    const service = new SupplierPurchaseOrdersService(deps as never);

    await expect(service.getOrder(auth, ORDER_ID)).rejects.toMatchObject({
      statusCode: 404,
      code: "SUPPLIER_PURCHASE_ORDER_NOT_FOUND",
    });
    expect(deps.access.assertProjectRead).not.toHaveBeenCalled();
  });
});
