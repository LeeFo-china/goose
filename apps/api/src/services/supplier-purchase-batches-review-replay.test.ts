import { describe, expect, mock, test } from "bun:test";

import { Errors } from "@/errors/error-factory";
import type { AuthContext } from "@/services/authorization";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const TENANT_ID = "6a000000-0000-4000-8000-000000000001";
const BATCH_ID = "6a000000-0000-4000-8000-000000000002";
const PROJECT_ID = "6a000000-0000-4000-8000-000000000003";
const USER_ID = "6a000000-0000-4000-8000-000000000004";
const REVIEWER_ID = "6a000000-0000-4000-8000-000000000005";
const CREATOR_ID = "6a000000-0000-4000-8000-000000000006";
const SKU_ID = "6a000000-0000-4000-8000-000000000007";

const auth: AuthContext = {
  authUserId: USER_ID,
  employeeId: REVIEWER_ID,
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
  permissions: [],
};

async function serviceWithReview(review: (input: unknown) => Promise<unknown>) {
  const { SupplierPurchaseBatchesService } = await import(
    "./supplier-purchase-batches"
  );
  const batch = {
    id: BATCH_ID,
    tenant_id: TENANT_ID,
    project_id: PROJECT_ID,
    status: "draft",
    version: 3,
    budget_status: "unchecked",
    created_by_employee_id: CREATOR_ID,
  };
  const reviewMock = mock(review);
  const service = new SupplierPurchaseBatchesService({
    access: {
      requireView: mock(async () => scope()),
      requireManage: mock(async () => scope()),
      requireApprove: mock(async () => scope()),
      requireFinanceBudgetManage: mock(() => undefined),
      getVisibleProjectIds: mock(async () => [PROJECT_ID]),
      getVisibleProjectUpdateIds: mock(async () => [PROJECT_ID]),
      assertProjectRead: mock(async () => undefined),
      assertProjectUpdate: mock(async () => undefined),
    },
    repository: {
      listBatches: mock(async () => emptyPage()),
      findBatch: mock(async () => batch),
      listItems: mock(async () => emptyPage()),
      listRequisitions: mock(async () => emptyPage()),
      listOrders: mock(async () => emptyPage()),
      listProjectOptions: mock(async () => emptyPage()),
      listCostCategories: mock(async () => emptyPage()),
      listCatalog: mock(async () => emptyPage()),
      saveDraft: mock(async () => ({})),
      submit: mock(async () => ({})),
      review: reviewMock,
      cancel: mock(async () => ({})),
    },
  } as never);
  return { batch, reviewMock, service };
}

function scope() {
  return {
    tenantId: TENANT_ID,
    authUserId: USER_ID,
    employeeId: REVIEWER_ID,
  };
}

function emptyPage() {
  return {
    list: [],
    pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
  };
}

describe("SupplierPurchaseBatchesService review replay", () => {
  test("replays a persisted revision with the original version and key", async () => {
    const details = [{
      kind: "item" as const,
      supplier_sku_id: SKU_ID,
      reason: "SKU 已停用",
    }];
    const fixture = await serviceWithReview(async () => ({
      status: "revision_required",
      idempotent: true,
      batch: fixture.batch,
      version: 3,
      error_code: "SUPPLIER_PURCHASE_BATCH_ITEM_UNAVAILABLE",
      details,
    }));

    await expect(fixture.service.review(auth, BATCH_ID, {
      expected_version: 2,
      action: "approve",
    }, "batch:review:original")).rejects.toMatchObject({
      statusCode: 409,
      code: "SUPPLIER_PURCHASE_BATCH_ITEM_UNAVAILABLE",
      details: {
        batch: fixture.batch,
        version: 3,
        error_code: "SUPPLIER_PURCHASE_BATCH_ITEM_UNAVAILABLE",
        details,
      },
    });
    expect(fixture.reviewMock).toHaveBeenCalledWith(expect.objectContaining({
      batch_id: BATCH_ID,
      expected_version: 2,
      idempotency_key: "batch:review:original",
    }));
  });

  test("lets the RPC return a structured conflict for an ordinary draft", async () => {
    const rpcDetails = { version: 3, status: "draft" };
    const fixture = await serviceWithReview(async () => {
      throw Errors.business(
        409,
        "采购批次当前状态不允许审批",
        "SUPPLIER_PURCHASE_BATCH_STATE_CONFLICT",
        rpcDetails,
      );
    });

    await expect(fixture.service.review(auth, BATCH_ID, {
      expected_version: 3,
      action: "reject",
      remark: "草稿不能驳回",
    }, "batch:review:draft")).rejects.toMatchObject({
      statusCode: 409,
      code: "SUPPLIER_PURCHASE_BATCH_STATE_CONFLICT",
      details: rpcDetails,
    });
    expect(fixture.reviewMock).toHaveBeenCalledTimes(1);
  });
});
