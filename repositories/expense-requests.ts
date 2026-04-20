import { Errors } from "@/errors/error-factory";
import type {
  ExpenseRequestItemInput,
  ExpenseRequestListQueryType,
} from "@/schema/expense-requests";
import { SupabaseDB } from "@/utils/supabase/index";

export type ExpenseRequestRecord = {
  id: string;
  request_no: string | null;
  employee_id: string;
  project_id: string | null;
  mode: string;
  title: string | null;
  total_amount: number;
  status: string;
  current_step: string;
  submitted_at: string | null;
  approved_at: string | null;
  rejected_at: string | null;
  cancelled_at: string | null;
  completed_at: string | null;
  assignee_id: string | null;
  rejected_reason: string | null;
  created_at: string | null;
  updated_at: string | null;
  employee?: unknown;
  project?: unknown;
  assignee?: unknown;
  items?: unknown;
  approvals?: unknown;
  settlement?: unknown;
};

export type ExpenseRequestMutationPayload = {
  employee_id?: string;
  project_id?: string | null;
  mode?: string;
  title?: string | null;
  request_no?: string;
  total_amount?: number;
  status?: string;
  current_step?: string;
  submitted_at?: string | null;
  approved_at?: string | null;
  rejected_at?: string | null;
  cancelled_at?: string | null;
  completed_at?: string | null;
  assignee_id?: string | null;
  rejected_reason?: string | null;
  amount?: number;
  category?: string | null;
  reason?: string | null;
  evidence_images?: string[];
};

type ExpenseRequestApprovalPayload = {
  expense_request_id: string;
  step: string;
  action: string;
  approver_id?: string | null;
  comment?: string | null;
};

type ExpenseRequestSettlementPayload = {
  expense_request_id: string;
  payee_name: string;
  payee_bank?: string | null;
  payee_account?: string | null;
  method: string;
  paid_amount: number;
  paid_at: string;
  paid_by: string;
  evidence_images: string[];
  remark?: string | null;
};

type ExpenseRequestVisibilityFilter =
  | { type: "all"; employeeIds: string[] }
  | { type: "none"; employeeIds: string[] }
  | { type: "self"; employeeIds: string[] }
  | { type: "assigned"; employeeIds: string[] }
  | { type: "department"; employeeIds: string[] };

class ExpenseRequestRepository {
  private summarySelect = `
    *,
    employee:employees!expense_requests_employee_id_fkey(id, name, phone, role, status),
    project:projects(id, name, status),
    assignee:employees!expense_requests_assignee_id_fkey(id, name, phone, role, status),
    settlement:expense_request_settlements(
      id,
      method,
      paid_amount,
      paid_at,
      paid_by
    )
  `;

  private detailSelect = `
    *,
    employee:employees!expense_requests_employee_id_fkey(id, name, phone, role, status),
    project:projects(id, name, status, signed_amount, customer_id),
    assignee:employees!expense_requests_assignee_id_fkey(id, name, phone, role, status),
    items:expense_request_items(
      id,
      occurred_at,
      category,
      amount,
      remark,
      invoice_no,
      vendor_name,
      evidence_images,
      created_at,
      updated_at
    ),
    approvals:expense_request_approvals(
      id,
      step,
      action,
      approver_id,
      comment,
      created_at,
      approver:employees!expense_request_approvals_approver_id_fkey(
        id,
        name,
        phone,
        role,
        status
      )
    ),
    settlement:expense_request_settlements(
      id,
      payee_name,
      payee_bank,
      payee_account,
      method,
      paid_amount,
      paid_at,
      paid_by,
      evidence_images,
      remark,
      created_at,
      updated_at,
      paid_operator:employees!expense_request_settlements_paid_by_fkey(
        id,
        name,
        phone,
        role,
        status
      )
    )
  `;

  async findById(id: string): Promise<ExpenseRequestRecord | null> {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("expense_requests")
      .select(this.detailSelect)
      .eq("id", id)
      .maybeSingle();

    if (error) {
      throw Errors.dbError("查询费用申请失败", error);
    }

    return (data as ExpenseRequestRecord | null) ?? null;
  }

  async create(
    payload: ExpenseRequestMutationPayload,
    items: ExpenseRequestItemInput[],
  ): Promise<ExpenseRequestRecord> {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("expense_requests")
      .insert(payload)
      .select("id")
      .maybeSingle();

    if (error) {
      throw Errors.dbError("创建费用申请失败", error);
    }

    if (!data?.id) {
      throw Errors.badRequest("创建费用申请失败");
    }

    if (items.length > 0) {
      await this.replaceItems(data.id, items);
    }

    const record = await this.findById(data.id);
    if (!record) {
      throw Errors.badRequest("费用申请创建成功但读取失败");
    }

    return record;
  }

