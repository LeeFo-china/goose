import { Errors } from "@/errors/error-factory";
import { expenseRequestRepository } from "@/repositories/expense-requests";
import type {
  ApproveExpenseRequestInput,
  CancelExpenseRequestInput,
  CreateExpenseRequestInput,
  ExpenseApprovalCandidateQueryType,
  ExpenseApprovalChainItemInput,
  ExpenseApprovalTemplateQueryType,
  ExpenseRequestListQueryType,
  ExpenseRequestTodoQueryType,
  ExpenseRequestItemInput,
  PayExpenseRequestInput,
  RejectExpenseRequestInput,
  SubmitExpenseRequestInput,
  UpdateExpenseRequestInput,
} from "@/schema/expense-requests";
import type {
  ExpenseApprovalCandidateEmployee,
  ExpenseApprovalChainPayload,
  ExpenseApprovalChainRecord,
} from "@/repositories/expense-requests";
import { SupabaseDB } from "@/utils/supabase/index";
import type { AuthContext } from "@/services/authorization";
import { accessPolicyService } from "@/services/access-policy";
import { expenseRequestCategoryService } from "@/services/expense-request-categories";

type ExpenseRequestVisibilityFilter = Awaited<
  ReturnType<typeof accessPolicyService.getVisibleExpenseFilters>
>;

type ExpenseRequestOperationPermission =
  | "expense_request.approve_manager"
  | "expense_request.approve_finance"
  | "expense_request.pay";

type ExpenseRequestAccessScope = "self" | "assigned" | "department" | "all";

type ApprovalChainStep = "manager_review" | "finance_review";

const approvalChainStepConfigs: Array<{
  step: ApprovalChainStep;
  step_name: string;
  sort_order: number;
  required_permission: ExpenseRequestOperationPermission;
  description: string;
}> = [
  {
    step: "manager_review",
    step_name: "经理审批",
    sort_order: 1,
    required_permission: "expense_request.approve_manager",
    description: "请选择具备经理审批权限的负责人",
  },
  {
    step: "finance_review",
    step_name: "财务审批",
    sort_order: 2,
    required_permission: "expense_request.approve_finance",
    description: "请选择具备财务审批权限的会计或财务人员",
  },
];

const approvalStepPermissionMap: Record<string, ExpenseRequestOperationPermission> = {
  manager_review: "expense_request.approve_manager",
  finance_review: "expense_request.approve_finance",
  payment: "expense_request.pay",
};

const scopeWeight: Record<ExpenseRequestAccessScope, number> = {
  self: 1,
  assigned: 2,
  department: 3,
  all: 4,
};

type ResolvedExpenseRequestItemInput = ExpenseRequestItemInput & {
  category: string;
  category_code: string | null;
};

function calculateTotalAmount(items: Array<ExpenseRequestItemInput | ResolvedExpenseRequestItemInput>) {
  return Number(
    items.reduce((sum, item) => sum + Number(item.amount || 0), 0).toFixed(2),
  );
}

function buildLegacyFields(
  title: string | null | undefined,
  items: Array<ExpenseRequestItemInput | ResolvedExpenseRequestItemInput>,
  totalAmount: number,
) {
  const firstItem = items[0];
  const evidenceImages = items.flatMap((item) => item.evidence_images || []);

  return {
    amount: totalAmount,
    category: firstItem?.category ?? "GENERAL",
    reason: title ?? firstItem?.remark ?? "费用申请",
    evidence_images: evidenceImages,
  };
}

function generateExpenseRequestNo() {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  const stamp = [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate()),
    pad(now.getHours()),
    pad(now.getMinutes()),
    pad(now.getSeconds()),
  ].join("");
  const random = Math.floor(Math.random() * 9000) + 1000;

  return `ER${stamp}${random}`;
}

function normalizeRelationName(value: unknown) {
  if (Array.isArray(value)) {
    const first = value[0] as { name?: unknown } | undefined;
    return typeof first?.name === "string" ? first.name : null;
  }

  if (value && typeof value === "object") {
    const item = value as { name?: unknown };
    return typeof item.name === "string" ? item.name : null;
  }

  return null;
}

function normalizeScope(value: string | null | undefined): ExpenseRequestAccessScope {
  if (value === "department" || value === "assigned" || value === "all") {
    return value;
  }

  return "self";
}

