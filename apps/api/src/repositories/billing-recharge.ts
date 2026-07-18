import { Errors } from "@/errors/error-factory";
import type { BillingAccountBalance } from "@/repositories/billing";
import {
  billingRechargeRefundCallbackRepository,
  type BillingConfirmWechatRechargeRefundInput,
  type BillingConfirmWechatRechargeRefundResult,
  type BillingMarkWechatRechargeRefundFailedInput,
  type BillingMarkWechatRechargeRefundFailedResult,
  type BillingWechatRefundRequestMatch,
} from "@/repositories/billing-recharge-refund-callbacks";
import { SupabaseDB } from "@/utils/supabase/index";

export type CreditRechargeProductRecord = {
  id: string;
  code: string;
  title: string;
  amount_fen: number;
  credits: number;
  bonus_credits: number;
  enabled: boolean;
  sort_order: number;
  metadata: Record<string, unknown>;
  created_by_employee_id: string | null;
  updated_by_employee_id: string | null;
  created_at: string;
  updated_at: string;
};

export type TenantCreditOrderRecord = {
  id: string;
  tenant_id: string;
  order_no: string;
  idempotency_key: string | null;
  package_code: string | null;
  credits: number;
  amount_fen: number;
  bonus_credits: number;
  channel: "manual" | "wechat_pay" | "alipay" | "bank_transfer";
  status: "pending" | "paid" | "closed" | "refunded";
  paid_at: string | null;
  created_by: string | null;
  remark: string | null;
  metadata: Record<string, unknown>;
  payment_config_id: string | null;
  out_trade_no: string | null;
  prepay_id: string | null;
  transaction_id: string | null;
  paid_amount_fen: number;
  closed_at: string | null;
  latest_notification_id: string | null;
  refund_status?: string | null;
  refund_requested_at?: string | null;
  refunded_at?: string | null;
  refund_amount_fen?: number | null;
  created_at: string;
  updated_at: string;
};

export type TenantCreditOrderCreateInput = {
  tenant_id: string;
  order_no: string;
  out_trade_no: string;
  idempotency_key: string | null;
  package_code: string;
  credits: number;
  bonus_credits: number;
  amount_fen: number;
  channel: "wechat_pay";
  status: "pending";
  created_by: string;
  payment_config_id: string;
  metadata: Record<string, unknown>;
};

export type TenantCreditWechatNotificationRecord = {
  id: string;
  tenant_id: string;
  credit_order_id: string | null;
  notify_id: string;
  event_type: string;
  resource_type: string | null;
  raw_payload: Record<string, unknown>;
  signature_valid: boolean;
  processed: boolean;
  processed_at: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
};

export type TenantCreditWechatNotificationCreateInput = {
  tenant_id: string;
  credit_order_id: string;
  notify_id: string;
  event_type: string;
  resource_type: string | null;
  raw_payload: Record<string, unknown>;
  signature_valid: boolean;
  processed: boolean;
};

export type BillingConfirmWechatRechargeInput = {
  orderId: string;
  transactionId: string;
  paidAmountFen: number;
  paidAt: string | null;
  notificationId: string | null;
  metadata: Record<string, unknown>;
};

export type BillingConfirmWechatRechargeResult = {
  order: Record<string, unknown> | null;
  account: Record<string, unknown> | null;
  ledger: Record<string, unknown> | null;
  idempotent: boolean;
};

type UntypedTable = {
  select: (...args: unknown[]) => UntypedTable;
  insert: (...args: unknown[]) => UntypedTable;
  update: (...args: unknown[]) => UntypedTable;
  eq: (...args: unknown[]) => UntypedTable;
  or: (...args: unknown[]) => UntypedTable;
  order: (...args: unknown[]) => UntypedTable;
  range: (...args: unknown[]) => UntypedTable;
  limit: (...args: unknown[]) => UntypedTable;
  maybeSingle: () => Promise<{ data: unknown; error: unknown }>;
  single: () => Promise<{ data: unknown; error: unknown }>;
  then: Promise<{
    data: unknown;
    error: unknown;
    count: number | null;
  }>["then"];
};

type UntypedClient = {
  from: (
    table:
      | "platform_credit_recharge_products"
      | "tenant_credit_orders"
      | "tenant_credit_wechat_notifications"
      | "tenant_credit_account_balances",
  ) => UntypedTable;
  rpc: (
    functionName: "billing_confirm_wechat_recharge",
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: unknown }>;
};

class BillingRechargeRepository {
  private from(table: Parameters<UntypedClient["from"]>[0]) {
    return (SupabaseDB.getAdminClient() as unknown as UntypedClient).from(table);
  }

