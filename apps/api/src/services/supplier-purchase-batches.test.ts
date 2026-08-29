import { describe, expect, mock, test } from "bun:test";

import { Errors } from "@/errors/error-factory";
import type { AuthContext } from "@/services/authorization";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const TENANT_ID = "68000000-0000-4000-8000-000000000001";
const BATCH_ID = "68000000-0000-4000-8000-000000000002";
const PROJECT_ID = "68000000-0000-4000-8000-000000000003";
const OTHER_PROJECT_ID = "68000000-0000-4000-8000-000000000004";
const USER_ID = "68000000-0000-4000-8000-000000000005";
const EMPLOYEE_ID = "68000000-0000-4000-8000-000000000006";
const CREATOR_ID = "68000000-0000-4000-8000-000000000007";
const SKU_ID = "68000000-0000-4000-8000-000000000008";
const COST_CATEGORY_ID = "68000000-0000-4000-8000-000000000009";

function auth(permissions: string[] = []): AuthContext {
  return {
    authUserId: USER_ID,
    employeeId: EMPLOYEE_ID,
    tenantId: TENANT_ID,
    tenantName: "测试租户",
    tenantSlug: "test",
    tenantStatus: "active",
    isPlatformAdmin: false,
    employeeName: "审批人",
    employeeStatus: "active",
    departmentId: null,
    tenantDepartmentId: null,
    departmentCode: null,
    departmentName: null,
    postId: null,
    postName: null,
    avatar: null,
    roleCodes: [],
    roles: [],
    permissions: permissions.map((code) => ({ code, scope: "all" })),
  };
}

function dependencies(overrides: Record<string, unknown> = {}) {
  const events: string[] = [];
  const scope = {
    tenantId: TENANT_ID,
    authUserId: USER_ID,
    employeeId: EMPLOYEE_ID,
  };
  const batch = {
    id: BATCH_ID,
    tenant_id: TENANT_ID,
    project_id: PROJECT_ID,
    status: "pending_approval",
    version: 2,
    budget_status: "within_budget",
    created_by_employee_id: CREATOR_ID,
    ...overrides,
  };
  return {
    events,
    batch,
    access: {
      requireView: mock(async () => scope),
      requireManage: mock(async () => scope),
      requireApprove: mock(async () => scope),
      requireFinanceBudgetManage: mock(() => events.push("finance")),
      getVisibleProjectIds: mock(async () => [PROJECT_ID]),
      getVisibleProjectUpdateIds: mock(async () => [PROJECT_ID]),
      assertProjectRead: mock(async (
        _context: AuthContext,
        _projectId: string,
      ) => events.push("project-read")),
      assertProjectUpdate: mock(async (
        _context: AuthContext,
        _projectId: string,
      ) => events.push("project-update")),
    },
    repository: {
      listBatches: mock(async (input: unknown) => ({ input })),
      findBatch: mock(async () => batch),
      listItems: mock(async (input: unknown) => ({ input })),
      listRequisitions: mock(async (input: unknown) => ({ input })),
      listOrders: mock(async (input: unknown) => ({ input })),
      listProjectOptions: mock(async (input: unknown) => ({ input })),
      listCatalog: mock(async (input: unknown) => ({ input })),
      listCostCategories: mock(async (input: unknown) => ({ input })),
      saveDraft: mock(async (input: unknown) => {
        events.push("save");
        return { status: "saved", input };
      }),
      submit: mock(async (input: unknown) => {
        events.push("submit");
        return { status: "submitted", input };
      }),
      review: mock(async (input: unknown): Promise<unknown> => {
        events.push("review");
        return { status: "ordered", input };
      }),
      cancel: mock(async (input: unknown) => {
        events.push("cancel");
        return { status: "cancelled", input };
      }),
    },
    nowFactory: mock(() => new Date("2026-08-27T03:04:05.000Z")),
  };
}

async function serviceFor(overrides: Record<string, unknown> = {}) {
  const deps = dependencies(overrides);
  const { SupplierPurchaseBatchesService } = await import(
    "./supplier-purchase-batches"
  );
  return {
    deps,
    service: new SupplierPurchaseBatchesService(deps as never),
  };
}