class ExpenseRequestService {
  private async resolveItems(
    items: ExpenseRequestItemInput[],
  ): Promise<ResolvedExpenseRequestItemInput[]> {
    return Promise.all(
      items.map(async (item) => {
        const categoryCode = item.category_code?.trim() || null;
        if (categoryCode) {
          const category =
            await expenseRequestCategoryService.resolveActiveCategoryByCode(
              categoryCode,
            );

          return {
            ...item,
            category: category.name,
            category_code: category.code,
          };
        }

        const categoryName = item.category?.trim();
        if (!categoryName) {
          throw Errors.badRequest("费用分类不能为空");
        }

        return {
          ...item,
          category: categoryName,
          category_code: null,
        };
      }),
    );
  }

  private ensureCurrentEmployee(
    authContext: AuthContext,
    employeeId: string,
    permissionCode:
      | "expense_request.create"
      | "expense_request.submit"
      | "expense_request.approve_manager"
      | "expense_request.approve_finance"
      | "expense_request.pay",
  ) {
    const scope = accessPolicyService.assertPermission(authContext, permissionCode);
    if (scope === "all") {
      return;
    }

    if (!authContext.employeeId || authContext.employeeId !== employeeId) {
      throw Errors.forbidden();
    }
  }

  private async assertCanReadExpenseRequest(
    authContext: AuthContext,
    record: { employee_id: string; assignee_id: string | null },
  ) {
    const visibility = await accessPolicyService.getVisibleExpenseFilters(
      authContext,
      "expense_request.read",
    );

    if (visibility.type === "all") {
      return;
    }

    if (visibility.type === "none") {
      throw Errors.forbidden();
    }

    const employeeIds = visibility.employeeIds;
    if (visibility.type === "self") {
      if (!employeeIds.includes(record.employee_id)) {
        throw Errors.forbidden();
      }
      return;
    }

    if (
      employeeIds.includes(record.employee_id) ||
      (record.assignee_id ? employeeIds.includes(record.assignee_id) : false)
    ) {
      return;
    }

    throw Errors.forbidden();
  }

  private canAccessByVisibility(
    visibility: ExpenseRequestVisibilityFilter,
    record: { employee_id: string; assignee_id: string | null },
  ) {
    if (visibility.type === "all") {
      return true;
    }

    if (visibility.type === "none") {
      return false;
    }

    if (visibility.type === "self") {
      return visibility.employeeIds.includes(record.employee_id);
    }

    return (
      visibility.employeeIds.includes(record.employee_id) ||
      (record.assignee_id ? visibility.employeeIds.includes(record.assignee_id) : false)
    );
  }

  private async getVisibilityForPermission(
    authContext: AuthContext,
    permissionCode: ExpenseRequestOperationPermission | "expense_request.read",
  ): Promise<ExpenseRequestVisibilityFilter> {
    if (!accessPolicyService.hasPermission(authContext, permissionCode)) {
      return {
        type: "none",
        employeeIds: [],
      };
    }

    return accessPolicyService.getVisibleExpenseFilters(authContext, permissionCode);
  }

  private async assertCanOperateExpenseRequest(
    authContext: AuthContext,
    record: { employee_id: string; assignee_id: string | null },
    permissionCode: ExpenseRequestOperationPermission,
    message: string,
  ) {
    const visibility = await this.getVisibilityForPermission(
      authContext,
      permissionCode,
    );

    if (!this.canAccessByVisibility(visibility, record)) {
      throw Errors.business(403, message, "FORBIDDEN");
    }
  }

  private getProcessPermissionForQuery(params: ExpenseRequestListQueryType) {
    if (params.status === "pending" && params.current_step === "manager_review") {
      return "expense_request.approve_manager" as const;
    }

    if (params.status === "pending" && params.current_step === "finance_review") {
      return "expense_request.approve_finance" as const;
    }

    if (params.status === "approved" && params.current_step === "payment") {
      return "expense_request.pay" as const;
    }

    return null;
  }

  private mergeScope(existing: string | null, incoming: string | null) {
    const normalizedExisting = existing ? normalizeScope(existing) : null;
    const normalizedIncoming = normalizeScope(incoming);
    if (!normalizedExisting) {
      return normalizedIncoming;
    }

    return scopeWeight[normalizedIncoming] > scopeWeight[normalizedExisting]
      ? normalizedIncoming
      : normalizedExisting;
  }

