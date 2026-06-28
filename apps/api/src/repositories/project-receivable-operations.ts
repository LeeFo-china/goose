import { Errors } from "@/errors/error-factory";
import type {
  ProjectReceivablePaymentType,
  ProjectReceivableStatus,
} from "@/schema/finance-receivables";
import { SupabaseDB } from "@/utils/supabase/index";

const PLAN_SELECT = `
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
  updated_at
`;

type PlanRow = {
  id: string;
  tenant_id: string;
  project_id: string;
  workflow_instance_id: string | null;
  workflow_node_key: string | null;
  source_type: string;
  source_id: string | null;
  payment_type: ProjectReceivablePaymentType;
  title: string;
  amount: number | string | null;
  due_date: string;
  paid_amount: number | string | null;
  status: ProjectReceivableStatus | null;
  owner_employee_id: string | null;
  latest_follow_up_at: string | null;
  latest_follow_up_note: string | null;
  next_follow_up_at: string | null;
  canceled_at: string | null;
  canceled_by: string | null;
  canceled_reason: string | null;
  created_at: string | null;
  updated_at: string | null;
};

export type ProjectReceivableOperationRecord = Omit<
  PlanRow,
  "amount" | "paid_amount" | "status"
> & {
  amount: number;
  paid_amount: number;
  status: ProjectReceivableStatus;
};

class ProjectReceivableOperationsRepository {
  async findById(input: {
    tenantId: string;
    planId: string;
  }): Promise<ProjectReceivableOperationRecord | null> {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("project_receivable_plans")
      .select(PLAN_SELECT)
      .eq("tenant_id", input.tenantId)
      .eq("id", input.planId)
      .maybeSingle();

    if (error) throw Errors.dbError("查询应收计划失败", error);
    return data ? normalizePlan(data as unknown as PlanRow) : null;
  }

  async findEmployeeTenant(employeeId: string) {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("employees")
      .select("id, tenant_id")
      .eq("id", employeeId)
      .maybeSingle();

    if (error) throw Errors.dbError("查询应收负责人失败", error);
    return data as { id: string; tenant_id: string | null } | null;
  }

  async createManualPlan(input: {
    tenant_id: string;
    project_id: string;
    payment_type: ProjectReceivablePaymentType;
    title: string;
    amount: number;
    due_date: string;
    owner_employee_id?: string | null;
    created_by?: string | null;
    remark?: string | null;
  }): Promise<ProjectReceivableOperationRecord> {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("project_receivable_plans")
      .insert({
        tenant_id: input.tenant_id,
        project_id: input.project_id,
        source_type: "manual",
        payment_type: input.payment_type,
        title: input.title,
        amount: input.amount,
        due_date: input.due_date,
        owner_employee_id: input.owner_employee_id ?? null,
        created_by: input.created_by ?? null,
        metadata: input.remark ? { remark: input.remark } : {},
      })
      .select(PLAN_SELECT)
      .single();

    if (error) throw Errors.dbError("创建应收计划失败", error);
    return normalizePlan(data as unknown as PlanRow);
  }

  async updatePlan(input: {
    tenantId: string;
    planId: string;
    values: Record<string, unknown>;
  }): Promise<ProjectReceivableOperationRecord> {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("project_receivable_plans")
      .update(input.values)
      .eq("tenant_id", input.tenantId)
      .eq("id", input.planId)
      .select(PLAN_SELECT)
      .single();

    if (error) throw Errors.dbError("更新应收计划失败", error);
    return normalizePlan(data as unknown as PlanRow);
  }

  async cancelPlan(input: {
    tenantId: string;
    planId: string;
    canceledBy: string | null;
    reason: string;
  }): Promise<ProjectReceivableOperationRecord> {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("project_receivable_plans")
      .update({
        status: "canceled",
        canceled_at: new Date().toISOString(),
        canceled_by: input.canceledBy,
        canceled_reason: input.reason,
      })
      .eq("tenant_id", input.tenantId)
      .eq("id", input.planId)
      .select(PLAN_SELECT)
      .single();

    if (error) throw Errors.dbError("取消应收计划失败", error);
    return normalizePlan(data as unknown as PlanRow);
  }
}

function normalizePlan(row: PlanRow): ProjectReceivableOperationRecord {
  return {
    ...row,
    amount: normalizeMoney(row.amount),
    paid_amount: normalizeMoney(row.paid_amount),
    status: row.status ?? "pending",
  };
}

function normalizeMoney(value: unknown) {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount) ? amount : 0;
}

export const projectReceivableOperationsRepository =
  new ProjectReceivableOperationsRepository();