const draftInput = {
  project_id: PROJECT_ID,
  expected_version: 0,
  reason: "现场补料",
  items: [{
    supplier_sku_id: SKU_ID,
    cost_category_id: COST_CATEGORY_ID,
    quantity: "2.5000",
  }],
};

describe("SupplierPurchaseBatchesService reads", () => {
  test("intersects list filters with visible project read scope", async () => {
    const { deps, service } = await serviceFor();

    await service.listBatches(auth(), {
      page: 2,
      pageSize: 100,
      projectId: PROJECT_ID,
      status: "pending_approval",
      keyword: "补料",
    });

    expect(deps.repository.listBatches).toHaveBeenCalledWith({
      tenant_id: TENANT_ID,
      visible_project_ids: [PROJECT_ID],
      page: 2,
      pageSize: 100,
      project_id: PROJECT_ID,
      status: "pending_approval",
      keyword: "补料",
    });
  });

  test("scopes detail and child reads and derives detail actions", async () => {
    const { deps, service } = await serviceFor({ status: "draft" });
    deps.access.getVisibleProjectUpdateIds.mockImplementation(
      async () => [PROJECT_ID],
    );
    const context = auth([
      "supplier.purchase-requisition.manage",
      "project.update",
      "supplier.master.manage",
      "supplier.catalog.manage",
      "supplier.product.manage",
      "supplier.cost-price.manage",
    ]);

    const detail = await service.getBatch(context, BATCH_ID);
    await service.listItems(context, BATCH_ID, { page: 1, pageSize: 20 });
    await service.listRequisitions(context, BATCH_ID, {
      page: 2,
      pageSize: 20,
    });
    await service.listOrders(context, BATCH_ID, { page: 3, pageSize: 20 });

    expect(detail).toMatchObject({
      id: BATCH_ID,
      actions: {
        can_edit: true,
        can_submit: true,
        can_review: false,
        can_cancel: true,
        can_create_supplier: true,
        can_create_catalog: true,
        can_create_purchasable_product: true,
      },
    });
    expect(deps.repository.findBatch).toHaveBeenCalledTimes(4);
    expect(deps.repository.listItems).toHaveBeenCalledWith({
      tenant_id: TENANT_ID,
      batch_id: BATCH_ID,
      visible_project_ids: [PROJECT_ID],
      page: 1,
      pageSize: 20,
    });
    expect(deps.repository.listRequisitions).toHaveBeenCalledWith(
      expect.objectContaining({
        batch_id: BATCH_ID,
        visible_project_ids: [PROJECT_ID],
        page: 2,
      }),
    );
    expect(deps.repository.listOrders).toHaveBeenCalledWith(
      expect.objectContaining({
        batch_id: BATCH_ID,
        visible_project_ids: [PROJECT_ID],
        page: 3,
      }),
    );
  });

  test("does not require project update permission to view detail actions", async () => {
    const { deps, service } = await serviceFor({ status: "draft" });
    deps.access.getVisibleProjectUpdateIds.mockImplementation(async () => {
      throw Errors.forbidden();
    });

    const detail = await service.getBatch(auth([
      "supplier.purchase-requisition.view",
      "project.read",
    ]), BATCH_ID);

    expect(detail.actions).toMatchObject({
      can_edit: false,
      can_submit: false,
      can_cancel: false,
    });
    expect(deps.access.getVisibleProjectUpdateIds).not.toHaveBeenCalled();
  });

  test("uses the designed access boundary for auxiliary pages", async () => {
    const { deps, service } = await serviceFor();
    const context = auth();

    await service.listProjectOptions(context, {
      page: 1,
      pageSize: 20,
      keyword: "一期",
      updatedWindow: "current_month",
      timezone: "Asia/Shanghai",
    });
    await service.listCatalog(context, {
      projectId: PROJECT_ID,
      page: 2,
      pageSize: 100,
      keyword: "瓷砖",
    });
    await service.listCostCategories(context, {
      page: 3,
      pageSize: 20,
    });

    expect(deps.access.requireView).toHaveBeenCalledTimes(1);
    expect(deps.access.requireManage).toHaveBeenCalledTimes(2);
    expect(deps.access.assertProjectUpdate).toHaveBeenCalledWith(
      context,
      PROJECT_ID,
    );
    expect(deps.repository.listProjectOptions).toHaveBeenCalledWith({
      tenant_id: TENANT_ID,
      visible_project_ids: [PROJECT_ID],
      page: 1,
      pageSize: 20,
      keyword: "一期",
      updated_at_from: "2026-07-31T16:00:00.000Z",
      updated_at_before: "2026-08-31T16:00:00.000Z",
    });
    expect(deps.repository.listCatalog).toHaveBeenCalledWith({
      tenant_id: TENANT_ID,
      project_id: PROJECT_ID,
      priced_at: "2026-08-27T03:04:05.000Z",
      page: 2,
      pageSize: 100,
      keyword: "瓷砖",
    });
    expect(deps.repository.listCostCategories).toHaveBeenCalledWith({
      tenant_id: TENANT_ID,
      page: 3,
      pageSize: 20,
    });
  });

  test("returns the same not-found response for missing and invisible batches", async () => {
    const missing = await serviceFor();
    missing.deps.repository.findBatch.mockImplementation(async () => null as never);
    const invisible = await serviceFor();
    invisible.deps.access.getVisibleProjectIds.mockImplementation(async () => []);

    for (const item of [missing, invisible]) {
      await expect(item.service.getBatch(auth(), BATCH_ID))
        .rejects.toMatchObject({
          statusCode: 404,
          code: "SUPPLIER_PURCHASE_BATCH_NOT_FOUND",
        });
    }
  });
});

