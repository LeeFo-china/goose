import { Errors } from "@/errors/error-factory";
import type {
  ExpenseRequestListQueryType,
} from "@/schema/expense-requests";
import { SupabaseDB } from "@/utils/supabase/index";

type ExpenseRequestItemMutationInput = {
  id?: string;
  occurred_at?: string | null;
  category_code?: string | null;
  category: string;
  amount: number;
  remark?: string | null;
  invoice_no?: string | null;
  vendor_name?: string | null;
  evidence_images?: string[];
};

export type ExpenseRequestRecord = {
  id: string;
  tenant_id: string | null;
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
  approval_chain?: unknown;
};

export type ExpenseRequestMutationPayload = {
  tenant_id?: string | null;
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
  tenant_id?: string | null;
  expense_request_id: string;
  step: string;
  action: string;
  approver_id?: string | null;
  comment?: string | null;
};

type ExpenseRequestSettlementPayload = {
  tenant_id?: string | null;
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

export type ExpenseApprovalChainPayload = {
  tenant_id?: string | null;
  expense_request_id: string;
  step: string;
  step_name: string;
  sort_order: number;
  assignee_id: string;
  assignee_name_snapshot?: string | null;
  required_permission: string;
  status: string;
};

export type ExpenseApprovalChainRecord = {
  id: string;
  expense_request_id: string;
  step: string;
  step_name: string;
  sort_order: number;
  assignee_id: string;
  assignee_name_snapshot: string | null;
  required_permission: string;
  status: string;
  acted_by: string | null;
  acted_at: string | null;
  comment: string | null;
  created_at: string;
  updated_at: string | null;
  assignee?: unknown;
};

export type ExpenseApprovalCandidateEmployee = {
  id: string;
  name: string | null;
  phone: string | null;
  avatar: string | null;
  status: string | null;
  department_id: string | null;
  tenant_department_id: string | null;
  post_id: string | null;
  tenant_department?: unknown;
  department?: unknown;
  post?: unknown;
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
    employee:employees!expense_requests_employee_id_fkey(id, name, phone, status),
    project:projects(id, name, status),
    assignee:employees!expense_requests_assignee_id_fkey(id, name, phone, status),
    settlement:expense_request_settlements(
      id,
      method,
      paid_amount,
      paid_at,
      paid_by
    ),
    approval_chain:expense_request_approval_chains(
      id,
      step,
      step_name,
      sort_order,
      assignee_id,
      assignee_name_snapshot,
      required_permission,
      status,
      acted_by,
      acted_at,
      comment,
      created_at,
      updated_at,
      assignee:employees!expense_request_approval_chains_assignee_id_fkey(
        id,
        name,
        phone,
        avatar,
        status,
        department_id,
        tenant_department_id,
        tenant_department:tenant_departments!employees_tenant_department_id_fkey(id, alias_name, code, legacy_department_id),
        department:departments!employees_department_id_fkey(name),
        post:posts!employees_post_id_fkey(name)
      )
    )
  `;

  private detailSelect = `
    *,
    employee:employees!expense_requests_employee_id_fkey(id, name, phone, status),
    project:projects(id, name, status, signed_amount, customer_id),
    assignee:employees!expense_requests_assignee_id_fkey(id, name, phone, status),
    items:expense_request_items(
      id,
      occurred_at,
      category_code,
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
        status
      )
    ),
    approval_chain:expense_request_approval_chains(
      id,
      step,
      step_name,
      sort_order,
      assignee_id,
      assignee_name_snapshot,
      required_permission,
      status,
      acted_by,
      acted_at,
      comment,
      created_at,
      updated_at,
      assignee:employees!expense_request_approval_chains_assignee_id_fkey(
        id,
        name,
        phone,
        avatar,
        status,
        department_id,
        tenant_department_id,
        tenant_department:tenant_departments!employees_tenant_department_id_fkey(id, alias_name, code, legacy_department_id),
        department:departments!employees_department_id_fkey(name),
        post:posts!employees_post_id_fkey(name)
      )
    )
  `;

  async findById(
    id: string,
    tenantId?: string | null,
  ): Promise<ExpenseRequestRecord | null> {
    let query = SupabaseDB.getAdminClient()
      .from("expense_requests")
      .select(this.detailSelect)
      .eq("id", id);

    if (tenantId) {
      query = query.eq("tenant_id", tenantId);
    }

    const { data, error } = await query.maybeSingle();

    if (error) {
      throw Errors.dbError("查询费用申请失败", error);
    }

    return (data as ExpenseRequestRecord | null) ?? null;
  }

  async create(
    payload: ExpenseRequestMutationPayload,
    items: ExpenseRequestItemMutationInput[],
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
      await this.replaceItems(data.id, items, payload.tenant_id ?? null);
    }

    const record = await this.findById(data.id, payload.tenant_id ?? null);
    if (!record) {
      throw Errors.badRequest("费用申请创建成功但读取失败");
    }

    return record;
  }

  async update(
    id: string,
    payload: ExpenseRequestMutationPayload,
    items?: ExpenseRequestItemMutationInput[],
    tenantId?: string | null,
  ): Promise<ExpenseRequestRecord> {
    let query = SupabaseDB.getAdminClient()
      .from("expense_requests")
      .update(payload)
      .eq("id", id);

    if (tenantId) {
      query = query.eq("tenant_id", tenantId);
    }

    const { data, error } = await query.select("id").maybeSingle();

    if (error) {
      throw Errors.dbError("更新费用申请失败", error);
    }

    if (!data?.id) {
      throw Errors.badRequest("费用申请不存在或更新失败");
    }

    if (items) {
      await this.replaceItems(id, items, tenantId ?? payload.tenant_id ?? null);
    }

    const record = await this.findById(id, tenantId ?? payload.tenant_id ?? null);
    if (!record) {
      throw Errors.badRequest("费用申请更新成功但读取失败");
    }

    return record;
  }

  async replaceItems(
    id: string,
    items: ExpenseRequestItemMutationInput[],
    tenantId?: string | null,
  ) {
    let deleteQuery = SupabaseDB.getAdminClient()
      .from("expense_request_items")
      .delete()
      .eq("expense_request_id", id);

    if (tenantId) {
      deleteQuery = deleteQuery.eq("tenant_id", tenantId);
    }

    const { error: deleteError } = await deleteQuery.select("id");

    if (deleteError) {
      throw Errors.dbError("清理费用明细失败", deleteError);
    }

    if (items.length === 0) {
      return;
    }

    const payload = items.map((item) => ({
      tenant_id: tenantId ?? null,
      expense_request_id: id,
      occurred_at: item.occurred_at ?? null,
      category_code: item.category_code ?? null,
      category: item.category,
      amount: item.amount,
      remark: item.remark ?? null,
      invoice_no: item.invoice_no ?? null,
      vendor_name: item.vendor_name ?? null,
      evidence_images: item.evidence_images ?? [],
    }));

    const { error } = await SupabaseDB.getAdminClient()
      .from("expense_request_items")
      .insert(payload)
      .select("id");

    if (error) {
      throw Errors.dbError("保存费用明细失败", error);
    }
  }

  async appendApproval(payload: ExpenseRequestApprovalPayload) {
    const { error } = await SupabaseDB.getAdminClient()
      .from("expense_request_approvals")
      .insert({
        tenant_id: payload.tenant_id ?? null,
        expense_request_id: payload.expense_request_id,
        step: payload.step,
        action: payload.action,
        approver_id: payload.approver_id ?? null,
        comment: payload.comment ?? null,
      })
      .select("id");

    if (error) {
      throw Errors.dbError("写入费用审批记录失败", error);
    }
  }

  async replaceApprovalChain(
    expenseRequestId: string,
    items: ExpenseApprovalChainPayload[],
    tenantId?: string | null,
  ) {
    let deleteQuery = SupabaseDB.getAdminClient()
      .from("expense_request_approval_chains")
      .delete()
      .eq("expense_request_id", expenseRequestId);

    if (tenantId) {
      deleteQuery = deleteQuery.eq("tenant_id", tenantId);
    }

    const { error: deleteError } = await deleteQuery.select("id");

    if (deleteError) {
      throw Errors.dbError("清理费用审批链失败", deleteError);
    }

    if (items.length === 0) {
      return;
    }

    const { error } = await SupabaseDB.getAdminClient()
      .from("expense_request_approval_chains")
      .insert(items)
      .select("id");

    if (error) {
      throw Errors.dbError("保存费用审批链失败", error);
    }
  }

  async listApprovalChain(expenseRequestId: string, tenantId?: string | null) {
    let query = SupabaseDB.getAdminClient()
      .from("expense_request_approval_chains")
      .select(`
        id,
        expense_request_id,
        step,
        step_name,
        sort_order,
        assignee_id,
        assignee_name_snapshot,
        required_permission,
        status,
        acted_by,
        acted_at,
        comment,
        created_at,
        updated_at,
        assignee:employees!expense_request_approval_chains_assignee_id_fkey(
          id,
          name,
          phone,
          avatar,
          status,
          department_id,
          tenant_department_id,
          tenant_department:tenant_departments!employees_tenant_department_id_fkey(id, alias_name, code, legacy_department_id),
          department:departments!employees_department_id_fkey(name),
          post:posts!employees_post_id_fkey(name)
        )
      `)
      .eq("expense_request_id", expenseRequestId);

    if (tenantId) {
      query = query.eq("tenant_id", tenantId);
    }

    const { data, error } = await query.order("sort_order", { ascending: true });

    if (error) {
      throw Errors.dbError("查询费用审批链失败", error);
    }

    return ((data || []) as unknown) as ExpenseApprovalChainRecord[];
  }

  async updateApprovalChainNode(
    id: string,
    payload: {
      status: string;
      acted_by?: string | null;
      acted_at?: string | null;
      comment?: string | null;
    },
    tenantId?: string | null,
  ) {
    let query = SupabaseDB.getAdminClient()
      .from("expense_request_approval_chains")
      .update({
        ...payload,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (tenantId) {
      query = query.eq("tenant_id", tenantId);
    }

    const { error } = await query.select("id");

    if (error) {
      throw Errors.dbError("更新费用审批链失败", error);
    }
  }

  async findEmployeeForApproval(id: string, tenantId?: string | null) {
    let query = SupabaseDB.getAdminClient()
      .from("employees")
      .select(`
        id,
        name,
        phone,
        avatar,
        status,
        department_id,
        tenant_department_id,
        post_id,
        tenant_department:tenant_departments!employees_tenant_department_id_fkey(id, alias_name, code, legacy_department_id),
        department:departments!employees_department_id_fkey(name),
        post:posts!employees_post_id_fkey(name)
      `)
      .eq("id", id);

    if (tenantId) {
      query = query.eq("tenant_id", tenantId);
    }

    const { data, error } = await query.maybeSingle();

    if (error) {
      throw Errors.dbError("查询审批人失败", error);
    }

    return (data as unknown) as ExpenseApprovalCandidateEmployee | null;
  }

  async listEmployeesForApprovalCandidates(input: {
    keyword?: string;
    tenantId?: string | null;
  }) {
    let query = SupabaseDB.getAdminClient()
      .from("employees")
      .select(`
        id,
        name,
        phone,
        avatar,
        status,
        department_id,
        tenant_department_id,
        post_id,
        tenant_department:tenant_departments!employees_tenant_department_id_fkey(id, alias_name, code, legacy_department_id),
        department:departments!employees_department_id_fkey(name),
        post:posts!employees_post_id_fkey(name)
      `)
      .eq("status", "active")
      .order("created_at", { ascending: false });

    if (input.tenantId) {
      query = query.eq("tenant_id", input.tenantId);
    }

    const keyword = input.keyword?.trim();
    if (keyword) {
      query = query.or(`name.ilike.%${keyword}%,phone.ilike.%${keyword}%`);
    }

    const { data, error } = await query;

    if (error) {
      throw Errors.dbError("查询审批候选人失败", error);
    }

    return ((data || []) as unknown) as ExpenseApprovalCandidateEmployee[];
  }

  async listEmployeePermissionContexts(employeeIds: string[], permissionCode: string) {
    if (employeeIds.length === 0) {
      return [] as Array<{
        employee_id: string;
        role_scope: string | null;
        override_effect: string | null;
        override_scope: string | null;
      }>;
    }

    const [roleResult, overrideResult] = await Promise.all([
      SupabaseDB.getAdminClient()
        .from("employee_roles")
        .select(`
          employee_id,
          role:roles!employee_roles_role_id_fkey(
            status,
            role_permissions(
              access_scope,
              permission:permissions!role_permissions_permission_id_fkey(code, status)
            )
          )
        `)
        .in("employee_id", employeeIds),
      SupabaseDB.getAdminClient()
        .from("employee_permission_overrides")
        .select(`
          employee_id,
          effect,
          access_scope,
          permission:permissions!employee_permission_overrides_permission_id_fkey(code, status)
        `)
        .in("employee_id", employeeIds),
    ]);

    if (roleResult.error) {
      throw Errors.dbError("查询审批候选人权限失败", roleResult.error);
    }

    if (overrideResult.error) {
      throw Errors.dbError("查询审批候选人权限失败", overrideResult.error);
    }

    const rows: Array<{
      employee_id: string;
      role_scope: string | null;
      override_effect: string | null;
      override_scope: string | null;
    }> = [];

    for (const item of (roleResult.data || []) as Array<any>) {
      const role = Array.isArray(item.role) ? item.role[0] : item.role;
      if (!role || role.status !== "active") {
        continue;
      }

      const rolePermissions = Array.isArray(role.role_permissions)
        ? role.role_permissions
        : [];
      for (const rolePermission of rolePermissions) {
        const permission = Array.isArray(rolePermission.permission)
          ? rolePermission.permission[0]
          : rolePermission.permission;
        if (
          permission?.code === permissionCode &&
          permission?.status === "active"
        ) {
          rows.push({
            employee_id: item.employee_id,
            role_scope: rolePermission.access_scope ?? "self",
            override_effect: null,
            override_scope: null,
          });
        }
      }
    }

    for (const item of (overrideResult.data || []) as Array<any>) {
      const permission = Array.isArray(item.permission)
        ? item.permission[0]
        : item.permission;
      if (
        permission?.code === permissionCode &&
        permission?.status === "active"
      ) {
        rows.push({
          employee_id: item.employee_id,
          role_scope: null,
          override_effect: item.effect,
          override_scope: item.access_scope ?? null,
        });
      }
    }

    return rows;
  }

  async createSettlement(payload: ExpenseRequestSettlementPayload) {
    const { error } = await SupabaseDB.getAdminClient()
      .from("expense_request_settlements")
      .insert({
        tenant_id: payload.tenant_id ?? null,
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

  async hasSettlement(expenseRequestId: string, tenantId?: string | null) {
    let query = SupabaseDB.getAdminClient()
      .from("expense_request_settlements")
      .select("id")
      .eq("expense_request_id", expenseRequestId);

    if (tenantId) {
      query = query.eq("tenant_id", tenantId);
    }

    const { data, error } = await query.maybeSingle();

    if (error) {
      throw Errors.dbError("查询费用打款记录失败", error);
    }

    return !!data?.id;
  }

  async list(
    params: ExpenseRequestListQueryType,
    visibility?: ExpenseRequestVisibilityFilter,
    tenantId?: string | null,
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
      created_from,
      created_to,
    } = params;
    let query = SupabaseDB.getAdminClient()
      .from("expense_requests")
      .select(this.summarySelect, { count: "exact" })
      .order("created_at", { ascending: false });

    if (tenantId) {
      query = query.eq("tenant_id", tenantId);
    }

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

    if (created_from) {
      query = query.gte("created_at", created_from);
    }

    if (created_to) {
      query = query.lte("created_at", created_to);
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

  async listStatsRows(
    params: Omit<ExpenseRequestListQueryType, "page" | "pageSize">,
    tenantId?: string | null,
  ) {
    const {
      employee_id,
      assignee_id,
      project_id,
      status,
      mode,
      current_step,
      keyword,
      created_from,
      created_to,
    } = params;
    let query = SupabaseDB.getAdminClient()
      .from("expense_requests")
      .select(`
        id,
        tenant_id,
        employee_id,
        assignee_id,
        project_id,
        mode,
        status,
        current_step,
        total_amount,
        created_at
      `);

    if (tenantId) {
      query = query.eq("tenant_id", tenantId);
    }

    if (employee_id) query = query.eq("employee_id", employee_id);
    if (assignee_id) query = query.eq("assignee_id", assignee_id);
    if (project_id) query = query.eq("project_id", project_id);
    if (status) query = query.eq("status", status);
    if (mode) query = query.eq("mode", mode);
    if (current_step) query = query.eq("current_step", current_step);
    if (created_from) query = query.gte("created_at", created_from);
    if (created_to) query = query.lte("created_at", created_to);
    if (keyword) {
      query = query.or(`request_no.ilike.%${keyword}%,title.ilike.%${keyword}%`);
    }

    const { data, error } = await query;

    if (error) {
      throw Errors.dbError("查询费用申请统计失败", error);
    }

    return (data || []) as Array<{
      id: string;
      tenant_id: string | null;
      employee_id: string;
      assignee_id: string | null;
      project_id: string | null;
      mode: string;
      status: string;
      current_step: string;
      total_amount: number | string | null;
      created_at: string | null;
    }>;
  }
}

export const expenseRequestRepository = new ExpenseRequestRepository();
