import { expenseWorkflowRuntimeService } from "@/services/expense-workflow-runtime";
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
  resolveApprovalChainRelations,
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
  type ExpenseApprovalChainPayload,
  type ExpenseApprovalChainRecord,
  type ExpenseProjectCandidateRow,
  type ExpenseRequestRecord,
  type ExpenseRequestVisibilityFilter,
  type ExpenseRequestOperationPermission,
  type ExpenseRequestAccessScope,
  type ApprovalChainStep,
  type ResolvedExpenseRequestItemInput,
  type ExpenseApprovalRecordLike,
} from './shared';

export async function payExpenseRequest(this: any, 
    authContext: AuthContext,
    id: string,
    input: PayExpenseRequestInput,
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

    if (
      existing.status === "paid" ||
      await expenseRequestRepository.hasSettlement(id, tenantId)
    ) {
      return this.getLatestExpenseRequest(id, tenantId);
    }

    if (existing.status !== "approved" || existing.current_step !== "payment") {
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

    await expenseRequestRepository.createSettlement({
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
      current_step: "done",
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
