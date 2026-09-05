import { describe, expect, mock, test } from "bun:test";

import type { AuthContext } from "@/services/authorization";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const TENANT_ID = "61000000-0000-4000-8000-000000000001";
const ORDER_ID = "61000000-0000-4000-8000-000000000002";
const OTHER_ORDER_ID = "61000000-0000-4000-8000-000000000012";
const PROJECT_ID = "61000000-0000-4000-8000-000000000003";
const RELATIONSHIP_ID = "61000000-0000-4000-8000-000000000004";
const OTHER_RELATIONSHIP_ID = "61000000-0000-4000-8000-000000000005";
const USER_ID = "61000000-0000-4000-8000-000000000006";
const EMPLOYEE_ID = "61000000-0000-4000-8000-000000000007";
const BATCH_ID = "61000000-0000-4000-8000-000000000008";
const SYSTEM_EMPLOYEE_ID = "61000000-0000-4000-8000-000000000009";
const APPLICANT_ID = "61000000-0000-4000-8000-000000000010";
const REVIEWER_ID = "61000000-0000-4000-8000-000000000011";

const auth = {
  authUserId: USER_ID,
  employeeId: EMPLOYEE_ID,
  tenantId: TENANT_ID,
  permissions: [],
} as unknown as AuthContext;
type ShareStatus = {
  status: "active" | null;
  expires_at: string | null;
  viewed_count: number;
  last_viewed_at: string | null;
  confirmed_at: string | null;
  confirm_remark: string | null;
};

function emptyPage() {
  return {
    list: [] as unknown[],
    pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
  };
}

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
      listOrders: mock(async (_input: unknown) => emptyPage()),
      findOrder: mock(async () => purchaseOrder),
      listItems: mock(async (input: unknown) => ({ input })),
      listCatalog: mock(async (input: unknown) => ({ input })),
      listProjectOptions: mock(async (input: unknown) => ({ input })),
      listSupplierOptions: mock(async (input: unknown) => ({ input })),
      saveDraft: mock(async (input: unknown) => ({ input })),
      submit: mock(async (input: unknown) => ({ input })),
      cancel: mock(async (input: unknown) => ({ input })),
    },
    shareLinks: {
      getShareStatuses: mock(async (): Promise<Record<string, ShareStatus>> => ({})),
      getShareStatus: mock(async (): Promise<ShareStatus> => ({
        status: null,
        expires_at: null,
        viewed_count: 0,
        last_viewed_at: null,
        confirmed_at: null,
        confirm_remark: null,
      })),
    },
    tenantSuppliers: {
      assertCanCreatePurchaseOrderForTenant: mock(async () => undefined),
    },
    nowFactory: () => new Date("2026-07-29T08:00:00.000Z"),
  };
}

