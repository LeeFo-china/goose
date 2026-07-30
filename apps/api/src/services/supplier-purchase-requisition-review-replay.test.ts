import { describe, expect, mock, test } from "bun:test";

import { Errors } from "@/errors/error-factory";
import type {
  SupplierPurchaseRequisitionCommandResult,
} from "@/repositories/supplier-purchase-requisitions";
import type { AuthContext } from "@/services/authorization";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const TENANT_ID = "67000000-0000-4000-8000-000000000001";
const REQUISITION_ID = "67000000-0000-4000-8000-000000000002";
const PROJECT_ID = "67000000-0000-4000-8000-000000000003";
const RELATIONSHIP_ID = "67000000-0000-4000-8000-000000000004";
const USER_ID = "67000000-0000-4000-8000-000000000005";
const REQUESTER_ID = "67000000-0000-4000-8000-000000000006";
const REVIEWER_ID = "67000000-0000-4000-8000-000000000007";
const SUPPLIER_ID = "67000000-0000-4000-8000-000000000008";
const NOW = "2026-07-30T08:00:00.000Z";

const auth = {
  tenantId: TENANT_ID,
  authUserId: USER_ID,
  employeeId: REVIEWER_ID,
  permissions: [],
} as unknown as AuthContext;

function dependencies(options: {
  status: "approved" | "rejected" | "cancelled" | "converted";
  budgetStatus?: "within_budget" | "over_budget";
  requesterId?: string;
  financeDenied?: boolean;
}) {
  const events: string[] = [];
  const resultStatus = options.status === "approved" ? "approved" : "rejected";
  const replay: SupplierPurchaseRequisitionCommandResult = {
    requisition: {
      id: REQUISITION_ID,
      tenant_id: TENANT_ID,
      request_no: "PR-20260730-00000001",
      project_id: PROJECT_ID,
      tenant_supplier_id: RELATIONSHIP_ID,
      supplier_id: SUPPLIER_ID,
      status: resultStatus,
      budget_status: options.budgetStatus ?? "within_budget",
      currency: "CNY",
      reason: "测试采购申请",
      expected_delivery_date: null,
      remark: null,
      priced_at: NOW,
      subtotal_amount: "100.00",
      tax_amount: "13.00",
      total_amount: "113.00",
      purchase_order_id: null,
      version: 3,
      created_by_employee_id: options.requesterId ?? REQUESTER_ID,
      updated_by_employee_id: REVIEWER_ID,
      submitted_by_employee_id: REQUESTER_ID,
      submitted_at: NOW,
      reviewed_by_employee_id: REVIEWER_ID,
      reviewed_at: NOW,
      review_remark: "历史审核意见",
      cancelled_by_employee_id: null,
      cancelled_at: null,
      cancel_reason: null,
      created_at: NOW,
      updated_at: NOW,
    },
    status: resultStatus,
    idempotent: true,
    version: 3,
  };
  return {
    events,
    replay,
    access: {
      requireApprove: mock(async () => {
        events.push("approve-permission");
        return {
          tenantId: TENANT_ID,
          authUserId: USER_ID,
          employeeId: REVIEWER_ID,
        };
      }),
      getVisibleProjectIds: mock(async () => {
        events.push("project-read");
        return [PROJECT_ID];
      }),
      requireFinanceBudgetManage: mock(async () => {
        events.push("finance");
        if (options.financeDenied) throw Errors.forbidden();
      }),
    },
    repository: {
      findRequisitionScope: mock(async () => {
        events.push("scope");
        return {
          id: REQUISITION_ID,
          project_id: PROJECT_ID,
          tenant_supplier_id: RELATIONSHIP_ID,
          created_by_employee_id: options.requesterId ?? REQUESTER_ID,
          budget_status: options.budgetStatus ?? "within_budget",
          status: options.status,
          version: 3,
        };
      }),
      review: mock(async () => {
        events.push("review-rpc");
        return replay;
      }),
    },
    tenantSuppliers: {
      assertCanCreatePurchaseOrderForTenant: mock(async () => undefined),
    },
  };
}

async function serviceFor(
  options: Parameters<typeof dependencies>[0],
) {
  const deps = dependencies(options);
  const { SupplierPurchaseRequisitionsService } = await import(
    "./supplier-purchase-requisitions"
  );
  return {
    deps,
    service: new SupplierPurchaseRequisitionsService(deps as never),
  };
}

describe("SupplierPurchaseRequisitionsService terminal review replay", () => {
  test.each([
    ["approved", "approve", "requisition:approve"],
    ["rejected", "reject", "requisition:reject"],
  ] as const)(
    "lets terminal %s reach event-first replay with the original request",
    async (status, action, idempotencyKey) => {
      const { deps, service } = await serviceFor({ status });

      const result = await service.review(auth, REQUISITION_ID, {
        expected_version: 2,
        action,
        remark: "历史审核意见",
      }, idempotencyKey);

      expect(result).toBe(deps.replay);
      expect(deps.events).toEqual([
        "approve-permission",
        "project-read",
        "scope",
        "review-rpc",
      ]);
      expect(deps.repository.review).toHaveBeenCalledWith({
        tenant_id: TENANT_ID,
        requisition_id: REQUISITION_ID,
        expected_version: 2,
        action,
        remark: "历史审核意见",
        actor_user_id: USER_ID,
        actor_employee_id: REVIEWER_ID,
        idempotency_key: idempotencyKey,
      });
    },
  );

  test("still requires finance before an over-budget terminal approve replay", async () => {
    const { deps, service } = await serviceFor({
      status: "approved",
      budgetStatus: "over_budget",
      financeDenied: true,
    });

    await expect(service.review(auth, REQUISITION_ID, {
      expected_version: 2,
      action: "approve",
    }, "requisition:approve")).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(deps.events).toEqual([
      "approve-permission",
      "project-read",
      "scope",
      "finance",
    ]);
    expect(deps.repository.review).not.toHaveBeenCalled();
  });

  test("still blocks requester self-review before terminal replay", async () => {
    const { deps, service } = await serviceFor({
      status: "approved",
      budgetStatus: "over_budget",
      requesterId: REVIEWER_ID,
    });

    await expect(service.review(auth, REQUISITION_ID, {
      expected_version: 2,
      action: "approve",
    }, "requisition:approve")).rejects.toMatchObject({
      code: "SUPPLIER_PURCHASE_REQUISITION_SELF_REVIEW",
    });
    expect(deps.access.requireFinanceBudgetManage).not.toHaveBeenCalled();
    expect(deps.repository.review).not.toHaveBeenCalled();
  });
});