  async listEnabledProducts(input: { page: number; pageSize: number }) {
    const from = (input.page - 1) * input.pageSize;
    const to = from + input.pageSize - 1;
    const { data, error, count } = await this.from("platform_credit_recharge_products")
      .select("*", { count: "exact" })
      .eq("enabled", true)
      .order("sort_order", { ascending: true })
      .order("amount_fen", { ascending: true })
      .range(from, to);

    if (error) {
      throw Errors.dbError("查询积分充值套餐失败", error);
    }

    return {
      list: (data ?? []) as CreditRechargeProductRecord[],
      pagination: {
        page: input.page,
        pageSize: input.pageSize,
        total: count ?? 0,
        totalPages: count ? Math.ceil(count / input.pageSize) : 0,
      },
    };
  }

  async listOrders(input: {
    tenantId: string;
    page: number;
    pageSize: number;
    status?: string;
    keyword?: string;
  }) {
    const from = (input.page - 1) * input.pageSize;
    const to = from + input.pageSize - 1;
    let request = this.from("tenant_credit_orders")
      .select(
        [
          "id",
          "tenant_id",
          "order_no",
          "idempotency_key",
          "package_code",
          "credits",
          "amount_fen",
          "bonus_credits",
          "channel",
          "status",
          "paid_at",
          "created_by",
          "remark",
          "metadata",
          "payment_config_id",
          "out_trade_no",
          "prepay_id",
          "transaction_id",
          "paid_amount_fen",
          "refund_status",
          "refund_requested_at",
          "refunded_at",
          "refund_amount_fen",
          "closed_at",
          "latest_notification_id",
          "created_at",
          "updated_at",
        ].join(", "),
        { count: "exact" },
      )
      .eq("tenant_id", input.tenantId)
      .eq("channel", "wechat_pay")
      .order("created_at", { ascending: false })
      .range(from, to);

    if (input.status) request = request.eq("status", input.status);
    if (input.keyword) {
      const escaped = input.keyword.replaceAll(",", "\\,");
      request = request.or(
        `order_no.ilike.%${escaped}%,out_trade_no.ilike.%${escaped}%,transaction_id.ilike.%${escaped}%`,
      );
    }

    const { data, error, count } = await request;
    if (error) {
      throw Errors.dbError("查询积分充值订单列表失败", error);
    }

    return {
      list: (data ?? []) as TenantCreditOrderRecord[],
      pagination: {
        page: input.page,
        pageSize: input.pageSize,
        total: count ?? 0,
        totalPages: count ? Math.ceil(count / input.pageSize) : 0,
      },
    };
  }

  async findEnabledProductByCode(code: string) {
    const { data, error } = await this.from("platform_credit_recharge_products")
      .select("*")
      .eq("code", code)
      .eq("enabled", true)
      .maybeSingle();

    if (error) {
      throw Errors.dbError("查询积分充值套餐失败", error);
    }

    return (data as CreditRechargeProductRecord | null) ?? null;
  }

  async findOrderByIdempotencyKey(input: {
    tenantId: string;
    idempotencyKey: string;
  }) {
    const { data, error } = await this.from("tenant_credit_orders")
      .select("*")
      .eq("tenant_id", input.tenantId)
      .eq("idempotency_key", input.idempotencyKey)
      .maybeSingle();

    if (error) {
      throw Errors.dbError("查询积分充值订单失败", error);
    }

    return (data as TenantCreditOrderRecord | null) ?? null;
  }

  async createOrder(input: TenantCreditOrderCreateInput) {
    const { data, error } = await this.from("tenant_credit_orders")
      .insert(input)
      .select("*")
      .single();

    if (error) {
      throw Errors.dbError("创建积分充值订单失败", error);
    }

    return data as TenantCreditOrderRecord;
  }

  async markPrepayCreated(input: {
    tenantId: string;
    orderId: string;
    prepayId: string;
  }) {
    const { data, error } = await this.from("tenant_credit_orders")
      .update({ prepay_id: input.prepayId })
      .eq("tenant_id", input.tenantId)
      .eq("id", input.orderId)
      .select("*")
      .single();

    if (error) {
      throw Errors.dbError("保存积分充值预支付单失败", error);
    }

    return data as TenantCreditOrderRecord;
  }

  async findOrderById(input: { tenantId: string; orderId: string }) {
    const { data, error } = await this.from("tenant_credit_orders")
      .select("*")
      .eq("tenant_id", input.tenantId)
      .eq("id", input.orderId)
      .maybeSingle();

    if (error) {
      throw Errors.dbError("查询积分充值订单失败", error);
    }

    return (data as TenantCreditOrderRecord | null) ?? null;
  }

