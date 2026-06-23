import { expenseWorkflowRuntimeService } from "@/services/expense-workflow-runtime";
import { financeLedgerService } from "@/services/finance-ledger";
import {
  resolveExpenseWorkflowNodeKey,
  type ExpenseWorkflowOperationOptions,
} from "./workflow-node";
import {
  Errors,
  expenseRequestRepository,
  accessPolicyService,
  expenseRequestCategoryService,
  resolveStoredFileUrl,
  resolveStoredFileUrlList,
  ProjectStatusConfig,
  isProjectStatus,
  approvalChainStepConfigs,
  approvalStepPermissionMap,
  scopeWeight,
  calculateTotalAmount,
  buildLegacyFields,
  generateExpenseRequestNo,
  normalizeRelationName,
  normalizeRelationValue,
  normalizeTenantDepartmentName,
  sameDepartmentScope,
  normalizeScope,
  resolveAvatarRelation,
  resolveEvidenceImagesRelation,
  dedupeApprovalRecords,
  type AuthContext,
  type ApproveExpenseRequestInput,
  type CancelExpenseRequestInput,
  type CreateExpenseRequestInput,
  type ExpenseApprovalCandidateQueryType,
  type ExpenseApprovalChainItemInput,
  type ExpenseApprovalTemplateQueryType,
  type ExpenseRequestListQueryType,
  type ExpenseRequestProjectCandidateQueryType,
  type ExpenseRequestItemInput,
  type PayExpenseRequestInput,
  type RejectExpenseRequestInput,
  type SubmitExpenseRequestInput,
  type UpdateExpenseRequestInput,
  type ExpenseApprovalCandidateEmployee,
  type ExpenseProjectCandidateRow,
  type ExpenseRequestRecord,
  type ExpenseRequestVisibilityFilter,
  type ExpenseRequestOperationPermission,
  type ExpenseRequestAccessScope,
  type ApprovalChainStep,
  type ResolvedExpenseRequestItemInput,
  type ExpenseApprovalRecordLike,
} from './shared';

type ExpenseSettlementLedgerSource = {
  id: string;
  payee_name: string;
  method: string;
  paid_amount: number;
  paid_at: string;
  paid_by: string;
};

async function writeExpenseSettlementLedger(input: {
  tenantId: string;
  expenseRequestId: string;
  projectId?: string | null;
  settlement: ExpenseSettlementLedgerSource;
}) {
  await financeLedgerService.createExpenseSettlementLedger({
    tenant_id: input.tenantId,
    project_id: input.projectId ?? null,
    direction: "out",
    entry_type: "expense_settlement",
    amount: input.settlement.paid_amount,
    occurred_at: input.settlement.paid_at,
    source_type: "expense_settlement",
    source_id: input.settlement.id,
    expense_request_id: input.expenseRequestId,
    expense_settlement_id: input.settlement.id,
    handled_by: input.settlement.paid_by,
    summary: `费用付款：${input.settlement.payee_name}`,
    metadata: {
      expense_request_id: input.expenseRequestId,
      settlement_method: input.settlement.method,
      payee_name: input.settlement.payee_name,
    },
  });
}

export async function payExpenseRequest(this: any, 
    authContext: AuthContext,
    id: string,
    input: PayExpenseRequestInput,
    options?: ExpenseWorkflowOperationOptions,
  ) {
    const tenantId = this.requireTenantId(authContext);
    const existing = await expenseRequestRepository.findById(id, tenantId);
    if (!existing) {
      throw Errors.badRequest("费用申请不存在");
    }

    await this.assertCanReadExpenseRequest(authContext, existing);
    await this.assertCanOperateExpenseRequest(
      authContext,
      existing,
      "expense_request.pay",
      "当前用户无登记打款权限",
    );
    this.ensureCurrentEmployee(authContext, input.paid_by, "expense_request.pay");

    const alreadySettled =
      existing.status === "paid" ||
      await expenseRequestRepository.hasSettlement(id, tenantId);
    if (alreadySettled) {
      const settlement =
        await expenseRequestRepository.findSettlementByExpenseRequest(id, tenantId);
      if (settlement) {
        await writeExpenseSettlementLedger({
          tenantId,
          expenseRequestId: id,
          projectId: existing.project_id,
          settlement,
        });
      }
      return this.getLatestExpenseRequest(id, tenantId);
    }

    const nodeKey = await resolveExpenseWorkflowNodeKey({
      tenantId,
      expenseRequestId: id,
      options,
    });
    if (existing.status !== "approved" || nodeKey !== "payment") {
      throw Errors.business(
        400,
        "只有待打款的费用申请才能登记支付",
        "EXPENSE_REQUEST_INVALID_TRANSITION",
      );
    }

    await this.assertEmployeeExists(input.paid_by, tenantId, "打款登记员工不存在");

    if (Number(input.paid_amount.toFixed(2)) !== Number(existing.total_amount)) {
      throw Errors.badRequest("打款金额必须等于费用申请总金额");
    }

    const paidAt = input.paid_at || new Date().toISOString();
    const approvalRound = this.getApprovalRound(existing);

    const settlement = await expenseRequestRepository.createSettlement({
      tenant_id: tenantId ?? null,
      expense_request_id: id,
      payee_name: input.payee_name,
      payee_bank: input.payee_bank ?? null,
      payee_account: input.payee_account ?? null,
      method: input.method,
      paid_amount: input.paid_amount,
      paid_at: paidAt,
      paid_by: input.paid_by,
      evidence_images: input.evidence_images,
      remark: input.remark ?? null,
    });
    await writeExpenseSettlementLedger({
      tenantId,
      expenseRequestId: id,
      projectId: existing.project_id,
      settlement,
    });

    await this.appendApprovalOnce({
      tenantId,
      expenseRequestId: id,
      approvalRound,
      step: "payment",
      action: "pay",
      approverId: input.paid_by,
      comment: input.remark ?? null,
    });

    await expenseRequestRepository.update(id, {
      status: "paid",
      completed_at: paidAt,
      assignee_id: null,
    }, undefined, tenantId);

    const latest = await this.getLatestExpenseRequest(id, tenantId);
    await expenseWorkflowRuntimeService.syncPay({
      authContext,
      tenantId,
      expenseRequestId: id,
      expenseRequest: latest,
      actorEmployeeId: input.paid_by,
      remark: input.remark ?? null,
    });

    return latest;
  }