describe("SupplierPurchaseOrdersService", () => {
  test("inherits applicant and approval summary from the source batch on order lists", async () => {
    const deps = dependencies({
      purchase_batch_id: BATCH_ID,
      created_by_employee_id: SYSTEM_EMPLOYEE_ID,
    });
    deps.repository.listOrders.mockImplementation(async () => ({
      list: [{
        id: ORDER_ID,
        tenant_id: TENANT_ID,
        project_id: PROJECT_ID,
        tenant_supplier_id: RELATIONSHIP_ID,
        purchase_batch_id: BATCH_ID,
        status: "submitted",
        fulfillment_status: "confirmed",
        created_by_employee_id: SYSTEM_EMPLOYEE_ID,
        creator_snapshot: {
          employee_id: SYSTEM_EMPLOYEE_ID,
          name: "系统生成",
          phone_masked: null,
          role_name: null,
        },
        purchase_batch: {
          id: BATCH_ID,
          status: "ordered",
          submitted_by_employee_id: APPLICANT_ID,
          submitted_at: "2026-08-27T02:00:00.000Z",
          reviewed_by_employee_id: REVIEWER_ID,
          reviewed_at: "2026-08-27T03:00:00.000Z",
          review_remark: "同意生成采购单",
          applicant_snapshot: {
            employee_id: APPLICANT_ID,
            name: "批次申请人",
            phone_masked: "188****3002",
            role_name: "项目经理",
          },
          last_reviewer_snapshot: {
            employee_id: REVIEWER_ID,
            name: "最终审批人",
            phone_masked: "188****3003",
            role_name: "采购审批",
          },
        },
      }],
      pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
    }));
    const { SupplierPurchaseOrdersService } = await import(
      "./supplier-purchase-orders"
    );
    const service = new SupplierPurchaseOrdersService(deps as never);

    const result = await service.listOrders(auth, {
      page: 1,
      pageSize: 20,
    });

    expect(result.list[0]).toMatchObject({
      creator: {
        employee_id: SYSTEM_EMPLOYEE_ID,
        name: "系统生成",
        phone_masked: null,
        role_name: null,
      },
      applicant: {
        employee_id: APPLICANT_ID,
        name: "批次申请人",
        phone_masked: "188****3002",
        role_name: "项目经理",
      },
      submitted_at: "2026-08-27T02:00:00.000Z",
      approval_summary: {
        status: "approved",
        current_approvers: [],
        last_reviewer: {
          employee_id: REVIEWER_ID,
          name: "最终审批人",
          phone_masked: "188****3003",
          role_name: "采购审批",
        },
        reviewed_at: "2026-08-27T03:00:00.000Z",
        rejected_at: null,
        review_remark: "同意生成采购单",
      },
    });
  });

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
      fulfillmentStatus: "partially_received",
    });

    expect(deps.repository.listOrders).toHaveBeenCalledWith({
      tenant_id: TENANT_ID,
      visible_project_ids: [PROJECT_ID],
      page: 1,
      pageSize: 20,
      status: "draft",
      fulfillment_status: "partially_received",
    });
  });

  test("returns purchase order share status on list rows", async () => {
    const deps = dependencies();
    deps.repository.listOrders.mockImplementation(async () => ({
      list: [
        {
          id: ORDER_ID,
          tenant_id: TENANT_ID,
          project_id: PROJECT_ID,
          tenant_supplier_id: RELATIONSHIP_ID,
        },
        {
          id: OTHER_ORDER_ID,
          tenant_id: TENANT_ID,
          project_id: PROJECT_ID,
          tenant_supplier_id: OTHER_RELATIONSHIP_ID,
        },
      ],
      pagination: { page: 1, pageSize: 20, total: 2, totalPages: 1 },
    }));
    deps.shareLinks.getShareStatuses.mockImplementation(async () => ({
      [ORDER_ID]: {
        status: "active",
        expires_at: "2026-10-05T00:00:00.000Z",
        viewed_count: 2,
        last_viewed_at: "2026-09-05T04:50:00.000Z",
        confirmed_at: "2026-09-05T04:51:00.000Z",
        confirm_remark: "供应商已确认",
      },
    }));
    const { SupplierPurchaseOrdersService } = await import(
      "./supplier-purchase-orders"
    );
    const service = new SupplierPurchaseOrdersService(deps as never);

    const result = await service.listOrders(auth, { page: 1, pageSize: 20 });

    expect(deps.shareLinks.getShareStatuses).toHaveBeenCalledWith({
      tenantId: TENANT_ID,
      orderIds: [ORDER_ID, OTHER_ORDER_ID],
      checkedAt: "2026-07-29T08:00:00.000Z",
    });
    expect(deps.shareLinks.getShareStatus).not.toHaveBeenCalled();
    expect(result.list).toEqual([
      expect.objectContaining({
        id: ORDER_ID,
        share_status: {
          status: "active",
          expires_at: "2026-10-05T00:00:00.000Z",
          viewed_count: 2,
          last_viewed_at: "2026-09-05T04:50:00.000Z",
          confirmed_at: "2026-09-05T04:51:00.000Z",
          confirm_remark: "供应商已确认",
        },
      }),
      expect.objectContaining({
        id: OTHER_ORDER_ID,
        share_status: {
          status: null,
          expires_at: null,
          viewed_count: 0,
          last_viewed_at: null,
          confirmed_at: null,
          confirm_remark: null,
        },
      }),
    ]);
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

  test("returns purchase order share status on detail reads", async () => {
    const deps = dependencies();
    deps.shareLinks.getShareStatus.mockImplementation(async () => ({
      status: "active",
      expires_at: "2026-10-05T00:00:00.000Z",
      viewed_count: 3,
      last_viewed_at: "2026-09-05T02:00:00.000Z",
      confirmed_at: "2026-09-05T01:00:00.000Z",
      confirm_remark: "供应商已确认",
    }));
    const { SupplierPurchaseOrdersService } = await import(
      "./supplier-purchase-orders"
    );
    const service = new SupplierPurchaseOrdersService(deps as never);

    const result = await service.getOrder(auth, ORDER_ID);

    expect(deps.shareLinks.getShareStatus).toHaveBeenCalledWith({
      tenantId: TENANT_ID,
      orderId: ORDER_ID,
      checkedAt: "2026-07-29T08:00:00.000Z",
    });
    expect(result).toMatchObject({
      id: ORDER_ID,
      share_status: {
        viewed_count: 3,
        last_viewed_at: "2026-09-05T02:00:00.000Z",
        confirmed_at: "2026-09-05T01:00:00.000Z",
        confirm_remark: "供应商已确认",
      },
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

    expect(deps.access.requireManage).toHaveBeenCalledWith(auth);
    expect(deps.access.requireRead).not.toHaveBeenCalled();
    expect(deps.repository.listCatalog).toHaveBeenCalledWith({
      tenant_id: TENANT_ID,
      tenant_supplier_id: RELATIONSHIP_ID,
      priced_at: "2026-07-29T08:00:00.000Z",
      keyword: "瓷砖",
      page: 2,
      pageSize: 10,
    });
  });

  test("paginates project and eligible supplier options under purchase-order permissions", async () => {
    const deps = dependencies();
    const { SupplierPurchaseOrdersService } = await import(
      "./supplier-purchase-orders"
    );
    const service = new SupplierPurchaseOrdersService(deps as never);

    await service.listProjectOptions(auth, {
      keyword: "示范",
      page: 2,
      pageSize: 100,
    });
    await service.listSupplierOptions(auth, {
      keyword: "建材",
      page: 3,
      pageSize: 20,
    });

    expect(deps.repository.listProjectOptions).toHaveBeenCalledWith({
      tenant_id: TENANT_ID,
      visible_project_ids: [PROJECT_ID],
      keyword: "示范",
      page: 2,
      pageSize: 100,
    });
    expect(deps.repository.listSupplierOptions).toHaveBeenCalledWith({
      tenant_id: TENANT_ID,
      checked_at: "2026-07-29T08:00:00.000Z",
      keyword: "建材",
      page: 3,
      pageSize: 20,
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
    expect(deps.tenantSuppliers.assertCanCreatePurchaseOrderForTenant)
      .toHaveBeenNthCalledWith(1, TENANT_ID, RELATIONSHIP_ID);
    expect(deps.tenantSuppliers.assertCanCreatePurchaseOrderForTenant)
      .toHaveBeenNthCalledWith(2, TENANT_ID, RELATIONSHIP_ID);
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
    expect(deps.tenantSuppliers.assertCanCreatePurchaseOrderForTenant)
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
