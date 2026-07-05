import { Errors } from "@/errors/error-factory";
import type { FinanceLedgerEntryInput } from "@/repositories/finance-ledger";
import {
  financeReconciliationCorrectionsRepository,
  type ExpenseLedgerContext,
  type ExpenseSettlementContext,
} from "@/repositories/finance-reconciliation-corrections";
import type {
  CreateFinanceReconciliationExceptionAction,
  FinanceReconciliationAction,
  FinanceReconciliationExceptionCode,
} from "@/schema/finance-reconciliation";
import type { AuthContext } from "@/services/authorization";
import { financeLedgerService } from "@/services/finance-ledger";
import type {
  FinanceReconciliationException,
} from "@/services/finance-reconciliation-exceptions";

export type FinanceReconciliationCorrectionDependencies = {
  expenseCorrectionRepository: Pick<
    typeof financeReconciliationCorrectionsRepository,
    "getExpenseSettlementContext" | "getExpenseLedgerContext"
  >;
  ledgerService: {
    createExpenseSettlementLedger: (
      input: FinanceLedgerEntryInput,
    ) => Promise<unknown>;
    updateCostCategory: (
      authContext: AuthContext,
      ledgerId: string,
      input: { cost_category_id: string | null },
    ) => Promise<unknown>;
  };
};

export const defaultFinanceReconciliationCorrectionDependencies:
  FinanceReconciliationCorrectionDependencies = {
    expenseCorrectionRepository: financeReconciliationCorrectionsRepository,
    ledgerService: financeLedgerService,
  };

export async function resolveFinanceReconciliationExceptionContext(
  tenantId: string,
  exception: FinanceReconciliationException,
  dependencies: FinanceReconciliationCorrectionDependencies,
): Promise<ExpenseSettlementContext | ExpenseLedgerContext | null> {
  if (exception.subject_type === "expense_settlement" && exception.subject_id) {
    return dependencies.expenseCorrectionRepository.getExpenseSettlementContext({
      tenantId,
      settlementId: exception.subject_id,
    });
  }
  if (
    exception.exception_code === "expense_ledger_without_category" &&
    exception.subject_type === "ledger" &&
    exception.subject_id
  ) {
    return dependencies.expenseCorrectionRepository.getExpenseLedgerContext({
      tenantId,
      ledgerId: exception.subject_id,
    });
  }
  return null;
}

export async function performFinanceReconciliationCorrectionAction(
  authContext: AuthContext,
  tenantId: string,
  target: FinanceReconciliationException,
  input: CreateFinanceReconciliationExceptionAction,
  dependencies: FinanceReconciliationCorrectionDependencies,
) {
  if (input.action === "generate_expense_ledger") {
    await generateExpenseLedger(authContext, tenantId, target, input, dependencies);
    return;
  }
  if (input.action === "update_expense_ledger_category") {
    await updateExpenseLedgerCategory(authContext, target, input, dependencies);
    return;
  }
  if (input.action === "record_expense_amount_mismatch_review") {
    assertExceptionCode(
      target,
      "expense_paid_amount_mismatch",
      "只能对费用打款与支出台账金额不一致异常记录复核结论",
    );
  }
}

export function availableActionsForReconciliationException(
  exception: FinanceReconciliationException,
) {
  const actions: Array<{ key: FinanceReconciliationAction; label: string }> = [];
  if (exception.exception_code === "expense_paid_without_ledger") {
    actions.push({ key: "generate_expense_ledger", label: "补生成支出台账" });
  }
  if (exception.exception_code === "expense_ledger_without_category") {
    actions.push({ key: "update_expense_ledger_category", label: "补成本分类" });
  }
  if (exception.exception_code === "expense_paid_amount_mismatch") {
    actions.push({
      key: "record_expense_amount_mismatch_review",
      label: "记录金额复核",
    });
  }
  if (exception.status === "open") {
    actions.push(
      { key: "acknowledge", label: "标记已确认" },
      { key: "resolve", label: "标记人工闭环" },
      { key: "ignore", label: "标记忽略" },
    );
  } else {
    actions.push({ key: "reopen", label: "重新打开" });
  }
  return actions;
}

async function generateExpenseLedger(
  authContext: AuthContext,
  tenantId: string,
  target: FinanceReconciliationException,
  input: CreateFinanceReconciliationExceptionAction,
  dependencies: FinanceReconciliationCorrectionDependencies,
) {
  assertExceptionCode(
    target,
    "expense_paid_without_ledger",
    "只能对费用已打款未入账异常补生成支出台账",
  );
  if (target.subject_type !== "expense_settlement" || !target.subject_id) {
    throw Errors.badRequest("费用打款异常缺少打款记录");
  }

  const context = await dependencies.expenseCorrectionRepository
    .getExpenseSettlementContext({
      tenantId,
      settlementId: target.subject_id,
    });
  if (!context) {
    throw Errors.notFound("费用打款记录不存在或已删除");
  }

  await dependencies.ledgerService.createExpenseSettlementLedger({
    tenant_id: tenantId,
    project_id: context.expense_request.project_id ?? target.project_id,
    cost_category_id: context.expense_request.cost_category_id,
    direction: "out",
    entry_type: "expense_settlement",
    amount: context.settlement.paid_amount,
    occurred_at: context.settlement.paid_at,
    source_type: "expense_settlement",
    source_id: context.settlement.id,
    expense_request_id: context.expense_request.id,
    expense_settlement_id: context.settlement.id,
    handled_by: context.settlement.paid_by,
    summary: `费用付款：${context.settlement.payee_name}`,
    metadata: {
      expense_request_id: context.expense_request.id,
      settlement_method: context.settlement.method,
      payee_name: context.settlement.payee_name,
      operation: "generate_expense_ledger",
      reconciliation_exception_fingerprint: target.exception_fingerprint,
      repaired_by: authContext.employeeId ?? null,
      repair_reason: input.remark,
    },
  });
}

async function updateExpenseLedgerCategory(
  authContext: AuthContext,
  target: FinanceReconciliationException,
  input: CreateFinanceReconciliationExceptionAction,
  dependencies: FinanceReconciliationCorrectionDependencies,
) {
  assertExceptionCode(
    target,
    "expense_ledger_without_category",
    "只能对支出台账缺少成本分类异常补成本分类",
  );
  if (target.subject_type !== "ledger" || !target.subject_id) {
    throw Errors.badRequest("费用支出台账异常缺少台账记录");
  }
  if (!input.cost_category_id) {
    throw Errors.badRequest("请选择成本分类");
  }

  await dependencies.ledgerService.updateCostCategory(
    authContext,
    target.subject_id,
    { cost_category_id: input.cost_category_id },
  );
}

function assertExceptionCode(
  target: FinanceReconciliationException,
  expected: FinanceReconciliationExceptionCode,
  message: string,
) {
  if (target.exception_code !== expected) {
    throw Errors.badRequest(message);
  }
}
