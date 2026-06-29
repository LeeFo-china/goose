import { Errors } from "@/errors/error-factory";
import { SupabaseDB } from "@/utils/supabase/index";

export type ProjectReceivableAllocationInput = {
  tenant_id: string;
  project_id: string;
  receivable_plan_id: string;
  payment_id: string;
  amount: number;
  allocated_by?: string | null;
  allocated_at?: string;
  source_type: "workflow_task" | "manual" | "wechat_pay_callback";
  source_id?: string | null;
  metadata?: Record<string, unknown>;
};

export type ProjectReceivableAllocationRecord = {
  id: string;
  tenant_id: string;
  project_id: string;
  receivable_plan_id: string;
  payment_id: string;
  amount: number;
  allocated_by: string | null;
  allocated_at: string | null;
  source_type: "workflow_task" | "manual" | "wechat_pay_callback";
  source_id: string | null;
  metadata: Record<string, unknown>;
  reversed_at?: string | null;
  reversed_by?: string | null;
  reverse_reason?: string | null;
  created_at: string;
  updated_at: string;
  allocated_by_name?: string | null;
  payment?: ProjectReceivableAllocationPayment | null;
};

export type ProjectReceivableAllocationPayment = {
  id: string;
  amount: number;
  type: string | null;
  status: string | null;
  pay_date: string | null;
  remark: string | null;
};

export type ProjectReceivablePaymentRecord = ProjectReceivableAllocationPayment & {
  project_id: string | null;
};

export type ProjectReceivablePaymentAllocationCandidate =
  ProjectReceivablePaymentRecord & {
    allocated_amount: number;
    remaining_amount: number;
  };

type AllocationRow = Omit<
  ProjectReceivableAllocationRecord,
  "amount" | "metadata" | "payment"
> & {
  amount: number | string | null;
  metadata: Record<string, unknown> | null;
  payment?: {
    id: string;
    amount: number | string | null;
    type: string | null;
    status: string | null;
    pay_date: string | null;
    remark: string | null;
  } | null;
  allocated_by_employee?: {
    id: string;
    name: string | null;
  } | null;
};

type PaymentRow = {
  id: string;
  project_id: string | null;
  amount: number | string | null;
  type: string | null;
  status: string | null;
  pay_date: string | null;
  remark: string | null;
};

type PaymentRelationRow = Omit<PaymentRow, "project_id"> & {
  project_id?: string | null;
};

class ProjectReceivableAllocationRepository {
  private select = `
    id,
    tenant_id,
    project_id,
    receivable_plan_id,
    payment_id,
    amount,
    allocated_by,
    allocated_at,
    source_type,
    source_id,
    metadata,
    reversed_at,
    reversed_by,
    reverse_reason,
    created_at,
    updated_at,
    payment:payments(id, amount, type, status, pay_date, remark),
    allocated_by_employee:employees!project_receivable_allocations_allocated_by_fkey(id, name)
  `;

  async createIdempotent(
    input: ProjectReceivableAllocationInput,
  ): Promise<ProjectReceivableAllocationRecord> {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("project_receivable_allocations")
      .upsert(input, {
        onConflict: "tenant_id,source_type,source_id,receivable_plan_id",
        ignoreDuplicates: false,
      })
      .select(this.select)
      .single();

    if (error) {
      throw Errors.dbError("写入应收核销记录失败", error);
    }

    return normalizeAllocation(data as unknown as AllocationRow);
  }

  async listActiveByReceivable(input: {
    tenantId: string;
    receivablePlanId: string;
  }): Promise<ProjectReceivableAllocationRecord[]> {
    // A single receivable should only have a small set of allocation rows.
    // Keep this bounded and revisit with an aggregate detail endpoint if needed.
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("project_receivable_allocations")
      .select(this.select)
      .eq("tenant_id", input.tenantId)
      .eq("receivable_plan_id", input.receivablePlanId)
      .is("reversed_at", null)
      .order("allocated_at", { ascending: false })
      .limit(100);

    if (error) {
      throw Errors.dbError("查询应收核销记录失败", error);
    }

    return ((data as unknown as AllocationRow[] | null) || [])
      .map(normalizeAllocation);
  }

