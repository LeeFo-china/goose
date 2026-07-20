import { z } from "zod";

import { Errors } from "@/errors/error-factory";
import type { TenantCreditOrderRecord } from "@/repositories/billing-recharge";
import type { BillingConfirmWechatRechargeRefundResult } from "@/repositories/billing-recharge-refund-callbacks";
import type { PlatformPaymentConfigRecord } from "@/repositories/platform-payment-configs";
import { SupabaseDB } from "@/utils/supabase/index";

export type ClaimDueRefundsInput = {
  limit: number;
  leaseSeconds: number;
  claimToken: string;
  now: string;
};

export type RescheduleClaimedRefundInput = {
  refundRequestId: string;
  claimToken: string;
  reconcileNextAt: string;
  checkedAt: string;
  lastError: string | null;
  metadata: Record<string, unknown>;
  wechatRefundId?: string | null;
  refundAmountFen?: number | null;
};

export type CloseClaimedRefundInput = {
  refundRequestId: string;
  claimToken: string;
  checkedAt: string;
  metadata: Record<string, unknown>;
};

export type ConfirmClaimedRefundInput = {
  refundRequestId: string;
  claimToken: string;
  outRefundNo: string;
  wechatRefundId: string;
  refundAmountFen: number;
  refundedAt: string | null;
  metadata: Record<string, unknown>;
};

export type ConfirmRefundResult = BillingConfirmWechatRechargeRefundResult;

export type RefundClaimRecord = {
  id: string;
  tenant_id: string;
  order_id: string;
  reason: string;
  requested_amount_fen: number;
  out_refund_no: string | null;
  wechat_refund_id: string | null;
  refund_amount_fen: number | null;
  reconcile_attempt_count: number;
};

export type ClaimedRefundOrder = Pick<
  TenantCreditOrderRecord,
  | "id"
  | "tenant_id"
  | "amount_fen"
  | "paid_amount_fen"
  | "payment_config_id"
  | "out_trade_no"
  | "transaction_id"
>;

export type RefundWechatPayConfig = Pick<
  PlatformPaymentConfigRecord,
  | "id"
  | "merchant_mode"
  | "merchant_id"
  | "sub_merchant_id"
  | "app_id"
  | "sub_app_id"
  | "encrypted_config_ref"
  | "secret_bundle_revision"
  | "serial_no"
  | "notify_url"
>;

export type ClaimedRefund = RefundClaimRecord & {
  order: ClaimedRefundOrder | null;
  config: RefundWechatPayConfig | null;
};

type TableName = "tenant_credit_orders" | "platform_payment_configs";

type UntypedTable = {
  select: (...args: unknown[]) => UntypedTable;
  in: (...args: unknown[]) => UntypedTable;
  then: Promise<{ data: unknown; error: unknown }>["then"];
};

type UntypedClient = {
  from: (table: TableName) => UntypedTable;
  rpc: (
    functionName:
      | "billing_claim_wechat_recharge_refunds"
      | "billing_reschedule_wechat_recharge_refund"
      | "billing_close_wechat_recharge_refund"
      | "billing_confirm_claimed_wechat_recharge_refund",
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: unknown }>;
};

const ORDER_COLUMNS = [
  "id",
  "tenant_id",
  "amount_fen",
  "paid_amount_fen",
  "payment_config_id",
  "out_trade_no",
  "transaction_id",
].join(",");

const CONFIG_COLUMNS = [
  "id",
  "merchant_mode",
  "merchant_id",
  "sub_merchant_id",
  "app_id",
  "sub_app_id",
  "encrypted_config_ref",
  "secret_bundle_revision",
  "serial_no",
  "notify_url",
].join(",");

const nonBlankStringSchema = z.string().refine(
  (value) => value.trim().length > 0,
);
const positiveSafeIntegerSchema = z.number().refine(
  (value) => Number.isSafeInteger(value) && value > 0,
);
const nonnegativeSafeIntegerSchema = z.number().refine(
  (value) => Number.isSafeInteger(value) && value >= 0,
);
const refundClaimSchema = z.object({
  id: z.uuid(),
  tenant_id: z.uuid(),
  order_id: z.uuid(),
  reason: nonBlankStringSchema,
  requested_amount_fen: positiveSafeIntegerSchema,
  out_refund_no: nonBlankStringSchema.nullable(),
  wechat_refund_id: nonBlankStringSchema.nullable(),
  refund_amount_fen: nonnegativeSafeIntegerSchema.nullable(),
  reconcile_attempt_count: nonnegativeSafeIntegerSchema,
});

class BillingRechargeRefundReconciliationRepository {
  private get client() {
    return SupabaseDB.getAdminClient() as unknown as UntypedClient;
  }

