import { Errors } from "@/errors/error-factory";
import { expenseRequestRepository } from "@/repositories/expense-requests";
import type {
  ApproveExpenseRequestInput,
  CancelExpenseRequestInput,
  CreateExpenseRequestInput,
  ExpenseRequestListQueryType,
  ExpenseRequestItemInput,
  PayExpenseRequestInput,
  RejectExpenseRequestInput,
  SubmitExpenseRequestInput,
  UpdateExpenseRequestInput,
} from "@/schema/expense-requests";
import { SupabaseDB } from "@/utils/supabase/index";
import type { AuthContext } from "@/services/authorization";
import { accessPolicyService } from "@/services/access-policy";

function calculateTotalAmount(items: ExpenseRequestItemInput[]) {
  return Number(
    items.reduce((sum, item) => sum + Number(item.amount || 0), 0).toFixed(2),
  );
}

function buildLegacyFields(
  title: string | null | undefined,
  items: ExpenseRequestItemInput[],
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

class ExpenseRequestService {
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

  async createExpenseRequest(authContext: AuthContext, input: CreateExpenseRequestInput) {
    this.ensureCurrentEmployee(authContext, input.employee_id, "expense_request.create");
    await this.assertEmployeeExists(input.employee_id);
    await this.assertProjectExists(input.project_id);

    const items = input.items || [];
    const totalAmount = calculateTotalAmount(items);
    const title = input.title?.trim() || null;

    return expenseRequestRepository.create(
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

    await this.assertProjectExists(input.project_id);

    const items = input.items
      ?? ((existing.items as ExpenseRequestItemInput[] | undefined) || []);
    const totalAmount = calculateTotalAmount(items);
    const title = input.title?.trim() ?? existing.title ?? null;

    return expenseRequestRepository.update(
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
      input.items,
    );
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
    this.ensureCurrentEmployee(
      authContext,
      input.operator_id,
      "expense_request.submit",
    );

    if (!["draft", "rejected"].includes(existing.status)) {
      throw Errors.badRequest("当前状态不允许提交费用申请");
    }

    await this.assertEmployeeExists(input.operator_id, "提交人不存在");

    const items = (existing.items as ExpenseRequestItemInput[] | undefined) || [];
    if (items.length === 0) {
      throw Errors.badRequest("提交费用申请前至少需要一条费用明细");
    }

    const totalAmount = calculateTotalAmount(items);
    if (totalAmount <= 0) {
      throw Errors.badRequest("费用申请总金额必须大于 0");
    }

    const now = new Date().toISOString();
    const action = existing.status === "rejected" ? "resubmit" : "submit";

    const updated = await expenseRequestRepository.update(id, {
      total_amount: totalAmount,
      status: "pending",
      current_step: "manager_review",
      submitted_at: now,
      rejected_reason: null,
      assignee_id: null,
      ...buildLegacyFields(existing.title, items, totalAmount),
    });

    await expenseRequestRepository.appendApproval({
      expense_request_id: id,
      step: "manager_review",
      action,
      approver_id: input.operator_id,
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

    if (existing.current_step === "manager_review") {
      this.ensureCurrentEmployee(
        authContext,
        input.approver_id,
        "expense_request.approve_manager",
      );
    } else {
      this.ensureCurrentEmployee(
        authContext,
        input.approver_id,
        "expense_request.approve_finance",
      );
    }

    await this.assertEmployeeExists(input.approver_id, "审批人不存在");

    const now = new Date().toISOString();
    const nextStatus = existing.current_step === "finance_review"
      ? "approved"
      : "pending";
    const nextStep = existing.current_step === "finance_review"
      ? "payment"
      : "finance_review";

    const updated = await expenseRequestRepository.update(id, {
      status: nextStatus,
      current_step: nextStep,
      approved_at: existing.current_step === "finance_review" ? now : null,
      assignee_id: null,
    });

    await expenseRequestRepository.appendApproval({
      expense_request_id: id,
      step: existing.current_step,
      action: "approve",
      approver_id: input.approver_id,
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

    if (existing.current_step === "manager_review") {
      this.ensureCurrentEmployee(
        authContext,
        input.approver_id,
        "expense_request.approve_manager",
      );
    } else if (existing.current_step === "finance_review") {
      this.ensureCurrentEmployee(
        authContext,
        input.approver_id,
        "expense_request.approve_finance",
      );
    } else {
      throw Errors.badRequest("当前审批节点不允许驳回");
    }

    await this.assertEmployeeExists(input.approver_id, "审批人不存在");

    const now = new Date().toISOString();
    const updated = await expenseRequestRepository.update(id, {
      status: "rejected",
      current_step: "draft",
      rejected_at: now,
      rejected_reason: input.rejected_reason,
      assignee_id: existing.employee_id,
    });

    await expenseRequestRepository.appendApproval({
      expense_request_id: id,
      step: existing.current_step,
      action: "reject",
      approver_id: input.approver_id,
      comment: input.comment ?? input.rejected_reason,
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
    const visibility = await accessPolicyService.getVisibleExpenseFilters(
      authContext,
      "expense_request.read",
    );
    return expenseRequestRepository.list(params, visibility);
  }
}

export const expenseRequestService = new ExpenseRequestService();
