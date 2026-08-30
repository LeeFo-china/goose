import { describe, expect, mock, test } from "bun:test";

import type { AuthContext } from "@/services/authorization";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const TENANT_ID = "6b000000-0000-4000-8000-000000000001";
const BATCH_ID = "6b000000-0000-4000-8000-000000000002";
const PROJECT_ID = "6b000000-0000-4000-8000-000000000003";
const USER_ID = "6b000000-0000-4000-8000-000000000004";
const CREATOR_ID = "6b000000-0000-4000-8000-000000000005";
const SUBMITTER_ID = "6b000000-0000-4000-8000-000000000006";
const SKU_ID = "6b000000-0000-4000-8000-000000000007";
const COST_CATEGORY_ID = "6b000000-0000-4000-8000-000000000008";

function auth(): AuthContext {
  return {
    authUserId: USER_ID,
    employeeId: SUBMITTER_ID,
    tenantId: TENANT_ID,
    tenantName: "测试租户",
    tenantSlug: "test",
    tenantStatus: "active",
    isPlatformAdmin: false,
    employeeName: "提交人",
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
    permissions: [
      { code: "supplier.purchase-requisition.approve", scope: "all" },
      { code: "project.read", scope: "all" },
    ],
  };
}

function batch() {
  return {
    id: BATCH_ID,
    tenant_id: TENANT_ID,
    project_id: PROJECT_ID,
    status: "pending_approval",
    version: 2,
    budget_status: "within_budget",
    created_by_employee_id: CREATOR_ID,
    submitted_by_employee_id: SUBMITTER_ID,
  };
}

async function fixture(input: {
  readScope: string[] | null;
  updateScope: string[] | null;
}) {
  const { SupplierPurchaseBatchesService } = await import(
    "./supplier-purchase-batches"
  );
  const actorScope = {
    tenantId: TENANT_ID,
    authUserId: USER_ID,
    employeeId: SUBMITTER_ID,
  };
  const completeLegacyReview = mock(async () => null);
  const replayExactLegacyReview = mock(async () => ({
    matched: false as const,
  }));
  const repository = {
    listBatches: mock(async () => emptyPage()),
    findBatch: mock(async () => batch()),
    listItems: mock(async () => emptyPage()),
    listRequisitions: mock(async () => emptyPage()),
    listOrders: mock(async () => emptyPage()),
    listProjectOptions: mock(async () => emptyPage()),
    listCostCategories: mock(async () => emptyPage()),
    listCatalog: mock(async () => emptyPage()),
    saveDraft: mock(async () => ({ status: "saved" })),
    submit: mock(async () => ({ status: "submitted" })),
    review: mock(async () => ({ status: "ordered" })),
    cancel: mock(async () => ({ status: "cancelled" })),
  };
  const service = new SupplierPurchaseBatchesService({
    access: {
      requireActorScope: mock(async () => actorScope),
      requireView: mock(async () => actorScope),
      requireManage: mock(async () => actorScope),
      requireApprove: mock(async () => actorScope),
      requireFinanceBudgetManage: mock(() => undefined),
      getVisibleProjectIds: mock(async () => input.readScope),
      getVisibleProjectUpdateIds: mock(async () => input.updateScope),
      assertProjectRead: mock(async () => undefined),
      assertProjectUpdate: mock(async () => undefined),
    },
    repository,
    workflowRuntime: {
      isEnabled: mock(async () => false),
      submit: mock(async () => ({})),
    },
    workflowReviewBridge: {
      completeLegacyReview,
      replayExactLegacyReview,
    },
  } as never);
  return {
    completeLegacyReview,
    replayExactLegacyReview,
    repository,
    service,
  };
}

function emptyPage() {
  return {
    list: [],
    pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
  };
}

describe("SupplierPurchaseBatchesService quality boundaries", () => {
  test("detail actions do not let the submitter review", async () => {
    const { completeLegacyReview, replayExactLegacyReview, service } =
      await fixture({
        readScope: [PROJECT_ID],
        updateScope: [],
      });

    const detail = await service.getBatch(auth(), BATCH_ID);

    expect(detail.actions.can_review).toBe(false);
    expect(completeLegacyReview).not.toHaveBeenCalled();
    expect(replayExactLegacyReview).not.toHaveBeenCalled();
  });

  test("empty project scopes return not-found without reading a batch", async () => {
    const {
      completeLegacyReview,
      replayExactLegacyReview,
      repository,
      service,
    } = await fixture({
      readScope: [],
      updateScope: [],
    });
    const context = auth();
    const operations = [
      () => service.getBatch(context, BATCH_ID),
      () => service.listItems(context, BATCH_ID, { page: 1, pageSize: 20 }),
      () => service.listRequisitions(context, BATCH_ID, {
        page: 1,
        pageSize: 20,
      }),
      () => service.listOrders(context, BATCH_ID, { page: 1, pageSize: 20 }),
      () => service.saveDraft(context, BATCH_ID, {
        project_id: PROJECT_ID,
        expected_version: 1,
        reason: "补料",
        items: [{
          supplier_sku_id: SKU_ID,
          cost_category_id: COST_CATEGORY_ID,
          quantity: "1",
        }],
      }, "batch:save"),
      () => service.submit(
        context,
        BATCH_ID,
        { expected_version: 2 },
        "batch:submit",
      ),
      () => service.cancel(context, BATCH_ID, {
        expected_version: 2,
        reason: "计划调整",
      }, "batch:cancel"),
      () => service.review(context, BATCH_ID, {
        expected_version: 2,
        action: "approve",
      }, "batch:review"),
    ];

    for (const operation of operations) {
      await expect(operation()).rejects.toMatchObject({
        statusCode: 404,
        code: "SUPPLIER_PURCHASE_BATCH_NOT_FOUND",
      });
    }

    expect(repository.findBatch).not.toHaveBeenCalled();
    for (const command of [
      repository.saveDraft,
      repository.submit,
      repository.cancel,
      repository.review,
    ]) expect(command).not.toHaveBeenCalled();
    expect(completeLegacyReview).not.toHaveBeenCalled();
    expect(replayExactLegacyReview).not.toHaveBeenCalled();
  });

  test("null project scope still loads an all-scope batch", async () => {
    const {
      completeLegacyReview,
      replayExactLegacyReview,
      repository,
      service,
    } = await fixture({
      readScope: null,
      updateScope: null,
    });

    await expect(service.getBatch(auth(), BATCH_ID)).resolves.toMatchObject({
      id: BATCH_ID,
    });
    expect(repository.findBatch).toHaveBeenCalledWith(TENANT_ID, BATCH_ID);
    expect(completeLegacyReview).not.toHaveBeenCalled();
    expect(replayExactLegacyReview).not.toHaveBeenCalled();
  });
});
