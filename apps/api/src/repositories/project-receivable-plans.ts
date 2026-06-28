import { Errors } from "@/errors/error-factory";
import type {
  FinanceReceivableListQuery,
  ProjectReceivableStatus,
} from "@/schema/finance-receivables";
import { SupabaseDB } from "@/utils/supabase/index";

const UNPAID_RECEIVABLE_STATUSES = ["pending", "partially_paid", "overdue"];
const RECEIVABLE_PLAN_RECORD_SELECT = "id, tenant_id, project_id, workflow_instance_id, workflow_node_key, source_type, source_id, payment_type, title, amount, due_date, paid_amount, status, owner_employee_id, latest_follow_up_at, latest_follow_up_note, next_follow_up_at, canceled_at, canceled_by, canceled_reason";

type ProjectReceivablePlanRow = {
  id: string;
  tenant_id: string;
  project_id: string;
  workflow_instance_id: string | null;
  workflow_node_key: string | null;
  source_type: string;
  source_id: string | null;
  payment_type: string;
  title: string;
  amount: number | string | null;
  due_date: string;
  paid_amount: number | string | null;
  status: string | null;
  owner_employee_id: string | null;
  latest_follow_up_at: string | null;
  latest_follow_up_note: string | null;
  next_follow_up_at: string | null;
  canceled_at: string | null;
  canceled_by: string | null;
  canceled_reason: string | null;
  created_at: string | null;
  updated_at: string | null;
  project?: {
    id: string;
    name: string | null;
    status: string | null;
  } | null;
  owner?: EmployeeRelation | null;
  canceled_by_employee?: EmployeeRelation | null;
};

type EmployeeRelation = {
  id: string;
  name: string | null;
  phone: string | null;
};

export type ProjectReceivablePlanListItem = {
  id: string;
  tenant_id: string;
  project_id: string;
  workflow_instance_id: string | null;
  workflow_node_key: string | null;
  source_type: string;
  source_id: string | null;
  payment_type: string;
  title: string;
  amount: number;
  paid_amount: number;
  remaining_amount: number;
  due_date: string;
  status: ProjectReceivableStatus;
  overdue_days: number;
  owner_employee_id: string | null;
  owner_employee_name: string | null;
  latest_follow_up_at: string | null;
  latest_follow_up_note: string | null;
  next_follow_up_at: string | null;
  canceled_at: string | null;
  canceled_by: string | null;
  canceled_by_name: string | null;
  canceled_reason: string | null;
  created_at: string | null;
  updated_at: string | null;
  project?: {
    id: string;
    name: string | null;
    status: string | null;
  } | null;
};

export type ProjectReceivableSummary = {
  contract_amount: number;
  receivable_amount: number;
  paid_amount: number;
  remaining_amount: number;
  overdue_amount: number;
  overdue_count: number;
};

export type ProjectReceivablePlanRecord = {
  id: string;
  tenant_id: string;
  project_id: string;
  workflow_instance_id: string | null;
  workflow_node_key: string | null;
  source_type: string;
  source_id: string | null;
  payment_type: string;
  title: string;
  amount: number;
  due_date: string;
  paid_amount: number;
  status: ProjectReceivableStatus;
};

type ProjectReceivableListInput = {
  tenantId: string;
  query: FinanceReceivableListQuery;
  tenantToday: string;
};

type ProjectReceivableSummaryRpcRow = {
  contract_amount: number | string | null;
  receivable_amount: number | string | null;
  paid_amount: number | string | null;
  remaining_amount: number | string | null;
  overdue_amount: number | string | null;
  overdue_count: number | string | null;
};

class ProjectReceivablePlanRepository {
  private select = `
    id,
    tenant_id,
    project_id,
    workflow_instance_id,
    workflow_node_key,
    source_type,
    source_id,
    payment_type,
    title,
    amount,
    due_date,
    paid_amount,
    status,
    owner_employee_id,
    latest_follow_up_at,
    latest_follow_up_note,
    next_follow_up_at,
    canceled_at,
    canceled_by,
    canceled_reason,
    created_at,
    updated_at,
    project:projects(id, name, status),
    owner:employees!project_receivable_plans_owner_employee_id_fkey(id, name, phone),
    canceled_by_employee:employees!project_receivable_plans_canceled_by_fkey(id, name, phone)
  `;

  async findProjectTenant(projectId: string) {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("projects")
      .select("id, tenant_id")
      .eq("id", projectId)
      .maybeSingle();

    if (error) {
      throw Errors.dbError("查询项目归属失败", error);
    }

    return data as { id: string; tenant_id: string | null } | null;
  }

  async findProjectSignedAmount(projectId: string): Promise<number | null> {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("projects")
      .select("signed_amount")
      .eq("id", projectId)
      .maybeSingle();

    if (error) {
      throw Errors.dbError("查询项目签约金额失败", error);
    }

    const signedAmount = normalizeMoney(
      (data as { signed_amount: number | string | null } | null)?.signed_amount,
    );
    return signedAmount > 0 ? signedAmount : null;
  }

