import { Errors } from "@/errors/error-factory";
import type { TenantCreditRefundRequestRecord } from "@/repositories/billing-recharge-refunds";
import type { TenantCreditOrderRecord } from "@/repositories/billing-recharge";
import { SupabaseDB } from "@/utils/supabase/index";

export type BillingWechatRefundRequestMatch = {
  request: TenantCreditRefundRequestRecord;
  order: TenantCreditOrderRecord;
};

export type BillingConfirmWechatRechargeRefundInput = {
  refundRequestId: string;
  outRefundNo: string;
  wechatRefundId: string | null;
  refundAmountFen: number;
  refundedAt: string | null;
  notificationId: string;
  metadata: Record<string, unknown>;
};

export type BillingConfirmWechatRechargeRefundResult = {
  request: Record<string, unknown> | null;
  order: Record<string, unknown> | null;
  account: Record<string, unknown> | null;
  ledger: Record<string, unknown> | null;
  idempotent: boolean;
};

export type BillingMarkWechatRechargeRefundFailedInput = {
  refundRequestId: string;
  tenantId: string;
  orderId: string;
  failureMessage: string;
  metadata: Record<string, unknown>;
};

export type BillingMarkWechatRechargeRefundFailedResult = {
  request: TenantCreditRefundRequestRecord;
  order: TenantCreditOrderRecord;
};

type UntypedTable = {
  select: (...args: unknown[]) => UntypedTable;
  update: (...args: unknown[]) => UntypedTable;
  eq: (...args: unknown[]) => UntypedTable;
  in: (...args: unknown[]) => UntypedTable;
  limit: (...args: unknown[]) => UntypedTable;
  maybeSingle: () => Promise<{ data: unknown; error: unknown }>;
  single: () => Promise<{ data: unknown; error: unknown }>;
  then: Promise<{ data: unknown; error: unknown }>["then"];
};

type UntypedClient = {
  from: (
    table: "tenant_credit_refund_requests" | "tenant_credit_orders",
  ) => UntypedTable;
  rpc: (
    functionName: "billing_confirm_wechat_recharge_refund",
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: unknown }>;
};

class BillingRechargeRefundCallbackRepository {
  private from(table: Parameters<UntypedClient["from"]>[0]) {
    return (SupabaseDB.getAdminClient() as unknown as UntypedClient).from(table);
  }

  async findWechatRefundRequestByOutRefundNo(outRefundNo: string) {
    const { data, error } = await this.from("tenant_credit_refund_requests")
      .select("*")
      .eq("out_refund_no", outRefundNo)
      .limit(2);

    if (error) throw Errors.dbError("查询积分充值微信退款申请失败", error);
    const rows = (data ?? []) as TenantCreditRefundRequestRecord[];
    if (rows.length > 1) {
      throw Errors.business(
        409,
        "积分充值微信退款单号匹配到多个申请",
        "BILLING_RECHARGE_REFUND_OUT_REFUND_NO_DUPLICATED",
      );
    }

    const request = rows[0];
    if (!request) return null;
    const order = await this.findOrderById({
      tenantId: request.tenant_id,
      orderId: request.order_id,
    });
    if (!order) {
      throw Errors.business(
        404,
        "积分充值退款申请关联订单不存在",
        "BILLING_RECHARGE_ORDER_NOT_FOUND",
      );
    }
    return { request, order } satisfies BillingWechatRefundRequestMatch;
  }

  async confirmWechatRechargeRefund(
    input: BillingConfirmWechatRechargeRefundInput,
  ) {
    const { data, error } = await (
      SupabaseDB.getAdminClient() as unknown as UntypedClient
    ).rpc("billing_confirm_wechat_recharge_refund", {
      p_refund_request_id: input.refundRequestId,
      p_out_refund_no: input.outRefundNo,
      p_wechat_refund_id: input.wechatRefundId,
      p_refund_amount_fen: input.refundAmountFen,
      p_refunded_at: input.refundedAt,
      p_notification_id: input.notificationId,
      p_metadata: input.metadata,
    });

    if (error) throw Errors.dbError("确认积分充值微信退款反冲失败", error);
    return data as BillingConfirmWechatRechargeRefundResult;
  }

  async markWechatRechargeRefundFailed(
    input: BillingMarkWechatRechargeRefundFailedInput,
  ) {
    const { data: requestData, error: requestError } = await this.from(
      "tenant_credit_refund_requests",
    )
      .update({
        status: "failed",
        failure_message: input.failureMessage.slice(0, 500),
        metadata: input.metadata,
      })
      .eq("id", input.refundRequestId)
      .eq("tenant_id", input.tenantId)
      .in("status", ["refunding", "failed"])
      .select("*")
      .single();

    if (requestError) {
      throw Errors.dbError(
        "标记积分充值微信退款申请为失败状态失败",
        requestError,
      );
    }

    const { data: orderData, error: orderError } = await this.from(
      "tenant_credit_orders",
    )
      .update({ refund_status: "failed" })
      .eq("tenant_id", input.tenantId)
      .eq("id", input.orderId)
      .select("*")
      .single();

    if (orderError) {
      throw Errors.dbError("标记积分充值微信退款订单为失败状态失败", orderError);
    }

    return {
      request: requestData as TenantCreditRefundRequestRecord,
      order: orderData as TenantCreditOrderRecord,
    } satisfies BillingMarkWechatRechargeRefundFailedResult;
  }

  private async findOrderById(input: { tenantId: string; orderId: string }) {
    const { data, error } = await this.from("tenant_credit_orders")
      .select("*")
      .eq("tenant_id", input.tenantId)
      .eq("id", input.orderId)
      .maybeSingle();

    if (error) throw Errors.dbError("查询积分充值订单失败", error);
    return (data as TenantCreditOrderRecord | null) ?? null;
  }
}

export const billingRechargeRefundCallbackRepository =
  new BillingRechargeRefundCallbackRepository();