  async claimDue(input: ClaimDueRefundsInput): Promise<ClaimedRefund[]> {
    if (!Number.isInteger(input.limit) || input.limit < 1 || input.limit > 100) {
      throw Errors.business(
        400,
        "微信退款对账批次大小必须在 1 到 100 之间",
        "BILLING_RECHARGE_REFUND_RECONCILE_LIMIT_INVALID",
      );
    }
    if (
      !Number.isInteger(input.leaseSeconds) ||
      input.leaseSeconds < 30 ||
      input.leaseSeconds > 900
    ) {
      throw Errors.business(
        400,
        "微信退款对账租约必须在 30 到 900 秒之间",
        "BILLING_RECHARGE_REFUND_RECONCILE_LEASE_INVALID",
      );
    }
    const { data, error } = await this.client.rpc(
      "billing_claim_wechat_recharge_refunds",
      {
        p_limit: input.limit,
        p_lease_seconds: input.leaseSeconds,
        p_claim_token: input.claimToken,
        p_now: input.now,
      },
    );
    if (error) {
      throw Errors.dbError("领取积分充值微信退款对账任务失败", error);
    }

    if (!Array.isArray(data)) {
      throw Errors.dbError("微信退款对账领取结果格式不正确");
    }
    const claims = data.map(toRefundClaimRecord);
    if (claims.length === 0) return [];

    const orders = await this.findOrders(
      unique(claims.map((item) => item.order_id)),
    );
    const configs = await this.findWechatPayConfigsByIds(
      unique(Array.from(orders.values()).map((item) => item.payment_config_id)),
    );

    return claims.map((claim) => {
      const order = orders.get(claim.order_id) ?? null;
      return {
        ...claim,
        order,
        config: order?.payment_config_id
          ? configs.get(order.payment_config_id) ?? null
          : null,
      };
    });
  }

  async reschedule(input: RescheduleClaimedRefundInput): Promise<boolean> {
    const { data, error } = await this.client.rpc(
      "billing_reschedule_wechat_recharge_refund",
      {
        p_refund_request_id: input.refundRequestId,
        p_claim_token: input.claimToken,
        p_reconcile_next_at: input.reconcileNextAt,
        p_checked_at: input.checkedAt,
        p_last_error: input.lastError,
        p_metadata: input.metadata,
        p_wechat_refund_id: input.wechatRefundId ?? null,
        p_refund_amount_fen: input.refundAmountFen ?? null,
      },
    );
    if (error) {
      throw Errors.dbError("重排积分充值微信退款对账任务失败", error);
    }
    return data === true;
  }

  async close(input: CloseClaimedRefundInput): Promise<boolean> {
    const { data, error } = await this.client.rpc(
      "billing_close_wechat_recharge_refund",
      {
        p_refund_request_id: input.refundRequestId,
        p_claim_token: input.claimToken,
        p_checked_at: input.checkedAt,
        p_metadata: input.metadata,
      },
    );
    if (error) {
      throw Errors.dbError("关闭积分充值微信退款对账任务失败", error);
    }
    return data === true;
  }

  async confirmSuccess(
    input: ConfirmClaimedRefundInput,
  ): Promise<ConfirmRefundResult | null> {
    const { data, error } = await this.client.rpc(
      "billing_confirm_claimed_wechat_recharge_refund",
      {
        p_refund_request_id: input.refundRequestId,
        p_claim_token: input.claimToken,
        p_out_refund_no: input.outRefundNo,
        p_wechat_refund_id: input.wechatRefundId,
        p_refund_amount_fen: input.refundAmountFen,
        p_refunded_at: input.refundedAt,
        p_metadata: input.metadata,
      },
    );
    if (error) {
      throw Errors.dbError("确认积分充值微信退款对账成功失败", error);
    }
    return data === null ? null : data as ConfirmRefundResult;
  }

  private async findOrders(ids: string[]) {
    const { data, error } = await this.client.from("tenant_credit_orders")
      .select(ORDER_COLUMNS)
      .in("id", ids);
    if (error) {
      throw Errors.dbError("查询微信退款对账关联订单失败", error);
    }
    return new Map(
      ((data ?? []) as ClaimedRefundOrder[]).map((item) => [item.id, item]),
    );
  }

  private async findWechatPayConfigsByIds(ids: string[]) {
    if (ids.length === 0) return new Map<string, RefundWechatPayConfig>();
    const { data, error } = await this.client.from("platform_payment_configs")
      .select(CONFIG_COLUMNS)
      .in("id", ids);
    if (error) {
      throw Errors.dbError("查询微信退款对账支付配置失败", error);
    }
    return new Map(
      ((data ?? []) as RefundWechatPayConfig[]).map((item) => [item.id, item]),
    );
  }
}

function toRefundClaimRecord(value: unknown): RefundClaimRecord {
  const result = refundClaimSchema.safeParse(value);
  if (!result.success) {
    throw Errors.dbError("微信退款对账领取结果格式不正确", {
      issues: result.error.issues,
    });
  }
  return result.data;
}

function unique(values: Array<string | null | undefined>) {
  return Array.from(
    new Set(values.filter((value): value is string => Boolean(value))),
  );
}

export const billingRechargeRefundReconciliationRepository =
  new BillingRechargeRefundReconciliationRepository();