  async findByWorkflowNodeSource(input: {
    tenantId: string;
    sourceId: string;
    paymentType: string;
  }): Promise<ProjectReceivablePlanRecord | null> {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("project_receivable_plans")
      .select(RECEIVABLE_PLAN_RECORD_SELECT)
      .eq("tenant_id", input.tenantId)
      .eq("source_type", "workflow_node")
      .eq("source_id", input.sourceId)
      .eq("payment_type", input.paymentType)
      .maybeSingle();

    if (error) {
      throw Errors.dbError("查询应收计划失败", error);
    }

    return data
      ? normalizeReceivablePlanRecord(data as unknown as ProjectReceivablePlanRow)
      : null;
  }

  async createWorkflowNodePlan(input: {
    tenant_id: string;
    project_id: string;
    workflow_instance_id: string;
    workflow_node_key: string;
    source_id: string;
    payment_type: string;
    title: string;
    amount: number;
    due_date: string;
    metadata?: Record<string, unknown>;
  }): Promise<ProjectReceivablePlanRecord> {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("project_receivable_plans")
      .upsert({
        tenant_id: input.tenant_id,
        project_id: input.project_id,
        workflow_instance_id: input.workflow_instance_id,
        workflow_node_key: input.workflow_node_key,
        source_type: "workflow_node",
        source_id: input.source_id,
        payment_type: input.payment_type,
        title: input.title,
        amount: input.amount,
        due_date: input.due_date,
        metadata: input.metadata ?? {},
      }, {
        onConflict: "tenant_id,source_type,source_id,payment_type",
        ignoreDuplicates: false,
      })
      .select(RECEIVABLE_PLAN_RECORD_SELECT)
      .single();

    if (error) {
      throw Errors.dbError("创建应收计划失败", error);
    }

    return normalizeReceivablePlanRecord(
      data as unknown as ProjectReceivablePlanRow,
    );
  }

  async updatePaidAmount(input: {
    tenantId: string;
    planId: string;
    paidAmount: number;
    status: ProjectReceivableStatus;
  }): Promise<ProjectReceivablePlanRecord> {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("project_receivable_plans")
      .update({
        paid_amount: input.paidAmount,
        status: input.status,
      })
      .eq("tenant_id", input.tenantId)
      .eq("id", input.planId)
      .select(RECEIVABLE_PLAN_RECORD_SELECT)
      .single();

    if (error) {
      throw Errors.dbError("更新应收计划已收金额失败", error);
    }

    return normalizeReceivablePlanRecord(
      data as unknown as ProjectReceivablePlanRow,
    );
  }

  async list(input: ProjectReceivableListInput) {
    const page = input.query.page ?? 1;
    const pageSize = Math.min(input.query.pageSize ?? 20, 100);
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let request = SupabaseDB.getAdminClient()
      .from("project_receivable_plans")
      .select(this.select, { count: "exact" })
      .eq("tenant_id", input.tenantId)
      .order("due_date", { ascending: true })
      .order("created_at", { ascending: false });

    if (input.query.project_id) {
      request = request.eq("project_id", input.query.project_id);
    }
    if (input.query.payment_type) {
      request = request.eq("payment_type", input.query.payment_type);
    }
    if (input.query.source_type) {
      request = request.eq("source_type", input.query.source_type);
    }
    if (input.query.owner_employee_id) {
      request = request.eq("owner_employee_id", input.query.owner_employee_id);
    }
    if (input.query.due_date_from) {
      request = request.gte("due_date", input.query.due_date_from);
    }
    if (input.query.due_date_to) {
      request = request.lte("due_date", input.query.due_date_to);
    }
    if (input.query.status && input.query.status !== "overdue") {
      request = request.eq("status", input.query.status);
    }
    if (input.query.overdue_only || input.query.status === "overdue") {
      request = request
        .lt("due_date", input.tenantToday)
        .in("status", UNPAID_RECEIVABLE_STATUSES);
    }
    if (input.query.follow_up_due_only) {
      request = request
        .lte("next_follow_up_at", `${input.tenantToday}T23:59:59.999Z`)
        .in("status", UNPAID_RECEIVABLE_STATUSES);
    }

    const { data, error, count } = await request.range(from, to);
    if (error) {
      throw Errors.dbError("查询应收计划失败", error);
    }

    return {
      list: ((data as unknown as ProjectReceivablePlanRow[] | null) || [])
        .map((item) => normalizeReceivablePlanRow(item, input.tenantToday)),
      pagination: {
        page,
        pageSize,
        total: count || 0,
        totalPages: count ? Math.ceil(count / pageSize) : 0,
      },
    };
  }

