import { describe, expect, mock, test } from "bun:test";

import { Errors } from "@/errors/error-factory";
import type { AuthContext } from "@/services/authorization";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const TENANT_ID = "b2000000-0000-4000-8000-000000000001";
const BATCH_ID = "b2000000-0000-4000-8000-000000000002";
const PROJECT_ID = "b2000000-0000-4000-8000-000000000003";
const USER_ID = "b2000000-0000-4000-8000-000000000004";
const EMPLOYEE_ID = "b2000000-0000-4000-8000-000000000005";

async function subject(workflowResult: unknown) {
  const { SupplierPurchaseBatchesService } = await import(
    "@/services/supplier-purchase-batches"
  );
  const batch = {
    id: BATCH_ID,
    tenant_id: TENANT_ID,
    project_id: PROJECT_ID,
    status: "pending_approval",
    version: 2,
    approval_round: 4,
    budget_status: "over_budget",
    created_by_employee_id: "b2000000-0000-4000-8000-000000000099",
  };
  const completeLegacyReview = mock(async (): Promise<unknown> =>
    workflowResult);
  const legacyReview = mock(async () => ({ status: "ordered" }));
  const requireFinanceBudgetManage = mock(() => undefined);
  const service = new SupplierPurchaseBatchesService({
    access: {
      requireApprove: mock(async () => ({
        tenantId: TENANT_ID,
        authUserId: USER_ID,
        employeeId: EMPLOYEE_ID,
      })),
      getVisibleProjectIds: mock(async () => [PROJECT_ID]),
      assertProjectRead: mock(async () => undefined),
      requireFinanceBudgetManage,
    },
    repository: { findBatch: mock(async () => batch), review: legacyReview },
    workflowRuntime: {
      isEnabled: mock(async () => true),
      submit: mock(async () => ({ status: "submitted" })),
    },
    workflowReviewBridge: { completeLegacyReview },
  } as never);
  return {
    batch,
    completeLegacyReview,
    legacyReview,
    requireFinanceBudgetManage,
    service,
  };
}

describe("SupplierPurchaseBatchesService workflow review compatibility", () => {
  test("routes enabled review through the workflow bridge", async () => {
    const workflowResult = {
      status: "pending_approval",
      idempotent: false,
      version: 2,
      workflow_state: {
        instance_status: "running",
        current_node_key: "finance_review",
      },
    };
    const current = await subject(workflowResult);

    const result = await current.service.review(auth(), BATCH_ID, {
      expected_version: 2,
      action: "approve",
      remark: "采购审批通过",
    }, "batch:workflow-review");

    expect(result).toEqual(workflowResult);
    expect(current.completeLegacyReview).toHaveBeenCalledWith({
      authContext: auth(),
      batch: current.batch,
      action: "approve",
      reason: "采购审批通过",
      output: { compat_source: "supplier_purchase_batch_review" },
      idempotencyKey: "batch:workflow-review",
    });
    expect(current.legacyReview).not.toHaveBeenCalled();
    expect(current.requireFinanceBudgetManage).not.toHaveBeenCalled();
  });

  test("never falls back when workflow resolution fails", async () => {
    const current = await subject(null);
    current.completeLegacyReview.mockImplementation(async () => {
      throw Errors.business(
        409,
        "采购批次审批流程状态冲突，请刷新后重试",
        "SUPPLIER_PURCHASE_BATCH_WORKFLOW_CONFLICT",
      );
    });

    await expect(current.service.review(auth(), BATCH_ID, {
      expected_version: 2,
      action: "approve",
    }, "batch:workflow-conflict")).rejects.toMatchObject({
      statusCode: 409,
      code: "SUPPLIER_PURCHASE_BATCH_WORKFLOW_CONFLICT",
    });
    expect(current.legacyReview).not.toHaveBeenCalled();
  });

  test("adapts terminal workflow results to the legacy review response", async () => {
    const current = await subject({
      status: "ordered",
      idempotent: false,
      batch: { id: BATCH_ID },
      version: 3,
      requisition_ids: ["requisition-1"],
      orders: [{ id: "order-1" }],
      workflow_state: { instance_status: "completed" },
    });

    expect(await current.service.review(auth(), BATCH_ID, {
      expected_version: 2,
      action: "approve",
    }, "batch:workflow-ordered")).toEqual({
      status: "ordered",
      idempotent: false,
      batch: { id: BATCH_ID },
      version: 3,
      requisition_ids: ["requisition-1"],
      orders: [{ id: "order-1" }],
    });
  });
});

function auth(): AuthContext {
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
    permissions: [],
  };
}
