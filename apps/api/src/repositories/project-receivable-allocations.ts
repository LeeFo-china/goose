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
    created_at,
    updated_at
  `;

  async createIdempotent(input: ProjectReceivableAllocationInput) {
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

    return data;
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
}

export const projectReceivableAllocationRepository =
  new ProjectReceivableAllocationRepository();
