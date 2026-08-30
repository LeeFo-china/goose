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

async function subject(
  workflowResult: unknown,
  batchOverrides: Record<string, unknown> = {},
  workflowEnabled = true,
) {
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
    submitted_by_employee_id: "b2000000-0000-4000-8000-000000000098",
    ...batchOverrides,
  };
  const completeLegacyReview = mock(async (): Promise<unknown> =>
    workflowResult);
  const legacyReview = mock(async () => ({ status: "ordered" }));
  const requireFinanceBudgetManage = mock(() => undefined);
  const scope = { tenantId: TENANT_ID, authUserId: USER_ID,
    employeeId: EMPLOYEE_ID };
  const requireActorScope = mock(async () => scope);
  const requireView = mock(async (context: AuthContext) => {
    if (!hasPermission(context, "supplier.purchase-requisition.view")) {
      throw Errors.forbidden();
    }
    return scope;
  });
  const requireApprove = mock(async (context: AuthContext) => {
    if (!hasPermission(context, "supplier.purchase-requisition.approve")) {
      throw Errors.forbidden();
    }
    return scope;
  });
  const service = new SupplierPurchaseBatchesService({
    access: {
      requireActorScope,
      requireView,
      requireApprove,
      getVisibleProjectIds: mock(async () => [PROJECT_ID]),
      assertProjectRead: mock(async () => undefined),
      requireFinanceBudgetManage,
    },
    repository: { findBatch: mock(async () => batch), review: legacyReview },
    workflowRuntime: {
      isEnabled: mock(async () => workflowEnabled),
      submit: mock(async () => ({ status: "submitted" })),
    },
    workflowReviewBridge: { completeLegacyReview },
  } as never);
  return {
    batch,
    completeLegacyReview,
    legacyReview,
    requireFinanceBudgetManage,
    requireActorScope,
    requireView,
    requireApprove,
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
      expectedVersion: 2,
      output: {},
      idempotencyKey: "batch:workflow-review",
    });
    expect(current.legacyReview).not.toHaveBeenCalled();
    expect(current.requireFinanceBudgetManage).not.toHaveBeenCalled();
    expect(current.requireView).toHaveBeenCalledWith(auth());
    expect(current.requireApprove).not.toHaveBeenCalled();
  });

  test("keeps fixed review available to approve-only users when disabled", async () => {
    const current = await subject({ status: "ordered" }, {}, false);
    const approveOnly = auth([
      "supplier.purchase-requisition.approve",
      "project.read",
    ]);

    await expect(current.service.review(approveOnly, BATCH_ID, {
      expected_version: 2,
      action: "approve",
    }, "batch:fixed-approve-only")).resolves.toMatchObject({
      status: "ordered",
    });
    expect(current.requireActorScope).toHaveBeenCalledWith(approveOnly);
    expect(current.requireApprove).toHaveBeenCalledWith(approveOnly);
    expect(current.requireView).not.toHaveBeenCalled();
    expect(current.legacyReview).toHaveBeenCalled();
    expect(current.completeLegacyReview).not.toHaveBeenCalled();
  });

  test("requires view after the workflow flag is enabled", async () => {
    const current = await subject({ status: "ordered" });
    const approveOnly = auth([
      "supplier.purchase-requisition.approve",
      "project.read",
    ]);

    await expect(current.service.review(approveOnly, BATCH_ID, {
      expected_version: 2,
      action: "approve",
    }, "batch:workflow-approve-only")).rejects.toMatchObject({
      statusCode: 403,
      code: "FORBIDDEN",
    });
    expect(current.requireActorScope).toHaveBeenCalledWith(approveOnly);
    expect(current.requireApprove).not.toHaveBeenCalled();
    expect(current.completeLegacyReview).not.toHaveBeenCalled();
  });

  test("lets a finance-only workflow assignee reach the bridge", async () => {
    const current = await subject({ status: "ordered" });
    const finance = auth([
      "supplier.purchase-requisition.view",
      "project.read",
      "finance.budget.manage",
    ]);

    await expect(current.service.review(finance, BATCH_ID, {
      expected_version: 2,
      action: "approve",
    }, "batch:workflow-finance")).resolves.toMatchObject({ status: "ordered" });
    expect(current.requireView).toHaveBeenCalledWith(finance);
    expect(current.requireApprove).not.toHaveBeenCalled();
    expect(current.completeLegacyReview).toHaveBeenCalled();
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
    }, {
      status: "ordered",
      version: 3,
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

  test("does not apply the legacy creator self-review boundary when enabled", async () => {
    const current = await subject({ status: "rejected" }, {
      created_by_employee_id: EMPLOYEE_ID,
      submitted_by_employee_id: "b2000000-0000-4000-8000-000000000097",
    });

    await expect(current.service.review(auth(), BATCH_ID, {
      expected_version: 2,
      action: "reject",
      remark: "不同意",
    }, "batch:workflow-created-by-reviewer")).resolves.toEqual({
      status: "rejected",
    });
    expect(current.completeLegacyReview).toHaveBeenCalled();
    expect(current.requireApprove).not.toHaveBeenCalled();
  });
});

function auth(permissionCodes = [
  "supplier.purchase-requisition.view",
  "supplier.purchase-requisition.approve",
  "project.read",
]): AuthContext {
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
    permissions: permissionCodes.map((code) => ({ code, scope: "all" })),
  };
}

function hasPermission(context: AuthContext, code: string): boolean {
  return context.permissions.some((permission) => permission.code === code);
}
