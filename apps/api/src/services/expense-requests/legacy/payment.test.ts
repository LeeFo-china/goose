import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { AuthContext } from "@/services/authorization";

const existingExpense = {
  id: "expense-1",
  tenant_id: "tenant-1",
  employee_id: "employee-applicant",
  project_id: "project-1",
  status: "approved",
  total_amount: 1000,
  assignee_id: "finance-1",
  approvals: [],
};

const settlement = {
  id: "settlement-1",
  expense_request_id: "expense-1",
  tenant_id: "tenant-1",
  payee_name: "供应商",
  payee_bank: null,
  payee_account: null,
  method: "cash",
  paid_amount: 1000,
  paid_at: "2026-06-23T10:00:00.000Z",
  paid_by: "finance-1",
  evidence_images: ["expense-request/smoke/evidence.jpg"],
  remark: "费用付款 smoke",
};

const findById = mock(async () => existingExpense);
const hasSettlement = mock(async () => false);
const findSettlementByExpenseRequest = mock(async () => settlement);
const createSettlement = mock(async () => settlement);
const employeeExists = mock(async () => true);
const updateExpense = mock(async () => null);
const createExpenseLedger = mock(async () => ({ id: "ledger-1" }));
const syncPay = mock(async () => ({ status: "advanced" }));

mock.module("@/repositories/expense-requests", () => ({
  expenseRequestRepository: {
    findById,
    hasSettlement,
    findSettlementByExpenseRequest,
    createSettlement,
    employeeExists,
    update: updateExpense,
  },
}));

mock.module("@/services/finance-ledger", () => ({
  financeLedgerService: {
    createExpenseSettlementLedger: createExpenseLedger,
  },
}));

mock.module("@/services/expense-workflow-runtime", () => ({
  expenseWorkflowRuntimeService: {
    syncPay,
  },
}));

mock.module("@/services/access-policy", () => ({
  accessPolicyService: {
    assertTenantContext: mock((authContext: AuthContext) => authContext.tenantId),
    assertPermission: mock(() => "all"),
  },
}));

function authContext(): AuthContext {
  return {
    authUserId: "auth-1",
    employeeId: "finance-1",
    employeeName: "财务",
    employeeStatus: "active",
    tenantId: "tenant-1",
    tenantName: "租户",
    tenantSlug: "tenant",
    tenantStatus: "active",
    isPlatformAdmin: false,
    departmentId: null,
    tenantDepartmentId: null,
    departmentCode: "FINANCE",
    departmentName: "财务部",
    postId: null,
    postName: null,
    avatar: null,
    roleCodes: ["finance_base"],
    roles: [],
    permissions: [{ code: "expense_request.pay", scope: "all" }],
  };
}

function paymentServiceContext() {
  return {
    requireTenantId: (context: AuthContext) => context.tenantId,
    assertCanReadExpenseRequest: mock(async () => null),
    assertCanOperateExpenseRequest: mock(async () => null),
    ensureCurrentEmployee: mock(() => null),
    assertEmployeeExists: mock(async () => null),
    getApprovalRound: mock(() => 1),
    appendApprovalOnce: mock(async () => null),
    getLatestExpenseRequest: mock(async () => ({
      ...existingExpense,
      status: "paid",
      completed_at: "2026-06-23T10:00:00.000Z",
      settlement,
    })),
  };
}

describe("payExpenseRequest", () => {
  beforeEach(() => {
    findById.mockClear();
    hasSettlement.mockReset();
    hasSettlement.mockImplementation(async () => false);
    findSettlementByExpenseRequest.mockClear();
    createSettlement.mockClear();
    createExpenseLedger.mockClear();
    syncPay.mockClear();
  });

  test("writes expense settlement ledger after successful payment registration", async () => {
    const { payExpenseRequest } = await import("./payment");

    await payExpenseRequest.call(
      paymentServiceContext(),
      authContext(),
      "expense-1",
      {
        payee_name: "供应商",
        payee_bank: null,
        payee_account: null,
        method: "cash",
        paid_amount: 1000,
        paid_at: "2026-06-23T10:00:00.000Z",
        paid_by: "finance-1",
        evidence_images: ["expense-request/smoke/evidence.jpg"],
        remark: "费用付款 smoke",
      },
      { workflowNodeKey: "payment" },
    );

    expect(createExpenseLedger).toHaveBeenCalledWith({
      tenant_id: "tenant-1",
      project_id: "project-1",
      direction: "out",
      entry_type: "expense_settlement",
      amount: 1000,
      occurred_at: "2026-06-23T10:00:00.000Z",
      source_type: "expense_settlement",
      source_id: "settlement-1",
      expense_request_id: "expense-1",
      expense_settlement_id: "settlement-1",
      handled_by: "finance-1",
      summary: "费用付款：供应商",
      metadata: {
        expense_request_id: "expense-1",
        settlement_method: "cash",
        payee_name: "供应商",
      },
    });
    expect(syncPay).toHaveBeenCalled();
  });

  test("reuses existing settlement and backfills ledger idempotently on retry", async () => {
    const { payExpenseRequest } = await import("./payment");
    hasSettlement.mockImplementationOnce(async () => true);

    await payExpenseRequest.call(
      paymentServiceContext(),
      authContext(),
      "expense-1",
      {
        payee_name: "供应商",
        payee_bank: null,
        payee_account: null,
        method: "cash",
        paid_amount: 1000,
        paid_at: "2026-06-23T10:00:00.000Z",
        paid_by: "finance-1",
        evidence_images: ["expense-request/smoke/evidence.jpg"],
        remark: "费用付款 smoke 重试",
      },
      { workflowNodeKey: "payment" },
    );

    expect(createSettlement).not.toHaveBeenCalled();
    expect(createExpenseLedger).toHaveBeenCalledWith(
      expect.objectContaining({
        tenant_id: "tenant-1",
        entry_type: "expense_settlement",
        source_type: "expense_settlement",
        source_id: "settlement-1",
        expense_request_id: "expense-1",
        expense_settlement_id: "settlement-1",
      }),
    );
  });
});
