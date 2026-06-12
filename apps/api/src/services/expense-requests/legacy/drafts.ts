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

export async function createExpenseRequest(this: any, authContext: AuthContext, input: CreateExpenseRequestInput) {
    const tenantId = this.requireTenantId(authContext);
    this.ensureCurrentEmployee(authContext, input.employee_id, "expense_request.create");
    await this.assertEmployeeExists(input.employee_id, tenantId);
    await this.assertCanLinkProject(authContext, input.project_id);

    const items = await this.resolveItems(input.items || [], tenantId);
    const totalAmount = calculateTotalAmount(items);
    const title = input.title?.trim() || null;

    const created = await expenseRequestRepository.create(
      {
        tenant_id: tenantId ?? null,
        employee_id: input.employee_id,
        project_id: input.project_id ?? null,
        mode: input.mode,
        title,
        request_no: generateExpenseRequestNo(),
        total_amount: totalAmount,
        status: "draft",
        current_step: "draft",
        assignee_id: null,
        rejected_reason: null,
        ...buildLegacyFields(title, items, totalAmount),
      },
      items,
    );

    return this.serializeExpenseRequest(created);
  }

export async function updateExpenseRequest(this: any, 
    authContext: AuthContext,
    id: string,
    input: UpdateExpenseRequestInput,
  ) {
    const tenantId = this.requireTenantId(authContext);
    const existing = await expenseRequestRepository.findById(id, tenantId);
    if (!existing) {
      throw Errors.badRequest("费用申请不存在");
    }

    await this.assertCanReadExpenseRequest(authContext, existing);
    this.ensureCurrentEmployee(
      authContext,
      existing.employee_id,
      "expense_request.create",
    );

    if (!["draft", "rejected"].includes(existing.status)) {
      if (input.project_id !== undefined) {
        throw Errors.business(
          400,
          "当前费用申请状态不允许修改关联项目",
          "EXPENSE_REQUEST_PROJECT_NOT_EDITABLE",
        );
      }

      throw Errors.badRequest("当前状态不允许修改费用申请");
    }

    if (input.project_id !== undefined) {
      await this.assertCanLinkProject(authContext, input.project_id);
    }

    const items = input.items
      ? await this.resolveItems(input.items, tenantId)
      : (((existing.items as ResolvedExpenseRequestItemInput[] | undefined) || []));
    const totalAmount = calculateTotalAmount(items);
    const title = input.title?.trim() ?? existing.title ?? null;

    const updated = await expenseRequestRepository.update(
      id,
      {
        project_id: input.project_id !== undefined
          ? input.project_id
          : existing.project_id,
        mode: input.mode ?? existing.mode,
        title,
        total_amount: totalAmount,
        rejected_reason: existing.status === "rejected"
          ? existing.rejected_reason
          : null,
        ...buildLegacyFields(title, items, totalAmount),
      },
      input.items ? items : undefined,
      tenantId,
    );

    return this.serializeExpenseRequest(updated);
  }

export async function submitExpenseRequest(this: any, 
    authContext: AuthContext,
    id: string,
    input: SubmitExpenseRequestInput,
  ) {
    const tenantId = this.requireTenantId(authContext);
    const existing = await expenseRequestRepository.findById(id, tenantId);
    if (!existing) {
      throw Errors.badRequest("费用申请不存在");
    }

    await this.assertCanReadExpenseRequest(authContext, existing);
    const operatorId = input.operator_id ?? authContext.employeeId;
    if (!operatorId) {
      throw Errors.badRequest("缺少提交人");
    }
    this.ensureCurrentEmployee(
      authContext,
      operatorId,
      "expense_request.submit",
    );

    if (existing.status === "pending") {
      return this.getLatestExpenseRequest(id, tenantId);
    }

    if (!["draft", "rejected"].includes(existing.status)) {
      throw Errors.business(
        400,
        "当前状态不允许提交费用申请",
        "EXPENSE_REQUEST_INVALID_TRANSITION",
      );
    }

    await this.assertEmployeeExists(operatorId, tenantId, "提交人不存在");

    const items = (existing.items as ResolvedExpenseRequestItemInput[] | undefined) || [];
    if (items.length === 0) {
      throw Errors.badRequest("提交费用申请前至少需要一条费用明细");
    }

    const totalAmount = calculateTotalAmount(items);
    if (totalAmount <= 0) {
      throw Errors.badRequest("费用申请总金额必须大于 0");
    }

    const now = new Date().toISOString();
    const action = existing.status === "rejected" ? "resubmit" : "submit";
    const approvalRound = existing.status === "rejected"
      ? this.getApprovalRound(existing) + 1
      : this.getApprovalRound(existing);
    const requestedApprovalChain = this.getApprovalChain(existing).length > 0
      ? this.getApprovalChain(existing).map((item: ExpenseApprovalChainRecord) => ({
        step: item.step as ApprovalChainStep,
        assignee_id: item.assignee_id,
      }))
      : undefined;

    if (!requestedApprovalChain || requestedApprovalChain.length === 0) {
      throw Errors.badRequest("请先选择审批流程");
    }
    const approvalChainPayload = await this.buildApprovalChainPayload(
      id,
      existing.employee_id,
      requestedApprovalChain,
      "current",
      tenantId,
    );

    const updated = await expenseRequestRepository.update(id, {
      total_amount: totalAmount,
      status: "pending",
      current_step: "manager_review",
      submitted_at: now,
      rejected_reason: null,
      assignee_id: approvalChainPayload[0]?.assignee_id ?? null,
      ...buildLegacyFields(existing.title, items, totalAmount),
    }, undefined, tenantId);

    await expenseRequestRepository.replaceApprovalChain(
      id,
      approvalChainPayload,
      tenantId,
    );

    await this.appendApprovalOnce({
      tenantId,
      expenseRequestId: id,
      approvalRound,
      step: "draft",
      action,
      approverId: operatorId,
      comment: input.comment ?? null,
    });

    const latest = await this.getLatestExpenseRequest(updated.id, tenantId);
    await expenseWorkflowRuntimeService.syncSubmit({
      authContext,
      tenantId,
      expenseRequestId: id,
      expenseRequest: latest,
      action,
      operatorId,
      comment: input.comment ?? null,
    });

    return latest;
  }
