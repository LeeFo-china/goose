import { Errors, SupabaseDB } from "./shared";
import type {
  ExpenseRequestListQueryType,
  ExpenseRequestRecord,
  ExpenseRequestVisibilityFilter,
} from "./shared";

export async function list(this: any, 
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

export async function listStatsRows(this: any, 
  params: Omit<ExpenseRequestListQueryType, "page" | "pageSize">,
  tenantId?: string | null,
) {
  const {
    employee_id,
    assignee_id,
    project_id,
    status,
    mode,
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
    total_amount: number | string | null;
    created_at: string | null;
  }>;
}
