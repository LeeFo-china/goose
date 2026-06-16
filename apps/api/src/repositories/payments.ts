import { Errors } from "@/errors/error-factory";
import type {
  CreatePaymentInput,
  PaymentListQuery,
  UpdatePaymentInput,
} from "@/schema/payment";
import { SupabaseDB } from "@/utils/supabase/index";

export type PaymentRecord = {
  id: string;
  project_id: string | null;
  amount: number | null;
  type: string | null;
  status: string | null;
  evidence_images?: unknown;
  handled_by?: string | null;
  pay_date?: string | null;
  workflow_task_id?: string | null;
  source_type?: string | null;
  source_id?: string | null;
  remark?: string | null;
  payment_channel?: string | null;
  provider?: string | null;
  provider_transaction_id?: string | null;
  out_trade_no?: string | null;
  created_at: string | null;
  project?: unknown;
  handler?: unknown;
};

export type ConfirmedPaymentSummary = {
  count: number;
  totalAmount: number;
};

class PaymentRepository {
  private paymentSelect = `
    *,
    project:projects(id, tenant_id, name, status, customer_id),
    handler:employees!payments_handled_by_fkey(id, name, phone)
  `;

  async listProjectIdsByTenant(tenantId: string) {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("projects")
      .select("id")
      .eq("tenant_id", tenantId);

    if (error) {
      throw Errors.dbError("查询租户项目失败", error);
    }

    return ((data || []) as Array<{ id: string }>).map((item) => item.id);
  }

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

    const signedAmount = Number(
      (data as { signed_amount: number | null } | null)?.signed_amount ?? 0,
    );
    return Number.isFinite(signedAmount) && signedAmount > 0
      ? signedAmount
      : null;
  }

  async findById(id: string): Promise<PaymentRecord | null> {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("payments")
      .select(this.paymentSelect)
      .eq("id", id)
      .maybeSingle();

    if (error) {
      throw Errors.dbError("查询收款记录失败", error);
    }

    return (data as unknown as PaymentRecord | null) ?? null;
  }

  async findByWorkflowTaskId(workflowTaskId: string): Promise<PaymentRecord | null> {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("payments")
      .select(this.paymentSelect)
      .eq("workflow_task_id", workflowTaskId)
      .maybeSingle();

    if (error) {
      throw Errors.dbError("查询流程收款记录失败", error);
    }

    return (data as unknown as PaymentRecord | null) ?? null;
  }

  async list(params: PaymentListQuery, projectIds: string[]) {
    const { page, pageSize, project_id, status, type } = params;
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    if (projectIds.length === 0) {
      return {
        list: [],
        pagination: {
          page,
          pageSize,
          total: 0,
          totalPages: 0,
        },
      };
    }

    let query = SupabaseDB.getAdminClient()
      .from("payments")
      .select(this.paymentSelect, { count: "exact" })
      .in("project_id", projectIds)
      .order("created_at", { ascending: false });

    if (project_id) {
      query = query.eq("project_id", project_id);
    }

    if (status) {
      query = query.eq("status", status);
    }

    if (type) {
      query = query.eq("type", type);
    }

    const { data, error, count } = await query.range(from, to);

    if (error) {
      throw Errors.dbError("查询收款记录列表失败", error);
    }

    return {
      list: (data as unknown as PaymentRecord[] | null) || [],
      pagination: {
        page,
        pageSize,
        total: count || 0,
        totalPages: count ? Math.ceil(count / pageSize) : 0,
      },
    };
  }

  async summarizeConfirmedProjectPayments(input: {
    projectId: string;
    type: string;
  }): Promise<ConfirmedPaymentSummary> {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("payments")
      .select("amount")
      .eq("project_id", input.projectId)
      .eq("type", input.type)
      .eq("status", "confirmed");

    if (error) {
      throw Errors.dbError("查询项目已入账收款失败", error);
    }

    const rows = (data || []) as Array<{ amount: number | null }>;
    return {
      count: rows.length,
      totalAmount: rows.reduce((sum, row) => sum + Number(row.amount || 0), 0),
    };
  }

  async create(input: CreatePaymentInput): Promise<PaymentRecord> {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("payments")
      .insert(input)
      .select(this.paymentSelect)
      .single();

    if (error) {
      throw Errors.dbError("创建收款记录失败", error);
    }

    return data as unknown as PaymentRecord;
  }

  async update(id: string, input: UpdatePaymentInput): Promise<PaymentRecord> {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("payments")
      .update(input)
      .eq("id", id)
      .select(this.paymentSelect)
      .maybeSingle();

    if (error) {
      throw Errors.dbError("更新收款记录失败", error);
    }

    if (!data) {
      throw Errors.badRequest("收款记录不存在或更新失败");
    }

    return data as unknown as PaymentRecord;
  }
}

export const paymentRepository = new PaymentRepository();