  async summarizeProject(input: {
    tenantId: string;
    projectId: string;
    tenantToday: string;
  }): Promise<ProjectReceivableSummary> {
    const { data, error } = await SupabaseDB.getAdminClient()
      .rpc("get_project_receivable_summary", {
        p_tenant_id: input.tenantId,
        p_project_id: input.projectId,
        p_today: input.tenantToday,
      })
      .maybeSingle();

    if (error) {
      throw Errors.dbError("查询项目应收汇总失败", error);
    }

    return normalizeReceivableSummary(
      data as ProjectReceivableSummaryRpcRow | null,
    );
  }
}

function normalizeReceivablePlanRecord(
  row: ProjectReceivablePlanRow,
): ProjectReceivablePlanRecord {
  const amount = normalizeMoney(row.amount);
  const paidAmount = normalizeMoney(row.paid_amount);

  return {
    id: row.id,
    tenant_id: row.tenant_id,
    project_id: row.project_id,
    workflow_instance_id: row.workflow_instance_id,
    workflow_node_key: row.workflow_node_key,
    source_type: row.source_type,
    source_id: row.source_id,
    payment_type: row.payment_type,
    title: row.title,
    amount,
    due_date: row.due_date,
    paid_amount: paidAmount,
    status: deriveReceivableStatus({
      status: row.status,
      paidAmount,
      remainingAmount: Math.max(amount - paidAmount, 0),
      overdueDays: 0,
    }),
  };
}

function normalizeReceivablePlanRow(
  row: ProjectReceivablePlanRow,
  tenantToday: string,
): ProjectReceivablePlanListItem {
  const amount = normalizeMoney(row.amount);
  const paidAmount = normalizeMoney(row.paid_amount);
  const remainingAmount = Math.max(amount - paidAmount, 0);
  const overdueDays = getOverdueDays({
    dueDate: row.due_date,
    tenantToday,
    status: row.status,
    remainingAmount,
  });

  return {
    id: row.id,
    tenant_id: row.tenant_id,
    project_id: row.project_id,
    workflow_instance_id: row.workflow_instance_id,
    workflow_node_key: row.workflow_node_key,
    source_type: row.source_type,
    source_id: row.source_id,
    payment_type: row.payment_type,
    title: row.title,
    amount,
    paid_amount: paidAmount,
    remaining_amount: remainingAmount,
    due_date: row.due_date,
    status: deriveReceivableStatus({
      status: row.status,
      paidAmount,
      remainingAmount,
      overdueDays,
    }),
    overdue_days: overdueDays,
    owner_employee_id: row.owner_employee_id,
    owner_employee_name: row.owner?.name ?? null,
    latest_follow_up_at: row.latest_follow_up_at,
    latest_follow_up_note: row.latest_follow_up_note,
    next_follow_up_at: row.next_follow_up_at,
    canceled_at: row.canceled_at,
    canceled_by: row.canceled_by,
    canceled_by_name: row.canceled_by_employee?.name ?? null,
    canceled_reason: row.canceled_reason,
    created_at: row.created_at,
    updated_at: row.updated_at,
    project: row.project ?? null,
  };
}

function normalizeReceivableSummary(
  row: ProjectReceivableSummaryRpcRow | null,
): ProjectReceivableSummary {
  return {
    contract_amount: normalizeMoney(row?.contract_amount),
    receivable_amount: normalizeMoney(row?.receivable_amount),
    paid_amount: normalizeMoney(row?.paid_amount),
    remaining_amount: normalizeMoney(row?.remaining_amount),
    overdue_amount: normalizeMoney(row?.overdue_amount),
    overdue_count: normalizeInteger(row?.overdue_count),
  };
}

function deriveReceivableStatus(input: {
  status: string | null;
  paidAmount: number;
  remainingAmount: number;
  overdueDays: number;
}): ProjectReceivableStatus {
  if (input.status === "canceled") return "canceled";
  if (input.remainingAmount <= 0) return "paid";
  if (input.overdueDays > 0) return "overdue";
  if (input.paidAmount > 0) return "partially_paid";
  if (input.status === "partially_paid") return "partially_paid";
  return "pending";
}

function getOverdueDays(input: {
  dueDate: string | null;
  tenantToday: string;
  status: string | null;
  remainingAmount: number;
}) {
  if (
    !input.dueDate ||
    input.remainingAmount <= 0 ||
    input.status === "paid" ||
    input.status === "canceled" ||
    input.dueDate >= input.tenantToday
  ) {
    return 0;
  }

  const due = Date.parse(`${input.dueDate}T00:00:00.000Z`);
  const today = Date.parse(`${input.tenantToday}T00:00:00.000Z`);
  if (!Number.isFinite(due) || !Number.isFinite(today) || today <= due) {
    return 0;
  }

  return Math.floor((today - due) / 86_400_000);
}

function normalizeMoney(value: unknown) {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount) ? amount : 0;
}

function normalizeInteger(value: unknown) {
  const count = Number(value ?? 0);
  return Number.isFinite(count) ? Math.trunc(count) : 0;
}

export const projectReceivablePlanRepository = new ProjectReceivablePlanRepository();
