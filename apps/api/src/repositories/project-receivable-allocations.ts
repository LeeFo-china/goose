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
}

export const projectReceivableAllocationRepository =
  new ProjectReceivableAllocationRepository();