describe("SupplierPurchaseBatchesService commands", () => {
  test("authorizes new and moved draft projects before save", async () => {
    const created = await serviceFor();
    await created.service.saveDraft(
      auth(),
      BATCH_ID,
      draftInput,
      "batch:save:new",
    );
    expect(created.deps.access.assertProjectUpdate).toHaveBeenCalledWith(
      auth(),
      PROJECT_ID,
    );
    expect(created.deps.repository.findBatch).not.toHaveBeenCalled();

    const moved = await serviceFor();
    moved.deps.access.getVisibleProjectUpdateIds.mockImplementation(
      async () => [PROJECT_ID, OTHER_PROJECT_ID],
    );
    await moved.service.saveDraft(auth(), BATCH_ID, {
      ...draftInput,
      expected_version: 1,
      project_id: OTHER_PROJECT_ID,
    }, "batch:save:moved");
    expect(moved.deps.access.assertProjectUpdate.mock.calls).toEqual([
      [expect.anything(), PROJECT_ID],
      [expect.anything(), OTHER_PROJECT_ID],
    ]);
    expect(moved.deps.repository.saveDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        tenant_id: TENANT_ID,
        batch_id: BATCH_ID,
        project_id: OTHER_PROJECT_ID,
        actor_user_id: USER_ID,
        actor_employee_id: EMPLOYEE_ID,
        idempotency_key: "batch:save:moved",
      }),
    );
  });

  test("never calls a command repository after project authorization fails", async () => {
    const created = await serviceFor();
    created.deps.access.assertProjectUpdate.mockImplementation(async () => {
      throw Errors.forbidden();
    });
    await expect(created.service.saveDraft(
      auth(), BATCH_ID, draftInput, "batch:save",
    )).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(created.deps.repository.saveDraft).not.toHaveBeenCalled();

    const current = await serviceFor();
    current.deps.access.getVisibleProjectUpdateIds.mockImplementation(
      async () => [],
    );
    await expect(current.service.submit(
      auth(), BATCH_ID, { expected_version: 2 }, "batch:submit",
    )).rejects.toMatchObject({
      code: "SUPPLIER_PURCHASE_BATCH_NOT_FOUND",
    });
    expect(current.deps.repository.submit).not.toHaveBeenCalled();
  });

  test("checks the current project before submit and cancel", async () => {
    const { deps, service } = await serviceFor();

    await service.submit(
      auth(), BATCH_ID, { expected_version: 2 }, "batch:submit",
    );
    await service.cancel(auth(), BATCH_ID, {
      expected_version: 2,
      reason: "计划调整",
    }, "batch:cancel");

    expect(deps.access.assertProjectUpdate).toHaveBeenCalledTimes(2);
    expect(deps.events).toEqual([
      "project-update", "submit", "project-update", "cancel",
    ]);
    expect(deps.repository.submit).toHaveBeenCalledWith(
      expect.objectContaining({
        expected_version: 2,
        idempotency_key: "batch:submit",
      }),
    );
    expect(deps.repository.cancel).toHaveBeenCalledWith(
      expect.objectContaining({ reason: "计划调整" }),
    );
  });

  test.each([
    ["pending_approval", 3, "approve", "SUPPLIER_PURCHASE_BATCH_VERSION_CONFLICT"],
  ] as const)(
    "blocks %s version %s before review",
    async (status, expectedVersion, action, code) => {
      const { deps, service } = await serviceFor({ status });
      await expect(service.review(auth(), BATCH_ID, {
        expected_version: expectedVersion,
        action,
      }, "batch:review")).rejects.toMatchObject({ statusCode: 409, code });
      expect(deps.repository.review).not.toHaveBeenCalled();
    },
  );

  test("blocks self review before finance and command", async () => {
    const { deps, service } = await serviceFor({
      created_by_employee_id: EMPLOYEE_ID,
      budget_status: "over_budget",
    });
    await expect(service.review(auth(), BATCH_ID, {
      expected_version: 2,
      action: "approve",
    }, "batch:review")).rejects.toMatchObject({
      code: "SUPPLIER_PURCHASE_BATCH_SELF_REVIEW",
    });
    expect(deps.access.requireFinanceBudgetManage).not.toHaveBeenCalled();
    expect(deps.repository.review).not.toHaveBeenCalled();
  });

  test.each([
    ["within_budget", "approve", false],
    ["over_budget", "approve", true],
    ["over_budget", "reject", false],
  ] as const)(
    "reviews %s with %s using the exact finance override",
    async (budgetStatus, action, canOverride) => {
      const { deps, service } = await serviceFor({
        budget_status: budgetStatus,
      });
      await service.review(auth(), BATCH_ID, {
        expected_version: 2,
        action,
        remark: action === "approve" ? "同意" : "驳回",
      }, `batch:${action}`);

      if (canOverride) {
        expect(deps.access.requireFinanceBudgetManage).toHaveBeenCalledWith(
          auth(),
        );
      } else {
        expect(deps.access.requireFinanceBudgetManage).not.toHaveBeenCalled();
      }
      expect(deps.repository.review).toHaveBeenCalledWith(
        expect.objectContaining({ action, can_override_budget: canOverride }),
      );
    },
  );

  test("lets terminal idempotent replay reach the event-first RPC", async () => {
    const { deps, service } = await serviceFor({
      status: "ordered",
      version: 3,
    });

    await service.review(auth(), BATCH_ID, {
      expected_version: 2,
      action: "approve",
    }, "batch:review:replay");

    expect(deps.repository.review).toHaveBeenCalledWith(
      expect.objectContaining({ expected_version: 2 }),
    );
  });

  test("maps persisted revision result to a refreshable 409", async () => {
    const { deps, service } = await serviceFor();
    const revisedBatch = { ...deps.batch, status: "draft", version: 3 };
    const details = [{
      kind: "item",
      supplier_sku_id: SKU_ID,
      reason: "SKU 已停用",
    }];
    deps.repository.review.mockImplementation(async () => ({
      status: "revision_required",
      idempotent: false,
      batch: revisedBatch,
      version: 3,
      error_code: "SUPPLIER_PURCHASE_BATCH_ITEM_UNAVAILABLE",
      details,
    }));

    await expect(service.review(auth(), BATCH_ID, {
      expected_version: 2,
      action: "approve",
    }, "batch:review")).rejects.toMatchObject({
      statusCode: 409,
      code: "SUPPLIER_PURCHASE_BATCH_ITEM_UNAVAILABLE",
      details: {
        batch: revisedBatch,
        version: 3,
        error_code: "SUPPLIER_PURCHASE_BATCH_ITEM_UNAVAILABLE",
        details,
      },
    });
  });
});
