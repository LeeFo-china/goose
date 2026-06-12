import { expenseWorkflowRuntimeService } from "@/services/expense-workflow-runtime";
import {
  resolveExpenseApprovalNodeKey,
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

export async function approveExpenseRequest(this: any, 
    authContext: AuthContext,
    id: string,
    input: ApproveExpenseRequestInput,
    options?: ExpenseWorkflowOperationOptions,
  ) {
    const tenantId = this.requireTenantId(authContext);
    const existing = await expenseRequestRepository.findById(id, tenantId);
    if (!existing) {
      throw Errors.badRequest("费用申请不存在");
    }

    const approverId = input.approver_id ?? authContext.employeeId;
    if (!approverId) {
      throw Errors.badRequest("缺少审批人");
    }
    const approvalRound = this.getApprovalRound(existing);

    if (existing.status !== "pending") {
      const repeatedApprove = await Promise.all([
        this.hasApprovalAction({
          tenantId,
          expenseRequestId: id,
          approvalRound,
          step: "manager_review",
          action: "approve",
          approverId,
        }),
        this.hasApprovalAction({
          tenantId,
          expenseRequestId: id,
          approvalRound,
          step: "finance_review",
          action: "approve",
          approverId,
        }),
      ]);
      if (repeatedApprove.some(Boolean)) {
        return this.getLatestExpenseRequest(id, tenantId);
      }

      throw Errors.business(
        409,
        "当前审批状态已变化，请刷新后查看",
        "EXPENSE_REQUEST_STATE_CHANGED",
      );
    }

    const nodeKey = await resolveExpenseApprovalNodeKey({
      tenantId,
      expenseRequestId: id,
      options,
      invalidMessage: "当前审批节点不允许通过",
    });

    if (await this.hasApprovalAction({
      tenantId,
      expenseRequestId: id,
      approvalRound,
      step: nodeKey,
      action: "approve",
      approverId,
    })) {
      return this.getLatestExpenseRequest(id, tenantId);
    }

    const previousApproveStep = nodeKey === "finance_review"
      ? "manager_review"
      : null;
    if (
      previousApproveStep &&
      this.hasRecentApprovalAction(existing, {
        approvalRound,
        step: previousApproveStep,
        action: "approve",
        approverId,
        withinMs: 30_000,
      })
    ) {
      return this.getLatestExpenseRequest(id, tenantId);
    }

    if (nodeKey === "manager_review") {
      await this.assertCanOperateExpenseRequest(
        authContext,
        existing,
        "expense_request.approve_manager",
        "当前用户无经理审批权限",
      );
      this.ensureCurrentEmployee(
        authContext,
        approverId,
        "expense_request.approve_manager",
      );
    } else {
      await this.assertCanOperateExpenseRequest(
        authContext,
        existing,
        "expense_request.approve_finance",
        "当前用户无财务审批权限",
      );
      this.ensureCurrentEmployee(
        authContext,
        approverId,
        "expense_request.approve_finance",
      );
    }

    await this.assertEmployeeExists(approverId, tenantId, "审批人不存在");

    const now = new Date().toISOString();
    const nextStatus = nodeKey === "finance_review"
      ? "approved"
      : "pending";

    const updated = await expenseRequestRepository.update(id, {
      status: nextStatus,
      approved_at: nodeKey === "finance_review" ? now : null,
      assignee_id: null,
    }, undefined, tenantId);

    await this.appendApprovalOnce({
      tenantId,
      expenseRequestId: id,
      approvalRound,
      step: nodeKey,
      action: "approve",
      approverId,
      comment: input.comment ?? null,
    });

    const latest = await this.getLatestExpenseRequest(updated.id, tenantId);
    await expenseWorkflowRuntimeService.syncApproval({
      authContext,
      tenantId,
      expenseRequestId: id,
      expenseRequest: latest,
      nodeKey,
      action: "approve",
      actorEmployeeId: approverId,
      decision: "approved",
      comment: input.comment ?? null,
    });

    return latest;
  }

export async function rejectExpenseRequest(this: any, 
    authContext: AuthContext,
    id: string,
    input: RejectExpenseRequestInput,
    options?: ExpenseWorkflowOperationOptions,
  ) {
    const tenantId = this.requireTenantId(authContext);
    const existing = await expenseRequestRepository.findById(id, tenantId);
    if (!existing) {
      throw Errors.badRequest("费用申请不存在");
    }

    const approverId = input.approver_id ?? authContext.employeeId;
    if (!approverId) {
      throw Errors.badRequest("缺少审批人");
    }
    const approvalRound = this.getApprovalRound(existing);
    if (existing.status === "rejected" && (await Promise.all([
      this.hasApprovalAction({
        tenantId,
        expenseRequestId: id,
        approvalRound,
        step: "manager_review",
        action: "reject",
        approverId,
      }),
      this.hasApprovalAction({
        tenantId,
        expenseRequestId: id,
        approvalRound,
        step: "finance_review",
        action: "reject",
        approverId,
      }),
    ])).some(Boolean)) {
      return this.getLatestExpenseRequest(id, tenantId);
    }

    if (existing.status !== "pending") {
      throw Errors.business(
        409,
        "当前审批状态已变化，请刷新后查看",
        "EXPENSE_REQUEST_STATE_CHANGED",
      );
    }

    const rejectedReason = input.rejected_reason ?? input.reason;
    if (!rejectedReason) {
      throw Errors.badRequest("驳回原因不能为空");
    }
    const nodeKey = await resolveExpenseApprovalNodeKey({
      tenantId,
      expenseRequestId: id,
      options,
      invalidMessage: "当前审批节点不允许驳回",
    });

    if (await this.hasApprovalAction({
      tenantId,
      expenseRequestId: id,
      approvalRound,
      step: nodeKey,
      action: "reject",
      approverId,
    })) {
      return this.getLatestExpenseRequest(id, tenantId);
    }

    if (nodeKey === "manager_review") {
      await this.assertCanOperateExpenseRequest(
        authContext,
        existing,
        "expense_request.approve_manager",
        "当前用户无经理审批权限",
      );
      this.ensureCurrentEmployee(
        authContext,
        approverId,
        "expense_request.approve_manager",
      );
    } else {
      await this.assertCanOperateExpenseRequest(
        authContext,
        existing,
        "expense_request.approve_finance",
        "当前用户无财务审批权限",
      );
      this.ensureCurrentEmployee(
        authContext,
        approverId,
        "expense_request.approve_finance",
      );
    }

    await this.assertEmployeeExists(approverId, tenantId, "审批人不存在");

    const now = new Date().toISOString();
    const updated = await expenseRequestRepository.update(id, {
      status: "rejected",
      rejected_at: now,
      rejected_reason: rejectedReason,
      assignee_id: existing.employee_id,
    }, undefined, tenantId);

    await this.appendApprovalOnce({
      tenantId,
      expenseRequestId: id,
      approvalRound,
      step: nodeKey,
      action: "reject",
      approverId,
      comment: input.comment ?? rejectedReason,
    });

    const latest = await this.getLatestExpenseRequest(updated.id, tenantId);
    await expenseWorkflowRuntimeService.syncApproval({
      authContext,
      tenantId,
      expenseRequestId: id,
      expenseRequest: latest,
      nodeKey,
      action: "reject",
      actorEmployeeId: approverId,
      decision: "rejected",
      comment: input.comment ?? rejectedReason,
      reason: rejectedReason,
    });

    return latest;
  }

export async function cancelExpenseRequest(this: any, 
    authContext: AuthContext,
    id: string,
    input: CancelExpenseRequestInput,
  ) {
    const tenantId = this.requireTenantId(authContext);
    const existing = await expenseRequestRepository.findById(id, tenantId);
    if (!existing) {
      throw Errors.badRequest("费用申请不存在");
    }

    await this.assertCanReadExpenseRequest(authContext, existing);
    this.ensureCurrentEmployee(
      authContext,
      input.operator_id,
      "expense_request.submit",
    );

    if (existing.status === "cancelled") {
      return this.getLatestExpenseRequest(id, tenantId);
    }

    if (!["draft", "pending", "rejected"].includes(existing.status)) {
      throw Errors.business(
        400,
        "当前状态不允许撤回费用申请",
        "EXPENSE_REQUEST_INVALID_TRANSITION",
      );
    }

    await this.assertEmployeeExists(input.operator_id, tenantId, "操作员工不存在");

    const now = new Date().toISOString();
    const approvalRound = this.getApprovalRound(existing);
    const nodeKey = await resolveExpenseWorkflowNodeKey({
      tenantId,
      expenseRequestId: id,
    });
    const updated = await expenseRequestRepository.update(id, {
      status: "cancelled",
      cancelled_at: now,
      assignee_id: null,
    }, undefined, tenantId);

    await this.appendApprovalOnce({
      tenantId,
      expenseRequestId: id,
      approvalRound,
      step: nodeKey ?? "cancel",
      action: "cancel",
      approverId: input.operator_id,
      comment: input.comment ?? null,
    });

    const latest = await this.getLatestExpenseRequest(updated.id, tenantId);
    await expenseWorkflowRuntimeService.syncCancel({
      authContext,
      tenantId,
      expenseRequestId: id,
      expenseRequest: latest,
      actorEmployeeId: input.operator_id,
      comment: input.comment ?? null,
    });

    return latest;
  }
