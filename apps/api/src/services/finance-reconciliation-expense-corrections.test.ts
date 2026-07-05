import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { FinanceLedgerEntryInput } from "@/repositories/finance-ledger";
import type { FinanceReconciliationCandidateRows } from "@/repositories/finance-reconciliation";
import type { CreateFinanceReconciliationActionInput } from "@/repositories/finance-reconciliation-actions";
import type { AuthContext } from "@/services/authorization";
import {
  reconciliationCandidateRows,
  reconciliationCandidateRowsWithExpenseExceptions,
  reconciliationProjectSummaryTotals,
} from "@/services/finance-reconciliation.test-fixtures";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const listCandidateRows = mock(async (): Promise<FinanceReconciliationCandidateRows> =>
  reconciliationCandidateRowsWithExpenseExceptions
);
const getProjectSummaryTotals = mock(async () => reconciliationProjectSummaryTotals);
const listLatestActions = mock(async () => new Map());
const listActions = mock(async () => ({ list: [], pagination: {
  page: 1,
  pageSize: 10,
  total: 0,
  totalPages: 0,
} }));
const createAction = mock(async (input: CreateFinanceReconciliationActionInput) => ({
  id: "action-1",
  tenant_id: input.tenantId,
  exception_fingerprint: input.exceptionFingerprint,
  exception_code: input.exceptionCode,
  subject_type: input.subjectType,
  subject_id: input.subjectId,
  project_id: input.projectId,
  action: input.action,
  remark: input.remark,
  actor_employee_id: input.actorEmployeeId,
  actor_employee_name: "财务",
  created_at: "2026-06-30T08:00:00.000Z",
}));
const getExpenseSettlementContext = mock(async () => ({
  settlement: {
    id: "expense-settlement-without-ledger",
    expense_request_id: "expense-request-1",
    payee_name: "材料供应商",
    method: "bank_transfer",
    paid_amount: 1200,
    paid_at: "2026-06-25T10:00:00.000Z",
    paid_by: "employee-pay",
    remark: "材料款打款",
  },
  expense_request: {
    id: "expense-request-1",
    title: "材料采购",
    project_id: "project-expense-1",
    project_name: "费用未入账项目",
    cost_category_id: "cost-category-1",
    total_amount: 1200,
  },
  ledgers: [],
}));
const getExpenseLedgerContext = mock(async () => ({
  ledger: {
    id: "expense-ledger-without-category",
    project_id: "project-expense-3",
    project_name: "费用未归集项目",
    cost_category_id: null,
    amount: 888,
    occurred_at: "2026-06-27T10:00:00.000Z",
    expense_request_id: "expense-request-3",
    expense_settlement_id: "expense-settlement-3",
  },
  expense_request: {
    id: "expense-request-3",
    title: "辅材采购",
    project_id: "project-expense-3",
    project_name: "费用未归集项目",
    cost_category_id: null,
    total_amount: 888,
  },
  settlement: {
    id: "expense-settlement-3",
    paid_amount: 888,
    paid_at: "2026-06-27T10:00:00.000Z",
  },
}));
const createExpenseSettlementLedger = mock(async (input: FinanceLedgerEntryInput) => ({
  id: "generated-expense-ledger-1",
  ...input,
}));
const updateExpenseLedgerCostCategory = mock(async (
  _authContext: AuthContext,
  ledgerId: string,
  input: { cost_category_id: string | null },
) => ({
  id: ledgerId,
  tenant_id: "tenant-1",
  project_id: "project-expense-3",
  cost_category_id: input.cost_category_id,
  direction: "out",
  entry_type: "expense_settlement",
  amount: 888,
  occurred_at: "2026-06-27T10:00:00.000Z",
}));

const accessPolicy = {
  assertTenantContext: mock((authContext: AuthContext) => {
    if (!authContext.tenantId) {
      throw Object.assign(new Error("缺少租户上下文"), {
        statusCode: 403,
        code: "TENANT_CONTEXT_REQUIRED",
      });
    }
    return authContext.tenantId;
  }),
  hasPermission: mock((authContext: AuthContext, permissionCode: string) =>
    authContext.permissions.some((permission) => permission.code === permissionCode)
  ),
  canAccessProject: mock(async () => true),
};

const baseAuthContext = {
  authUserId: "auth-1",
  employeeId: "employee-1",
  tenantId: "tenant-1",
  tenantName: null,
  tenantSlug: null,
  tenantStatus: "active",
  isPlatformAdmin: false,
  employeeName: "财务",
  employeeStatus: "active",
  departmentId: null,
  tenantDepartmentId: null,
  departmentCode: "FINANCE",
  departmentName: "财务部",
  postId: null,
  postName: null,
  avatar: null,
  roleCodes: [],
  roles: [],
} satisfies Omit<AuthContext, "permissions">;

function authContextWithPermissions(
  permissions: AuthContext["permissions"],
): AuthContext {
  return {
    ...baseAuthContext,
    permissions,
  };
}

async function createService() {
  const { FinanceReconciliationService } = await import(
    "./finance-reconciliation"
  );
  return new FinanceReconciliationService({
    repository: {
      listCandidateRows,
      getProjectSummaryTotals,
    },
    actionsRepository: {
      listLatestActions,
      listActions,
      createAction,
    },
    correctionDependencies: {
      expenseCorrectionRepository: {
        getExpenseSettlementContext,
        getExpenseLedgerContext,
      },
      ledgerService: {
        createExpenseSettlementLedger,
        updateCostCategory: updateExpenseLedgerCostCategory,
      },
    },
    accessPolicyService: accessPolicy,
  });
}