  async listConfirmedProjectPayments(input: {
    tenantId: string;
    projectId: string;
    pageSize: number;
  }): Promise<ProjectReceivablePaymentAllocationCandidate[]> {
    const pageSize = Math.min(input.pageSize, 100);
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("payments")
      .select(`
        id,
        project_id,
        amount,
        type,
        status,
        pay_date,
        remark,
        project:projects!inner(id, tenant_id)
      `)
      .eq("project_id", input.projectId)
      .eq("project.tenant_id", input.tenantId)
      .eq("status", "confirmed")
      .order("pay_date", { ascending: false })
      .limit(pageSize);

    if (error) {
      throw Errors.dbError("查询可核销收款失败", error);
    }

    const payments = ((data as unknown as PaymentRow[] | null) || [])
      .map(normalizePayment);
    const allocatedByPayment = await this.sumActiveAllocatedAmountsByPayment({
      tenantId: input.tenantId,
      paymentIds: payments.map((payment) => payment.id),
    });

    return payments.map((payment) => {
      const allocatedAmount = allocatedByPayment.get(payment.id) ?? 0;
      return {
        ...payment,
        allocated_amount: allocatedAmount,
        remaining_amount: Math.max(payment.amount - allocatedAmount, 0),
      };
    });
  }

  async findPaymentById(input: {
    tenantId: string;
    paymentId: string;
  }): Promise<ProjectReceivablePaymentRecord | null> {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("payments")
      .select(`
        id,
        project_id,
        amount,
        type,
        status,
        pay_date,
        remark,
        project:projects!inner(id, tenant_id)
      `)
      .eq("id", input.paymentId)
      .eq("project.tenant_id", input.tenantId)
      .maybeSingle();

    if (error) {
      throw Errors.dbError("查询收款记录失败", error);
    }

    return data ? normalizePayment(data as unknown as PaymentRow) : null;
  }

  async sumAllocatedAmount(input: {
    tenantId: string;
    receivablePlanId: string;
  }): Promise<number> {
    // A single receivable plan is expected to have a small number of payment
    // allocations. If online payments introduce high-frequency partial
    // allocations later, replace this with an aggregate RPC.
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("project_receivable_allocations")
      .select("amount")
      .eq("tenant_id", input.tenantId)
      .eq("receivable_plan_id", input.receivablePlanId)
      .is("reversed_at", null)
      .limit(100);

    if (error) {
      throw Errors.dbError("统计应收核销金额失败", error);
    }

    return ((data as Array<{ amount: number | string | null }> | null) || [])
      .reduce((sum, item) => {
        const amount = Number(item.amount ?? 0);
        return Number.isFinite(amount) ? sum + amount : sum;
      }, 0);
  }

  async sumActiveAllocatedAmount(input: {
    tenantId: string;
    receivablePlanId: string;
  }): Promise<number> {
    return this.sumAllocatedAmount(input);
  }

  async sumActiveAllocatedAmountByPayment(input: {
    tenantId: string;
    paymentId: string;
  }): Promise<number> {
    const totals = await this.sumActiveAllocatedAmountsByPayment({
      tenantId: input.tenantId,
      paymentIds: [input.paymentId],
    });
    return totals.get(input.paymentId) ?? 0;
  }

  async findActiveById(input: {
    tenantId: string;
    allocationId: string;
  }): Promise<ProjectReceivableAllocationRecord | null> {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("project_receivable_allocations")
      .select(this.select)
      .eq("tenant_id", input.tenantId)
      .eq("id", input.allocationId)
      .is("reversed_at", null)
      .maybeSingle();

    if (error) {
      throw Errors.dbError("查询核销记录失败", error);
    }

    return data ? normalizeAllocation(data as unknown as AllocationRow) : null;
  }