  private buildCandidateScopeMap(
    rows: Array<{
      employee_id: string;
      role_scope: string | null;
      override_effect: string | null;
      override_scope: string | null;
    }>,
  ) {
    const map = new Map<string, string>();

    for (const row of rows) {
      if (row.override_effect === "deny") {
        map.delete(row.employee_id);
        continue;
      }

      if (row.override_effect === "allow") {
        map.set(
          row.employee_id,
          this.mergeScope(map.get(row.employee_id) ?? null, row.override_scope),
        );
        continue;
      }

      if (row.role_scope) {
        map.set(
          row.employee_id,
          this.mergeScope(map.get(row.employee_id) ?? null, row.role_scope),
        );
      }
    }

    return map;
  }

  private scopeCoversApplicant(input: {
    scope: string | null;
    candidate: ExpenseApprovalCandidateEmployee;
    applicant: { id: string; department_id: string | null };
  }) {
    const scope = normalizeScope(input.scope);
    if (scope === "all") {
      return true;
    }

    if (scope === "department") {
      return Boolean(
        input.applicant.department_id &&
          input.candidate.department_id &&
          input.applicant.department_id === input.candidate.department_id,
      );
    }

    return input.candidate.id === input.applicant.id;
  }

  private getStepConfig(step: string) {
    return approvalChainStepConfigs.find((item) => item.step === step) ?? null;
  }

  private async getApplicantEmployee(id: string) {
    const employee = await expenseRequestRepository.findEmployeeForApproval(id);
    if (!employee || employee.status !== "active") {
      throw Errors.badRequest("申请人不存在或不可用");
    }

    return employee;
  }