  async getAccountByTenantId(tenantId: string) {
    const { data, error } = await this.from("tenant_credit_account_balances")
      .select("*")
      .eq("tenant_id", tenantId)
      .maybeSingle();

    if (error) {
      throw Errors.dbError("查询租户积分账户失败", error);
    }

    return (data as BillingAccountBalance | null) ?? null;
  }

  async findWechatOrderByOutTradeNo(outTradeNo: string) {
    const { data, error } = await this.from("tenant_credit_orders")
      .select("*")
      .eq("channel", "wechat_pay")
      .eq("out_trade_no", outTradeNo)
      .limit(2);

    if (error) {
      throw Errors.dbError("查询积分充值微信订单失败", error);
    }

    const rows = (data ?? []) as TenantCreditOrderRecord[];
    if (rows.length > 1) {
      throw Errors.business(
        409,
        "积分充值商户订单号匹配到多个订单",
        "BILLING_RECHARGE_OUT_TRADE_NO_DUPLICATED",
      );
    }

    return rows[0] ?? null;
  }

  async findWechatRefundRequestByOutRefundNo(outRefundNo: string) {
    return billingRechargeRefundCallbackRepository
      .findWechatRefundRequestByOutRefundNo(outRefundNo);
  }

  async findWechatNotificationByNotifyId(input: { notifyId: string }) {
    const { data, error } = await this.from("tenant_credit_wechat_notifications")
      .select("*")
      .eq("notify_id", input.notifyId)
      .maybeSingle();

    if (error) {
      throw Errors.dbError("查询积分充值微信回调通知失败", error);
    }

    return (data as TenantCreditWechatNotificationRecord | null) ?? null;
  }

  async createWechatNotification(
    input: TenantCreditWechatNotificationCreateInput,
  ) {
    const { data, error } = await this.from("tenant_credit_wechat_notifications")
      .insert(input)
      .select("*")
      .single();

    if (error) {
      throw Errors.dbError("写入积分充值微信回调通知失败", error);
    }

    return data as TenantCreditWechatNotificationRecord;
  }

  async markWechatNotificationProcessed(input: { notificationId: string }) {
    const { data, error } = await this.from("tenant_credit_wechat_notifications")
      .update({
        processed: true,
        processed_at: new Date().toISOString(),
        error_message: null,
      })
      .eq("id", input.notificationId)
      .select("*")
      .single();

    if (error) {
      throw Errors.dbError("标记积分充值微信回调通知已处理失败", error);
    }

    return data as TenantCreditWechatNotificationRecord;
  }

  async markWechatNotificationFailed(input: {
    notificationId: string;
    errorMessage: string;
  }) {
    const { data, error } = await this.from("tenant_credit_wechat_notifications")
      .update({
        processed: false,
        error_message: input.errorMessage.slice(0, 500),
      })
      .eq("id", input.notificationId)
      .select("*")
      .single();

    if (error) {
      throw Errors.dbError("标记积分充值微信回调通知失败原因失败", error);
    }

    return data as TenantCreditWechatNotificationRecord;
  }

  async confirmWechatRecharge(input: BillingConfirmWechatRechargeInput) {
    const { data, error } = await (
      SupabaseDB.getAdminClient() as unknown as UntypedClient
    ).rpc("billing_confirm_wechat_recharge", {
      p_order_id: input.orderId,
      p_transaction_id: input.transactionId,
      p_paid_amount_fen: input.paidAmountFen,
      p_paid_at: input.paidAt,
      p_notification_id: input.notificationId,
      p_metadata: input.metadata,
    });

    if (error) {
      throw Errors.dbError("确认积分充值微信支付入账失败", error);
    }

    return data as BillingConfirmWechatRechargeResult;
  }

  async confirmWechatRechargeRefund(
    input: BillingConfirmWechatRechargeRefundInput,
  ) {
    return billingRechargeRefundCallbackRepository
      .confirmWechatRechargeRefund(input);
  }

  async markWechatRechargeRefundFailed(
    input: BillingMarkWechatRechargeRefundFailedInput,
  ) {
    return billingRechargeRefundCallbackRepository
      .markWechatRechargeRefundFailed(input);
  }
}

export type {
  BillingConfirmWechatRechargeRefundInput,
  BillingConfirmWechatRechargeRefundResult,
  BillingMarkWechatRechargeRefundFailedInput,
  BillingMarkWechatRechargeRefundFailedResult,
  BillingWechatRefundRequestMatch,
};

export const billingRechargeRepository = new BillingRechargeRepository();