  async updateManualAllocationAmount(input: {
    tenantId: string;
    allocationId: string;
    amount: number;
    metadata: Record<string, unknown>;
  }): Promise<ProjectReceivableAllocationRecord> {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("project_receivable_allocations")
      .update({
        amount: input.amount,
        metadata: input.metadata,
      })
      .eq("tenant_id", input.tenantId)
      .eq("id", input.allocationId)
      .eq("source_type", "manual")
      .is("reversed_at", null)
      .select(this.select)
      .single();

    if (error) {
      throw Errors.dbError("调整核销金额失败", error);
    }

    return normalizeAllocation(data as unknown as AllocationRow);
  }

  async reverseManualAllocation(input: {
    tenantId: string;
    allocationId: string;
    reversedBy: string | null;
    reason: string;
    metadata: Record<string, unknown>;
  }): Promise<ProjectReceivableAllocationRecord> {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("project_receivable_allocations")
      .update({
        reversed_at: new Date().toISOString(),
        reversed_by: input.reversedBy,
        reverse_reason: input.reason,
        metadata: input.metadata,
      })
      .eq("tenant_id", input.tenantId)
      .eq("id", input.allocationId)
      .eq("source_type", "manual")
      .is("reversed_at", null)
      .select(this.select)
      .single();

    if (error) {
      throw Errors.dbError("撤销核销记录失败", error);
    }

    return normalizeAllocation(data as unknown as AllocationRow);
  }

  private async sumActiveAllocatedAmountsByPayment(input: {
    tenantId: string;
    paymentIds: string[];
  }): Promise<Map<string, number>> {
    if (input.paymentIds.length === 0) return new Map();
    // The UI only requests up to 100 payment candidates. The allocation rows
    // per payment are bounded by finance operations; keep this defensive cap.
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("project_receivable_allocations")
      .select("payment_id, amount")
      .eq("tenant_id", input.tenantId)
      .in("payment_id", input.paymentIds)
      .is("reversed_at", null)
      .limit(5000);

    if (error) {
      throw Errors.dbError("统计收款核销金额失败", error);
    }

    const result = new Map<string, number>();
    for (const item of (data as Array<{
      payment_id: string | null;
      amount: number | string | null;
    }> | null) || []) {
      if (!item.payment_id) continue;
      result.set(
        item.payment_id,
        (result.get(item.payment_id) ?? 0) + normalizeMoney(item.amount),
      );
    }
    return result;
  }
}

function normalizeAllocation(row: AllocationRow): ProjectReceivableAllocationRecord {
  return {
    id: row.id,
    tenant_id: row.tenant_id,
    project_id: row.project_id,
    receivable_plan_id: row.receivable_plan_id,
    payment_id: row.payment_id,
    amount: normalizeMoney(row.amount),
    allocated_by: row.allocated_by,
    allocated_at: row.allocated_at,
    source_type: row.source_type,
    source_id: row.source_id,
    metadata: row.metadata ?? {},
    reversed_at: row.reversed_at,
    reversed_by: row.reversed_by,
    reverse_reason: row.reverse_reason,
    created_at: row.created_at,
    updated_at: row.updated_at,
    allocated_by_name: row.allocated_by_employee?.name ?? null,
    payment: row.payment ? normalizePayment(row.payment) : null,
  };
}

function normalizePayment(
  row: PaymentRow | PaymentRelationRow,
): ProjectReceivablePaymentRecord {
  return {
    id: row.id,
    project_id: "project_id" in row ? row.project_id ?? null : null,
    amount: normalizeMoney(row.amount),
    type: row.type,
    status: row.status,
    pay_date: row.pay_date,
    remark: row.remark,
  };
}

function normalizeMoney(value: unknown) {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount) ? Math.round(amount * 100) / 100 : 0;
}

export const projectReceivableAllocationRepository =
  new ProjectReceivableAllocationRepository();