describe("financeReconciliationService expense corrections", () => {
  beforeEach(() => {
    listCandidateRows.mockClear();
    getProjectSummaryTotals.mockClear();
    listLatestActions.mockClear();
    listActions.mockClear();
    createAction.mockClear();
    getExpenseSettlementContext.mockClear();
    getExpenseLedgerContext.mockClear();
    createExpenseSettlementLedger.mockClear();
    updateExpenseLedgerCostCategory.mockClear();
    listCandidateRows.mockImplementation(async () =>
      reconciliationCandidateRowsWithExpenseExceptions
    );
    listLatestActions.mockImplementation(async () => new Map());
  });

  test("returns expense exception detail with context and available actions", async () => {
    const service = await createService();

    const result = await service.getExceptionDetail(
      authContextWithPermissions([{ code: "finance.view", scope: "all" }]),
      "expense_paid_without_ledger:expense-settlement-without-ledger",
    );

    expect(result.exception).toEqual(expect.objectContaining({
      exception_code: "expense_paid_without_ledger",
      subject_type: "expense_settlement",
      subject_id: "expense-settlement-without-ledger",
      project_id: "project-expense-1",
    }));
    expect(result.context).toEqual(expect.objectContaining({
      settlement: expect.objectContaining({
        id: "expense-settlement-without-ledger",
        paid_amount: 1200,
      }),
      expense_request: expect.objectContaining({
        id: "expense-request-1",
        title: "材料采购",
      }),
      ledgers: [],
    }));
    expect(result.available_actions).toContainEqual(expect.objectContaining({
      key: "generate_expense_ledger",
      label: "补生成支出台账",
    }));
    expect(getExpenseSettlementContext).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      settlementId: "expense-settlement-without-ledger",
    });
  });

  test("generates an expense ledger and records action", async () => {
    const service = await createService();

    const result = await service.createExceptionAction(
      authContextWithPermissions([
        { code: "finance.view", scope: "all" },
        { code: "finance.reconciliation.manage", scope: "all" },
      ]),
      "expense_paid_without_ledger:expense-settlement-without-ledger",
      {
        action: "generate_expense_ledger",
        remark: "补入账",
      },
    );

    expect(createExpenseSettlementLedger).toHaveBeenCalledWith(
      expect.objectContaining({
        tenant_id: "tenant-1",
        project_id: "project-expense-1",
        cost_category_id: "cost-category-1",
        direction: "out",
        entry_type: "expense_settlement",
        amount: 1200,
        occurred_at: "2026-06-25T10:00:00.000Z",
        source_type: "expense_settlement",
        source_id: "expense-settlement-without-ledger",
        expense_request_id: "expense-request-1",
        expense_settlement_id: "expense-settlement-without-ledger",
        handled_by: "employee-pay",
        summary: "费用付款：材料供应商",
        metadata: expect.objectContaining({
          operation: "generate_expense_ledger",
          repaired_by: "employee-1",
          repair_reason: "补入账",
        }),
      }),
    );
    expect(result).toEqual(expect.objectContaining({
      action: "generate_expense_ledger",
      remark: "补入账",
    }));
  });

  test("updates expense ledger category and records action", async () => {
    const service = await createService();

    const result = await service.createExceptionAction(
      authContextWithPermissions([
        { code: "finance.view", scope: "all" },
        { code: "finance.reconciliation.manage", scope: "all" },
        { code: "finance.cost-allocation.manage", scope: "all" },
      ]),
      "expense_ledger_without_category:expense-ledger-without-category",
      {
        action: "update_expense_ledger_category",
        remark: "归集到辅材",
        cost_category_id: "cost-category-2",
      },
    );

    expect(updateExpenseLedgerCostCategory).toHaveBeenCalledWith(
      expect.any(Object),
      "expense-ledger-without-category",
      { cost_category_id: "cost-category-2" },
    );
    expect(result.action).toBe("update_expense_ledger_category");
    expect(createAction).toHaveBeenCalledWith(expect.objectContaining({
      exceptionCode: "expense_ledger_without_category",
      action: "update_expense_ledger_category",
      remark: "归集到辅材",
    }));
  });

  test("records amount mismatch review without changing ledger", async () => {
    const service = await createService();

    const result = await service.createExceptionAction(
      authContextWithPermissions([
        { code: "finance.view", scope: "all" },
        { code: "finance.reconciliation.manage", scope: "all" },
      ]),
      "expense_paid_amount_mismatch:expense-settlement-mismatch",
      {
        action: "record_expense_amount_mismatch_review",
        remark: "已核对，待线下调整原始单据",
      },
    );

    expect(createExpenseSettlementLedger).not.toHaveBeenCalled();
    expect(updateExpenseLedgerCostCategory).not.toHaveBeenCalled();
    expect(result.action).toBe("record_expense_amount_mismatch_review");
    expect(createAction).toHaveBeenCalledWith(expect.objectContaining({
      exceptionCode: "expense_paid_amount_mismatch",
      action: "record_expense_amount_mismatch_review",
    }));
  });

  test("rejects expense correction action when it does not match exception code", async () => {
    const service = await createService();

    await expect(
      service.createExceptionAction(
        authContextWithPermissions([
          { code: "finance.view", scope: "all" },
          { code: "finance.reconciliation.manage", scope: "all" },
        ]),
        "expense_ledger_without_category:expense-ledger-without-category",
        {
          action: "generate_expense_ledger",
          remark: "错误动作",
        },
      ),
    ).rejects.toMatchObject({
      statusCode: 400,
      code: "VALIDATION_ERROR",
    });
    expect(createExpenseSettlementLedger).not.toHaveBeenCalled();
    expect(updateExpenseLedgerCostCategory).not.toHaveBeenCalled();
    expect(createAction).not.toHaveBeenCalled();
  });

});
