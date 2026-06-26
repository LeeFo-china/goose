import { attachExpenseWorkflowStates } from "@/services/expense-request-workflow-state";
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

export async function getExpenseRequestById(this: any, authContext: AuthContext, id: string) {
    const tenantId = this.requireTenantId(authContext);
    const data = await expenseRequestRepository.findById(id, tenantId);
    if (!data) {
      throw Errors.badRequest("费用申请不存在");
    }

    await this.assertCanReadExpenseRequest(authContext, data);

    const [serialized] = await attachExpenseWorkflowStates([
      this.serializeExpenseRequest(data),
    ], tenantId);
    return serialized ?? this.serializeExpenseRequest(data);
  }

export async function listExpenseRequests(this: any, 
    authContext: AuthContext,
    params: ExpenseRequestListQueryType,
  ) {
    const tenantId = this.requireTenantId(authContext);
    const visibility = await accessPolicyService.getVisibleExpenseFilters(
      authContext,
      "expense_request.read",
    );
    const result = await expenseRequestRepository.list(
      params,
      visibility,
      tenantId,
    );
    const list = result.list.map((item) => this.serializeExpenseRequest(item));

    return {
      ...result,
      list: await attachExpenseWorkflowStates(list, tenantId),
    };
  }

export async function getStatsSummary(this: any, 
    authContext: AuthContext,
    params: ExpenseRequestListQueryType,
  ) {
    const tenantId = this.requireTenantId(authContext);
    const visibility = await accessPolicyService.getVisibleExpenseFilters(
      authContext,
      "expense_request.read",
    );
    const rows = await expenseRequestRepository.listStatsRows(params, tenantId);
    const visibleRows = rows.filter((item) => this.canAccessByVisibility(
      visibility,
      item,
    ));
    const initialStatuses = [
      "draft",
      "pending",
      "approved",
      "rejected",
      "paid",
      "cancelled",
    ];
    const statusCounts = Object.fromEntries(
      initialStatuses.map((status) => [status, 0]),
    ) as Record<string, number>;
    const statusAmounts = Object.fromEntries(
      initialStatuses.map((status) => [status, 0]),
    ) as Record<string, number>;
    const modeCounts: Record<string, number> = {};
    let totalAmount = 0;

    for (const item of visibleRows) {
      const amount = Number(item.total_amount || 0);
      const normalizedAmount = Number.isFinite(amount) ? amount : 0;
      totalAmount += normalizedAmount;
      statusCounts[item.status] = (statusCounts[item.status] || 0) + 1;
      statusAmounts[item.status] = Number(
        ((statusAmounts[item.status] || 0) + normalizedAmount).toFixed(2),
      );
      modeCounts[item.mode] = (modeCounts[item.mode] || 0) + 1;
    }

    return {
      total_count: visibleRows.length,
      total_amount: Number(totalAmount.toFixed(2)),
      status_counts: statusCounts,
      status_amounts: statusAmounts,
      mode_counts: modeCounts,
      pending_count: statusCounts.pending || 0,
      approved_count: statusCounts.approved || 0,
      paid_count: statusCounts.paid || 0,
      rejected_count: statusCounts.rejected || 0,
      draft_count: statusCounts.draft || 0,
      cancelled_count: statusCounts.cancelled || 0,
    };
  }
