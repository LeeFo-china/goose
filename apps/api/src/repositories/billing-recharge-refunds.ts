import { Errors } from "@/errors/error-factory";
import type { TenantCreditOrderRecord } from "@/repositories/billing-recharge";
import { SupabaseDB } from "@/utils/supabase/index";

export type TenantCreditRefundRequestStatus =
  | "pending_review"
  | "approved"
  | "rejected"
  | "refunding"
  | "refunded"
  | "failed";

export type TenantCreditRefundRequestRecord = {
  id: string;
  tenant_id: string;
  order_id: string;
  request_no: string;
  idempotency_key: string;
  status: TenantCreditRefundRequestStatus;
  reason: string;
  requested_amount_fen: number;
  requested_credits: number;
  requested_by_employee_id: string | null;
  reviewed_by_employee_id: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  out_refund_no: string | null;
  wechat_refund_id: string | null;
  refund_amount_fen: number | null;
  refunded_at: string | null;
  failure_message: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type TenantCreditRefundRequestCreateInput = {
  tenant_id: string;
  order_id: string;
  request_no: string;
  idempotency_key: string;
  status: "pending_review";
  reason: string;
  requested_amount_fen: number;
  requested_credits: number;
  requested_by_employee_id: string | null;
  metadata: Record<string, unknown>;
};

type UntypedTable = {
  select: (...args: unknown[]) => UntypedTable;
  insert: (...args: unknown[]) => UntypedTable;
  update: (...args: unknown[]) => UntypedTable;
  eq: (...args: unknown[]) => UntypedTable;
  in: (...args: unknown[]) => UntypedTable;
  order: (...args: unknown[]) => UntypedTable;
  limit: (...args: unknown[]) => UntypedTable;
  maybeSingle: () => Promise<{ data: unknown; error: unknown }>;
  single: () => Promise<{ data: unknown; error: unknown }>;
};

type UntypedClient = {
  from: (
    table: "tenant_credit_refund_requests" | "tenant_credit_orders",
  ) => UntypedTable;
};

class BillingRechargeRefundRepository {
  private from(table: Parameters<UntypedClient["from"]>[0]) {
    return (SupabaseDB.getAdminClient() as unknown as UntypedClient).from(table);
  }

  async findByIdempotencyKey(input: {
    tenantId: string;
    idempotencyKey: string;
  }) {
    const { data, error } = await this.from("tenant_credit_refund_requests")
      .select("*")
      .eq("tenant_id", input.tenantId)
      .eq("idempotency_key", input.idempotencyKey)
      .maybeSingle();

    if (error) {
      throw Errors.dbError("查询积分充值退款申请失败", error);
    }

    return (data as TenantCreditRefundRequestRecord | null) ?? null;
  }

  async findActiveByOrderId(input: { tenantId: string; orderId: string }) {
    const { data, error } = await this.from("tenant_credit_refund_requests")
      .select("*")
      .eq("tenant_id", input.tenantId)
      .eq("order_id", input.orderId)
      .in("status", ["pending_review", "approved", "refunding"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      throw Errors.dbError("查询积分充值退款申请失败", error);
    }

    return (data as TenantCreditRefundRequestRecord | null) ?? null;
  }

  async create(input: TenantCreditRefundRequestCreateInput) {
    const { data, error } = await this.from("tenant_credit_refund_requests")
      .insert(input)
      .select("*")
      .single();

    if (error) {
      throw Errors.dbError("创建积分充值退款申请失败", error);
    }

    return data as TenantCreditRefundRequestRecord;
  }

  async markOrderRefundRequested(input: {
    tenantId: string;
    orderId: string;
    refundStatus: "pending_review";
    refundRequestedAt: string;
  }): Promise<TenantCreditOrderRecord> {
    const { data, error } = await this.from("tenant_credit_orders")
      .update({
        refund_status: input.refundStatus,
        refund_requested_at: input.refundRequestedAt,
      })
      .eq("tenant_id", input.tenantId)
      .eq("id", input.orderId)
      .select("*")
      .single();

    if (error) {
      throw Errors.dbError("更新积分充值订单退款状态失败", error);
    }

    return data as TenantCreditOrderRecord;
  }
}

export const billingRechargeRefundRepository =
  new BillingRechargeRefundRepository();
