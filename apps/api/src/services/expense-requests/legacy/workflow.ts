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
  type ExpenseRequestTodoQueryType,
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

export async function approveExpenseRequest(this: any, 
    authContext: AuthContext,
    id: string,
    input: ApproveExpenseRequestInput,
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

    if (!["manager_review", "finance_review"].includes(existing.current_step)) {
      throw Errors.business(
        400,
        "当前审批节点不允许通过",
        "EXPENSE_REQUEST_INVALID_TRANSITION",
      );
    }

    if (await this.hasApprovalAction({
      tenantId,
      expenseRequestId: id,
      approvalRound,
      step: existing.current_step,
      action: "approve",
      approverId,
    })) {
      return this.getLatestExpenseRequest(id, tenantId);
    }

    const previousApproveStep = existing.current_step === "finance_review"
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

    const currentNode = this.getCurrentApprovalNode(existing);
    if (currentNode) {
      if (currentNode.status !== "current") {
        throw Errors.business(
          409,
          "当前审批节点已处理，请刷新后查看",
          "EXPENSE_REQUEST_ALREADY_PROCESSED",
        );
      }

      if (currentNode.assignee_id !== approverId) {
        throw Errors.business(
          403,
          "当前用户无该节点操作权限",
          "EXPENSE_REQUEST_PERMISSION_DENIED",
        );
      }

      if (currentNode.step !== existing.current_step) {
        throw Errors.business(
          409,
          "当前审批状态已变化，请刷新后查看",
          "EXPENSE_REQUEST_STATE_CHANGED",
        );
      }
    }

    if (existing.current_step === "manager_review") {
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
    const nextStatus = existing.current_step === "finance_review"
      ? "approved"
      : "pending";
    const nextStep = existing.current_step === "finance_review"
      ? "payment"
      : "finance_review";
    const chain = this.getApprovalChain(existing);
    const nextNode = chain.find((item: ExpenseApprovalChainRecord) => item.step === nextStep);

    const updated = await expenseRequestRepository.update(id, {
      status: nextStatus,
      current_step: nextStep,
      approved_at: existing.current_step === "finance_review" ? now : null,
      assignee_id: nextNode?.assignee_id ?? null,
    }, undefined, tenantId);

    if (currentNode) {
      await expenseRequestRepository.updateApprovalChainNode(currentNode.id, {
        status: "approved",
        acted_by: approverId,
        acted_at: now,
        comment: input.comment ?? null,
      }, tenantId);
    }

    if (nextNode && existing.current_step === "manager_review") {
      await expenseRequestRepository.updateApprovalChainNode(nextNode.id, {
        status: "current",
      }, tenantId);
    }

    await this.appendApprovalOnce({
      tenantId,
      expenseRequestId: id,
      approvalRound,
      step: existing.current_step,
      action: "approve",
      approverId,
      comment: input.comment ?? null,
    });

    return this.getLatestExpenseRequest(updated.id, tenantId);
  }

export async function rejectExpenseRequest(this: any, 
    authContext: AuthContext,
    id: string,
    input: RejectExpenseRequestInput,
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

    if (await this.hasApprovalAction({
      tenantId,
      expenseRequestId: id,
      approvalRound,
      step: existing.current_step,
      action: "reject",
      approverId,
    })) {
      return this.getLatestExpenseRequest(id, tenantId);
    }

    const currentNode = this.getCurrentApprovalNode(existing);
    if (currentNode) {
      if (currentNode.status !== "current") {
        throw Errors.business(
          409,
          "当前审批节点已处理，请刷新后查看",
          "EXPENSE_REQUEST_ALREADY_PROCESSED",
        );
      }

      if (currentNode.assignee_id !== approverId) {
        throw Errors.business(
          403,
          "当前用户无该节点操作权限",
          "EXPENSE_REQUEST_PERMISSION_DENIED",
        );
      }

      if (currentNode.step !== existing.current_step) {
        throw Errors.business(
          409,
          "当前审批状态已变化，请刷新后查看",
          "EXPENSE_REQUEST_STATE_CHANGED",
        );
      }
    }

    if (existing.current_step === "manager_review") {
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
    } else if (existing.current_step === "finance_review") {
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
    } else {
      throw Errors.business(
        400,
        "当前审批节点不允许驳回",
        "EXPENSE_REQUEST_INVALID_TRANSITION",
      );
    }

    await this.assertEmployeeExists(approverId, tenantId, "审批人不存在");

    const now = new Date().toISOString();
    const updated = await expenseRequestRepository.update(id, {
      status: "rejected",
      current_step: "draft",
      rejected_at: now,
      rejected_reason: rejectedReason,
      assignee_id: existing.employee_id,
    }, undefined, tenantId);

    if (currentNode) {
      await expenseRequestRepository.updateApprovalChainNode(currentNode.id, {
        status: "rejected",
        acted_by: approverId,
        acted_at: now,
        comment: input.comment ?? rejectedReason,
      }, tenantId);

      for (const node of this.getApprovalChain(existing)) {
        if (node.id !== currentNode.id && node.status === "pending") {
          await expenseRequestRepository.updateApprovalChainNode(node.id, {
            status: "cancelled",
          }, tenantId);
        }
      }
    }

    await this.appendApprovalOnce({
      tenantId,
      expenseRequestId: id,
      approvalRound,
      step: existing.current_step,
      action: "reject",
      approverId,
      comment: input.comment ?? rejectedReason,
    });

    return this.getLatestExpenseRequest(updated.id, tenantId);
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
    const updated = await expenseRequestRepository.update(id, {
      status: "cancelled",
      current_step: "cancelled",
      cancelled_at: now,
      assignee_id: null,
    }, undefined, tenantId);

    for (const node of this.getApprovalChain(existing)) {
      if (!["approved", "rejected", "cancelled"].includes(node.status)) {
        await expenseRequestRepository.updateApprovalChainNode(node.id, {
          status: "cancelled",
          acted_by: input.operator_id,
          acted_at: now,
          comment: input.comment ?? null,
        }, tenantId);
      }
    }

    await this.appendApprovalOnce({
      tenantId,
      expenseRequestId: id,
      approvalRound,
      step: existing.current_step,
      action: "cancel",
      approverId: input.operator_id,
      comment: input.comment ?? null,
    });

    return this.getLatestExpenseRequest(updated.id, tenantId);
  }