  private async assertCandidateForStep(input: {
    candidateId: string;
    applicantId: string;
    step: ApprovalChainStep;
  }) {
    const [candidate, applicant] = await Promise.all([
      expenseRequestRepository.findEmployeeForApproval(input.candidateId),
      this.getApplicantEmployee(input.applicantId),
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

  private normalizeApprovalChainInput(
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

  private async buildApprovalChainPayload(
    expenseRequestId: string,
    applicantId: string,
    input: ExpenseApprovalChainItemInput[],
    firstStatus: "pending" | "current",
  ): Promise<ExpenseApprovalChainPayload[]> {
    const normalized = this.normalizeApprovalChainInput(input);
    const payload: ExpenseApprovalChainPayload[] = [];

    for (const item of normalized) {
      const { candidate, config } = await this.assertCandidateForStep({
        candidateId: item.assignee_id,
        applicantId,
        step: item.step,
      });

      payload.push({
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

  private getApprovalChain(record: { approval_chain?: unknown }) {
    const rows = Array.isArray(record.approval_chain)
      ? record.approval_chain
      : [];

    return [...(rows as ExpenseApprovalChainRecord[])].sort(
      (a, b) => a.sort_order - b.sort_order,
    );
  }

  private getCurrentApprovalNode(record: {
    approval_chain?: unknown;
    current_step: string;
  }) {
    const chain = this.getApprovalChain(record);
    return chain.find((item) => item.status === "current") ??
      chain.find((item) => item.step === record.current_step && item.status !== "approved") ??
      null;
  }

  private async assertEmployeeExists(id: string, message = "员工不存在") {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("employees")
      .select("id")
      .eq("id", id)
      .maybeSingle();

    if (error) {
      throw Errors.dbError("查询员工失败", error);
    }

    if (!data?.id) {
      throw Errors.badRequest(message);
    }
  }

  private async assertProjectExists(id: string | null | undefined) {
    if (!id) {
      return;
    }

    const { data, error } = await SupabaseDB.getAdminClient()
      .from("projects")
      .select("id")
      .eq("id", id)
      .maybeSingle();

    if (error) {
      throw Errors.dbError("查询项目失败", error);
    }

    if (!data?.id) {
      throw Errors.badRequest("项目不存在");
    }
  }

  getApprovalTemplate(_params: ExpenseApprovalTemplateQueryType) {
    return {
      list: approvalChainStepConfigs.map((item) => ({
        step: item.step,
        step_name: item.step_name,
        required: true,
        sort_order: item.sort_order,
        required_permission: item.required_permission,
        description: item.description,
      })),
    };
  }

  async listApprovalCandidates(
    authContext: AuthContext,
    params: ExpenseApprovalCandidateQueryType,
  ) {
    const permissionCode = approvalStepPermissionMap[params.step];
    if (!permissionCode) {
      throw Errors.badRequest("无效的审批节点");
    }

    const applicantId = params.applicant_employee_id ?? authContext.employeeId;
    if (!applicantId) {
      throw Errors.badRequest("缺少申请人");
    }

    const applicant = await this.getApplicantEmployee(applicantId);
    const candidates = await expenseRequestRepository.listEmployeesForApprovalCandidates({
      keyword: params.keyword,
    });
    const permissionRows = await expenseRequestRepository.listEmployeePermissionContexts(
      candidates.map((item) => item.id),
      permissionCode,
    );
    const scopeMap = this.buildCandidateScopeMap(permissionRows);
    const filtered = candidates
      .filter((candidate) => candidate.id !== applicant.id)
      .filter((candidate) => {
        if (params.department_id && candidate.department_id !== params.department_id) {
          return false;
        }

        const scope = scopeMap.get(candidate.id) ?? null;
        return Boolean(scope) &&
          this.scopeCoversApplicant({
            scope,
            candidate,
            applicant,
          });
      });
    const total = filtered.length;
    const from = (params.page - 1) * params.pageSize;
    const paged = filtered.slice(from, from + params.pageSize);

    return {
      list: paged.map((item) => ({
        id: item.id,
        name: item.name,
        phone: item.phone,
        avatar: item.avatar,
        department_id: item.department_id,
        department_name: normalizeRelationName(item.department),
        post_name: normalizeRelationName(item.post),
        matched_permission: permissionCode,
        matched_scope: scopeMap.get(item.id) ?? null,
      })),
      pagination: {
        page: params.page,
        pageSize: params.pageSize,
        total,
        totalPages: total ? Math.ceil(total / params.pageSize) : 0,
      },
    };
  }

  async createExpenseRequest(authContext: AuthContext, input: CreateExpenseRequestInput) {
    this.ensureCurrentEmployee(authContext, input.employee_id, "expense_request.create");
    await this.assertEmployeeExists(input.employee_id);
    await this.assertProjectExists(input.project_id);

    const items = await this.resolveItems(input.items || []);
    const totalAmount = calculateTotalAmount(items);
    const title = input.title?.trim() || null;

    const created = await expenseRequestRepository.create(
      {
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

    if (input.approval_chain && input.approval_chain.length > 0) {
      await expenseRequestRepository.replaceApprovalChain(
        created.id,
        await this.buildApprovalChainPayload(
          created.id,
          input.employee_id,
          input.approval_chain,
          "pending",
        ),
      );
      return expenseRequestRepository.findById(created.id);
    }

    return created;
  }

  async updateExpenseRequest(
    authContext: AuthContext,
    id: string,
    input: UpdateExpenseRequestInput,
  ) {
    const existing = await expenseRequestRepository.findById(id);
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
      throw Errors.badRequest("当前状态不允许修改费用申请");
    }

    if (input.approval_chain && !["draft", "rejected"].includes(existing.status)) {
      throw Errors.badRequest("当前状态不允许修改审批流程");
    }

    await this.assertProjectExists(input.project_id);

    const items = input.items
      ? await this.resolveItems(input.items)
      : (((existing.items as ResolvedExpenseRequestItemInput[] | undefined) || []));
    const totalAmount = calculateTotalAmount(items);
    const title = input.title?.trim() ?? existing.title ?? null;

    const updated = await expenseRequestRepository.update(
      id,
      {
        project_id: input.project_id ?? existing.project_id,
        mode: input.mode ?? existing.mode,
        title,
        total_amount: totalAmount,
        rejected_reason: existing.status === "rejected"
          ? existing.rejected_reason
          : null,
        ...buildLegacyFields(title, items, totalAmount),
      },
      input.items ? items : undefined,
    );

    if (input.approval_chain) {
      await expenseRequestRepository.replaceApprovalChain(
        id,
        await this.buildApprovalChainPayload(
          id,
          existing.employee_id,
          input.approval_chain,
          "pending",
        ),
      );
      return expenseRequestRepository.findById(id);
    }

    return updated;
  }

  async submitExpenseRequest(
    authContext: AuthContext,
    id: string,
    input: SubmitExpenseRequestInput,
  ) {
    const existing = await expenseRequestRepository.findById(id);
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

    if (!["draft", "rejected"].includes(existing.status)) {
      throw Errors.badRequest("当前状态不允许提交费用申请");
    }

    await this.assertEmployeeExists(operatorId, "提交人不存在");

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
    const requestedApprovalChain = input.approval_chain ??
      (this.getApprovalChain(existing).length > 0
        ? this.getApprovalChain(existing).map((item) => ({
          step: item.step as ApprovalChainStep,
          assignee_id: item.assignee_id,
        }))
        : undefined);

    if (!requestedApprovalChain || requestedApprovalChain.length === 0) {
      throw Errors.badRequest("请先选择审批流程");
    }
    const approvalChainPayload = await this.buildApprovalChainPayload(
      id,
      existing.employee_id,
      requestedApprovalChain,
      "current",
    );

    const updated = await expenseRequestRepository.update(id, {
      total_amount: totalAmount,
      status: "pending",
      current_step: "manager_review",
      submitted_at: now,
      rejected_reason: null,
      assignee_id: approvalChainPayload[0]?.assignee_id ?? null,
      ...buildLegacyFields(existing.title, items, totalAmount),
    });

    await expenseRequestRepository.replaceApprovalChain(id, approvalChainPayload);

    await expenseRequestRepository.appendApproval({
      expense_request_id: id,
      step: "draft",
      action,
      approver_id: operatorId,
      comment: input.comment ?? null,
    });

    return expenseRequestRepository.findById(updated.id);
  }

  async approveExpenseRequest(
    authContext: AuthContext,
    id: string,
    input: ApproveExpenseRequestInput,
  ) {
    const existing = await expenseRequestRepository.findById(id);
    if (!existing) {
      throw Errors.badRequest("费用申请不存在");
    }

    if (existing.status !== "pending") {
      throw Errors.badRequest("只有审批中的费用申请才能通过");
    }

    if (!["manager_review", "finance_review"].includes(existing.current_step)) {
      throw Errors.badRequest("当前审批节点不允许通过");
    }

    const approverId = input.approver_id ?? authContext.employeeId;
    if (!approverId) {
      throw Errors.badRequest("缺少审批人");
    }

    const currentNode = this.getCurrentApprovalNode(existing);
    if (currentNode) {
      if (currentNode.status !== "current") {
        throw Errors.badRequest("当前审批链节点状态不允许操作");
      }

      if (currentNode.assignee_id !== approverId) {
        throw Errors.business(403, "当前费用申请不归你审批", "FORBIDDEN");
      }

      if (currentNode.step !== existing.current_step) {
        throw Errors.badRequest("审批链与当前节点不一致");
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

    await this.assertEmployeeExists(approverId, "审批人不存在");

    const now = new Date().toISOString();
    const nextStatus = existing.current_step === "finance_review"
      ? "approved"
      : "pending";
    const nextStep = existing.current_step === "finance_review"
      ? "payment"
      : "finance_review";
    const chain = this.getApprovalChain(existing);
    const nextNode = chain.find((item) => item.step === nextStep);

    const updated = await expenseRequestRepository.update(id, {
      status: nextStatus,
      current_step: nextStep,
      approved_at: existing.current_step === "finance_review" ? now : null,
      assignee_id: nextNode?.assignee_id ?? null,
    });

    if (currentNode) {
      await expenseRequestRepository.updateApprovalChainNode(currentNode.id, {
        status: "approved",
        acted_by: approverId,
        acted_at: now,
        comment: input.comment ?? null,
      });
    }

    if (nextNode && existing.current_step === "manager_review") {
      await expenseRequestRepository.updateApprovalChainNode(nextNode.id, {
        status: "current",
      });
    }

    await expenseRequestRepository.appendApproval({
      expense_request_id: id,
      step: existing.current_step,
      action: "approve",
      approver_id: approverId,
      comment: input.comment ?? null,
    });

    return expenseRequestRepository.findById(updated.id);
  }

  async rejectExpenseRequest(
    authContext: AuthContext,
    id: string,
    input: RejectExpenseRequestInput,
  ) {
    const existing = await expenseRequestRepository.findById(id);
    if (!existing) {
      throw Errors.badRequest("费用申请不存在");
    }

    if (existing.status !== "pending") {
      throw Errors.badRequest("只有审批中的费用申请才能驳回");
    }

    const approverId = input.approver_id ?? authContext.employeeId;
    if (!approverId) {
      throw Errors.badRequest("缺少审批人");
    }
    const rejectedReason = input.rejected_reason ?? input.reason;
    if (!rejectedReason) {
      throw Errors.badRequest("驳回原因不能为空");
    }

    const currentNode = this.getCurrentApprovalNode(existing);
    if (currentNode) {
      if (currentNode.status !== "current") {
        throw Errors.badRequest("当前审批链节点状态不允许操作");
      }

      if (currentNode.assignee_id !== approverId) {
        throw Errors.business(403, "当前费用申请不归你审批", "FORBIDDEN");
      }

      if (currentNode.step !== existing.current_step) {
        throw Errors.badRequest("审批链与当前节点不一致");
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
      throw Errors.badRequest("当前审批节点不允许驳回");
    }

    await this.assertEmployeeExists(approverId, "审批人不存在");

    const now = new Date().toISOString();
    const updated = await expenseRequestRepository.update(id, {
      status: "rejected",
      current_step: "draft",
      rejected_at: now,
      rejected_reason: rejectedReason,
      assignee_id: existing.employee_id,
    });

    if (currentNode) {
      await expenseRequestRepository.updateApprovalChainNode(currentNode.id, {
        status: "rejected",
        acted_by: approverId,
        acted_at: now,
        comment: input.comment ?? rejectedReason,
      });

      for (const node of this.getApprovalChain(existing)) {
        if (node.id !== currentNode.id && node.status === "pending") {
          await expenseRequestRepository.updateApprovalChainNode(node.id, {
            status: "cancelled",
          });
        }
      }
    }

    await expenseRequestRepository.appendApproval({
      expense_request_id: id,
      step: existing.current_step,
      action: "reject",
      approver_id: approverId,
      comment: input.comment ?? rejectedReason,
    });

    return expenseRequestRepository.findById(updated.id);
  }

  async cancelExpenseRequest(
    authContext: AuthContext,
    id: string,
    input: CancelExpenseRequestInput,
  ) {
    const existing = await expenseRequestRepository.findById(id);
    if (!existing) {
      throw Errors.badRequest("费用申请不存在");
    }

    await this.assertCanReadExpenseRequest(authContext, existing);
    this.ensureCurrentEmployee(
      authContext,
      input.operator_id,
      "expense_request.submit",
    );

    if (!["draft", "pending", "rejected"].includes(existing.status)) {
      throw Errors.badRequest("当前状态不允许撤回费用申请");
    }

    await this.assertEmployeeExists(input.operator_id, "操作员工不存在");

    const now = new Date().toISOString();
    const updated = await expenseRequestRepository.update(id, {
      status: "cancelled",
      current_step: "cancelled",
      cancelled_at: now,
      assignee_id: null,
    });

    for (const node of this.getApprovalChain(existing)) {
      if (!["approved", "rejected", "cancelled"].includes(node.status)) {
        await expenseRequestRepository.updateApprovalChainNode(node.id, {
          status: "cancelled",
          acted_by: input.operator_id,
          acted_at: now,
          comment: input.comment ?? null,
        });
      }
    }

    await expenseRequestRepository.appendApproval({
      expense_request_id: id,
      step: existing.current_step,
      action: "cancel",
      approver_id: input.operator_id,
      comment: input.comment ?? null,
    });

    return expenseRequestRepository.findById(updated.id);
  }

  async payExpenseRequest(
    authContext: AuthContext,
    id: string,
    input: PayExpenseRequestInput,
  ) {
    const existing = await expenseRequestRepository.findById(id);
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

    if (existing.status !== "approved" || existing.current_step !== "payment") {
      throw Errors.badRequest("只有待打款的费用申请才能登记支付");
    }

    if (await expenseRequestRepository.hasSettlement(id)) {
      throw Errors.badRequest("该费用申请已登记过打款");
    }

    await this.assertEmployeeExists(input.paid_by, "打款登记员工不存在");

    if (Number(input.paid_amount.toFixed(2)) !== Number(existing.total_amount)) {
      throw Errors.badRequest("打款金额必须等于费用申请总金额");
    }

    const paidAt = input.paid_at || new Date().toISOString();

    await expenseRequestRepository.createSettlement({
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

    await expenseRequestRepository.appendApproval({
      expense_request_id: id,
      step: "payment",
      action: "pay",
      approver_id: input.paid_by,
      comment: input.remark ?? null,
    });

    await expenseRequestRepository.update(id, {
      status: "paid",
      current_step: "done",
      completed_at: paidAt,
      assignee_id: null,
    });

    return expenseRequestRepository.findById(id);
  }

  async getExpenseRequestById(authContext: AuthContext, id: string) {
    const data = await expenseRequestRepository.findById(id);
    if (!data) {
      throw Errors.badRequest("费用申请不存在");
    }

    await this.assertCanReadExpenseRequest(authContext, data);

    return data;
  }

  async listExpenseRequests(
    authContext: AuthContext,
    params: ExpenseRequestListQueryType,
  ) {
    const processPermission = this.getProcessPermissionForQuery(params);
    const visibility = processPermission
      ? await this.getVisibilityForPermission(authContext, processPermission)
      : await accessPolicyService.getVisibleExpenseFilters(
        authContext,
        "expense_request.read",
      );
    const result = await expenseRequestRepository.list(
      processPermission
        ? {
          ...params,
          page: 1,
          pageSize: 10000,
        }
        : params,
      visibility,
    );

    if (!processPermission) {
      return result;
    }

    const rows = result.list.filter((item) => {
      const currentNode = this.getCurrentApprovalNode(item);
      if (!currentNode) {
        return true;
      }

      return currentNode.assignee_id === authContext.employeeId;
    });
    const from = (params.page - 1) * params.pageSize;
    const list = rows.slice(from, from + params.pageSize);

    return {
      list,
      pagination: {
        page: params.page,
        pageSize: params.pageSize,
        total: rows.length,
        totalPages: rows.length ? Math.ceil(rows.length / params.pageSize) : 0,
      },
    };
  }

  async listTodoExpenseRequests(
    authContext: AuthContext,
    params: ExpenseRequestTodoQueryType,
  ) {
    const todoDefinitions = [
      {
        status: "pending",
        current_step: "manager_review",
        permissionCode: "expense_request.approve_manager" as const,
      },
      {
        status: "pending",
        current_step: "finance_review",
        permissionCode: "expense_request.approve_finance" as const,
      },
      {
        status: "approved",
        current_step: "payment",
        permissionCode: "expense_request.pay" as const,
      },
    ];
    const rowsById = new Map<string, Awaited<ReturnType<typeof expenseRequestRepository.list>>["list"][number]>();

    for (const definition of todoDefinitions) {
      if (params.status && params.status !== definition.status) {
        continue;
      }

      const visibility = await this.getVisibilityForPermission(
        authContext,
        definition.permissionCode,
      );
      if (visibility.type === "none") {
        continue;
      }

      const result = await expenseRequestRepository.list(
        {
          page: 1,
          pageSize: 10000,
          keyword: params.keyword,
          status: definition.status as ExpenseRequestListQueryType["status"],
          current_step:
            definition.current_step as ExpenseRequestListQueryType["current_step"],
        },
        visibility,
      );

      for (const item of result.list) {
        const currentNode = this.getCurrentApprovalNode(item);
        if (
          currentNode &&
          definition.status === "pending" &&
          currentNode.assignee_id !== authContext.employeeId
        ) {
          continue;
        }

        rowsById.set(item.id, item);
      }
    }

    const rows = Array.from(rowsById.values()).sort((a, b) => {
      const timeA = a.created_at ? new Date(a.created_at).getTime() : 0;
      const timeB = b.created_at ? new Date(b.created_at).getTime() : 0;
      return timeB - timeA;
    });
    const from = (params.page - 1) * params.pageSize;
    const list = rows.slice(from, from + params.pageSize);

    return {
      list,
      pagination: {
        page: params.page,
        pageSize: params.pageSize,
        total: rows.length,
        totalPages: rows.length ? Math.ceil(rows.length / params.pageSize) : 0,
      },
    };
  }
}

export const expenseRequestService = new ExpenseRequestService();
