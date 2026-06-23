import { Errors } from "@/errors/error-factory";
import type {
  FinanceReceivableListQuery,
  ProjectReceivableStatus,
} from "@/schema/finance-receivables";
import { SupabaseDB } from "@/utils/supabase/index";

const UNPAID_RECEIVABLE_STATUSES = ["pending", "partially_paid", "overdue"];

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
  created_at: string | null;
  updated_at: string | null;
  project?: {
    id: string;
    name: string | null;
    status: string | null;
  } | null;
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
    created_at,
    updated_at,
    project:projects(id, name, status)
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

export const projectReceivablePlanRepository =
  new ProjectReceivablePlanRepository();