  async update(
    id: string,
    payload: ExpenseRequestMutationPayload,
    items?: ExpenseRequestItemInput[],
  ): Promise<ExpenseRequestRecord> {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("expense_requests")
      .update(payload)
      .eq("id", id)
      .select("id")
      .maybeSingle();

    if (error) {
      throw Errors.dbError("更新费用申请失败", error);
    }

    if (!data?.id) {
      throw Errors.badRequest("费用申请不存在或更新失败");
    }

    if (items) {
      await this.replaceItems(id, items);
    }

    const record = await this.findById(id);
    if (!record) {
      throw Errors.badRequest("费用申请更新成功但读取失败");
    }

    return record;
  }

  async replaceItems(id: string, items: ExpenseRequestItemInput[]) {
    const { error: deleteError } = await SupabaseDB.getAdminClient()
      .from("expense_request_items")
      .delete()
      .eq("expense_request_id", id);

    if (deleteError) {
      throw Errors.dbError("清理费用明细失败", deleteError);
    }

    if (items.length === 0) {
      return;
    }

    const payload = items.map((item) => ({
      expense_request_id: id,
      occurred_at: item.occurred_at ?? null,
      category: item.category,
      amount: item.amount,
      remark: item.remark ?? null,
      invoice_no: item.invoice_no ?? null,
      vendor_name: item.vendor_name ?? null,
      evidence_images: item.evidence_images ?? [],
    }));

    const { error } = await SupabaseDB.getAdminClient()
      .from("expense_request_items")
      .insert(payload);

    if (error) {
      throw Errors.dbError("保存费用明细失败", error);
    }
  }

  async appendApproval(payload: ExpenseRequestApprovalPayload) {
    const { error } = await SupabaseDB.getAdminClient()
      .from("expense_request_approvals")
      .insert({
        expense_request_id: payload.expense_request_id,
        step: payload.step,
        action: payload.action,
        approver_id: payload.approver_id ?? null,
        comment: payload.comment ?? null,
      });

    if (error) {
      throw Errors.dbError("写入费用审批记录失败", error);
    }
  }

  async createSettlement(payload: ExpenseRequestSettlementPayload) {
    const { error } = await SupabaseDB.getAdminClient()
      .from("expense_request_settlements")
      .insert({
        expense_request_id: payload.expense_request_id,
        payee_name: payload.payee_name,
        payee_bank: payload.payee_bank ?? null,
        payee_account: payload.payee_account ?? null,
        method: payload.method,
        paid_amount: payload.paid_amount,
        paid_at: payload.paid_at,
        paid_by: payload.paid_by,
        evidence_images: payload.evidence_images,
        remark: payload.remark ?? null,
      });

    if (error) {
      throw Errors.dbError("登记费用打款失败", error);
    }
  }

  async hasSettlement(expenseRequestId: string) {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("expense_request_settlements")
      .select("id")
      .eq("expense_request_id", expenseRequestId)
      .maybeSingle();

    if (error) {
      throw Errors.dbError("查询费用打款记录失败", error);
    }

    return !!data?.id;
  }

  async list(
    params: ExpenseRequestListQueryType,
    visibility?: ExpenseRequestVisibilityFilter,
  ) {
    const {
      page,
      pageSize,
      employee_id,
      assignee_id,
      project_id,
      status,
      mode,
      current_step,
      keyword,
    } = params;
    let query = SupabaseDB.getAdminClient()
      .from("expense_requests")
      .select(this.summarySelect, { count: "exact" })
      .order("created_at", { ascending: false });

    if (employee_id) {
      query = query.eq("employee_id", employee_id);
    }

    if (assignee_id) {
      query = query.eq("assignee_id", assignee_id);
    }

    if (project_id) {
      query = query.eq("project_id", project_id);
    }

    if (status) {
      query = query.eq("status", status);
    }

    if (mode) {
      query = query.eq("mode", mode);
    }

    if (current_step) {
      query = query.eq("current_step", current_step);
    }

    if (keyword) {
      query = query.or(
        `request_no.ilike.%${keyword}%,title.ilike.%${keyword}%`,
      );
    }

    const { data, error } = await query;

    if (error) {
      throw Errors.dbError("查询费用申请列表失败", error);
    }

    let rows = ((data || []) as unknown) as ExpenseRequestRecord[];
    if (visibility) {
      if (visibility.type === "none") {
        rows = [];
      } else if (visibility.type === "self") {
        rows = rows.filter((item) => visibility.employeeIds.includes(item.employee_id));
      } else if (visibility.type === "assigned") {
        rows = rows.filter((item) =>
          visibility.employeeIds.includes(item.employee_id) ||
          (item.assignee_id ? visibility.employeeIds.includes(item.assignee_id) : false)
        );
      } else if (visibility.type === "department") {
        rows = rows.filter((item) =>
          visibility.employeeIds.includes(item.employee_id) ||
          (item.assignee_id ? visibility.employeeIds.includes(item.assignee_id) : false)
        );
      }
    }

    const total = rows.length;
    const from = (page - 1) * pageSize;
    const to = from + pageSize;
    const paged = rows.slice(from, to);

    return {
      list: paged,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: total ? Math.ceil(total / pageSize) : 0,
      },
    };
  }
}

export const expenseRequestRepository = new ExpenseRequestRepository();
