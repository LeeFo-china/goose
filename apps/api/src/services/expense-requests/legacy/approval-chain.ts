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

export function getStepConfig(this: any, step: string) {
    return approvalChainStepConfigs.find((item) => item.step === step) ?? null;
  }

export async function getApplicantEmployee(this: any, id: string, tenantId?: string | null) {
    const employee = await expenseRequestRepository.findEmployeeForApproval(
      id,
      tenantId,
    );
    if (!employee || employee.status !== "active") {
      throw Errors.badRequest("申请人不存在或不可用");
    }

    return employee;
  }

export async function assertCandidateForStep(this: any, input: {
    candidateId: string;
    applicantId: string;
    step: ApprovalChainStep;
    tenantId?: string | null;
  }) {
    const [candidate, applicant] = await Promise.all([
      expenseRequestRepository.findEmployeeForApproval(
        input.candidateId,
        input.tenantId,
      ),
      this.getApplicantEmployee(input.applicantId, input.tenantId),
    ]);

    if (!candidate || candidate.status !== "active") {
      throw Errors.badRequest("审批人不存在或已停用");
    }

    if (candidate.id === applicant.id) {
      throw Errors.badRequest("申请人不能审批自己的费用申请");
    }

    const config = this.getStepConfig(input.step);
    if (!config) {
      throw Errors.badRequest("审批流程节点顺序不正确");
    }

    const permissionRows = await expenseRequestRepository.listEmployeePermissionContexts(
      [candidate.id],
      config.required_permission,
    );
    const scope = this.buildCandidateScopeMap(permissionRows).get(candidate.id) ?? null;
    if (!scope) {
      throw Errors.badRequest("该员工不具备当前节点审批权限");
    }

    if (
      !this.scopeCoversApplicant({
        scope,
        candidate,
        applicant,
      })
    ) {
      throw Errors.badRequest("该员工无权审批当前费用申请");
    }

    return {
      candidate,
      config,
      scope,
    };
  }

export function normalizeApprovalChainInput(this: any, 
    input: ExpenseApprovalChainItemInput[] | undefined,
  ) {
    if (!input || input.length === 0) {
      return [] as ExpenseApprovalChainItemInput[];
    }

    const seen = new Set<string>();
    for (const item of input) {
      if (seen.has(item.step)) {
        throw Errors.badRequest("审批流程节点不能重复");
      }
      seen.add(item.step);
    }

    return approvalChainStepConfigs.map((config) => {
      const matched = input.find((item) => item.step === config.step);
      if (!matched) {
        throw Errors.badRequest(
          config.step === "manager_review" ? "请选择经理审批人" : "请选择财务审批人",
        );
      }

      return matched;
    });
  }

export async function buildApprovalChainPayload(this: any, 
    expenseRequestId: string,
    applicantId: string,
    input: ExpenseApprovalChainItemInput[],
    firstStatus: "pending" | "current",
    tenantId?: string | null,
  ): Promise<ExpenseApprovalChainPayload[]> {
    const normalized = this.normalizeApprovalChainInput(input);
    const payload: ExpenseApprovalChainPayload[] = [];

    for (const item of normalized) {
      const { candidate, config } = await this.assertCandidateForStep({
        candidateId: item.assignee_id,
        applicantId,
        step: item.step,
        tenantId,
      });

      payload.push({
        tenant_id: tenantId ?? null,
        expense_request_id: expenseRequestId,
        step: config.step,
        step_name: config.step_name,
        sort_order: config.sort_order,
        assignee_id: candidate.id,
        assignee_name_snapshot: candidate.name ?? null,
        required_permission: config.required_permission,
        status: config.sort_order === 1 ? firstStatus : "pending",
      });
    }

    return payload;
  }

export function getApprovalChain(this: any, record: { approval_chain?: unknown }) {
    const rows = Array.isArray(record.approval_chain)
      ? record.approval_chain
      : [];

    return [...(rows as ExpenseApprovalChainRecord[])].sort(
      (a, b) => a.sort_order - b.sort_order,
    );
  }

export function getCurrentApprovalNode(this: any, record: {
    approval_chain?: unknown;
    current_step: string;
  }) {
    const chain = this.getApprovalChain(record);
    return chain.find((item: ExpenseApprovalChainRecord) => item.status === "current") ??
      chain.find((item: ExpenseApprovalChainRecord) => item.step === record.current_step && item.status !== "approved") ??
      null;
  }

export function getApprovalRound(this: any, record: { approvals?: unknown }) {
    const rows = Array.isArray(record.approvals)
      ? record.approvals as ExpenseApprovalRecordLike[]
      : [];
    return rows.reduce((max, item) => {
      const round = Number(item.approval_round ?? 1);
      return Number.isFinite(round) && round > max ? round : max;
    }, 1);
  }

export function hasRecentApprovalAction(this: any, 
    record: { approvals?: unknown },
    input: {
      approvalRound: number;
      step: string;
      action: string;
      approverId: string;
      withinMs: number;
    },
  ) {
    const rows = Array.isArray(record.approvals)
      ? record.approvals as ExpenseApprovalRecordLike[]
      : [];
    const now = Date.now();

    return rows.some((item) => {
      if (
        Number(item.approval_round ?? 1) !== input.approvalRound ||
        item.step !== input.step ||
        item.action !== input.action ||
        item.approver_id !== input.approverId ||
        !item.created_at
      ) {
        return false;
      }

      const createdAt = new Date(item.created_at).getTime();
      return Number.isFinite(createdAt) && now - createdAt <= input.withinMs;
    });
  }

export async function hasApprovalAction(this: any, input: {
    tenantId?: string | null;
    expenseRequestId: string;
    approvalRound: number;
    step: string;
    action: string;
    approverId: string;
  }) {
    return expenseRequestRepository.findApprovalByBusinessKey({
      tenant_id: input.tenantId ?? null,
      expense_request_id: input.expenseRequestId,
      approval_round: input.approvalRound,
      step: input.step,
      action: input.action,
      approver_id: input.approverId,
    });
  }

export async function appendApprovalOnce(this: any, input: {
    tenantId?: string | null;
    expenseRequestId: string;
    approvalRound: number;
    step: string;
    action: string;
    approverId: string;
    comment?: string | null;
  }) {
    const exists = await this.hasApprovalAction(input);
    if (exists) {
      return false;
    }

    await expenseRequestRepository.appendApproval({
      tenant_id: input.tenantId ?? null,
      expense_request_id: input.expenseRequestId,
      approval_round: input.approvalRound,
      step: input.step,
      action: input.action,
      approver_id: input.approverId,
      comment: input.comment ?? null,
    });
    return true;
  }
