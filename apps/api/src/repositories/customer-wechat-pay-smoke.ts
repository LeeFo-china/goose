import { Errors } from "@/errors/error-factory";
import { SupabaseDB } from "@/utils/supabase/index";

export type CustomerWechatPaySmokeOrderStatus =
  | "pending"
  | "paid"
  | "closed"
  | "refunded"
  | "failed";

export type CustomerWechatPaySmokeOrderRecord = {
  id: string;
  tenant_id: string;
  customer_id: string;
  payment_config_id: string | null;
  out_trade_no: string;
  idempotency_key: string | null;
  amount_fen: number;
  paid_amount_fen: number;
  currency: "CNY";
  status: CustomerWechatPaySmokeOrderStatus;
  payer_openid: string;
  prepay_id: string | null;
  transaction_id: string | null;
  trade_state: string | null;
  trade_state_desc: string | null;
  paid_at: string | null;
  closed_at: string | null;
  failed_at: string | null;
  failure_reason: string | null;
  latest_notification_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type CustomerWechatPaySmokeOrderCreateInput = {
  tenant_id: string;
  customer_id: string;
  payment_config_id: string;
  out_trade_no: string;
  idempotency_key: string | null;
  amount_fen: number;
  paid_amount_fen: number;
  currency: "CNY";
  status: "pending";
  payer_openid: string;
  metadata: Record<string, unknown>;
};

export type CustomerWechatPaySmokeNotificationRecord = {
  id: string;
  tenant_id: string;
  smoke_order_id: string | null;
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

export type CustomerWechatPaySmokeNotificationCreateInput = {
  tenant_id: string;
  smoke_order_id: string;
  notify_id: string;
  event_type: string;
  resource_type: string | null;
  raw_payload: Record<string, unknown>;
  signature_valid: boolean;
  processed: boolean;
};

type UntypedTable = {
  select: (...args: unknown[]) => UntypedTable;
  insert: (...args: unknown[]) => UntypedTable;
  update: (...args: unknown[]) => UntypedTable;
  eq: (...args: unknown[]) => UntypedTable;
  limit: (...args: unknown[]) => UntypedTable;
  maybeSingle: () => Promise<{ data: unknown; error: unknown }>;
  single: () => Promise<{ data: unknown; error: unknown }>;
};

type UntypedClient = {
  from: (
    table:
      | "customer_wechat_pay_smoke_orders"
      | "customer_wechat_pay_smoke_notifications",
  ) => UntypedTable;
};

class CustomerWechatPaySmokeRepository {
  private from(table: Parameters<UntypedClient["from"]>[0]) {
    return (SupabaseDB.getAdminClient() as unknown as UntypedClient)
      .from(table);
  }

  async findByIdempotencyKey(input: {
    tenantId: string;
    customerId: string;
    idempotencyKey: string;
  }) {
    const { data, error } = await this.from("customer_wechat_pay_smoke_orders")
      .select("*")
      .eq("tenant_id", input.tenantId)
      .eq("customer_id", input.customerId)
      .eq("idempotency_key", input.idempotencyKey)
      .maybeSingle();

    if (error) {
      throw Errors.dbError("查询客户微信支付测试订单失败", error);
    }

    return (data as CustomerWechatPaySmokeOrderRecord | null) ?? null;
  }

  async createOrder(input: CustomerWechatPaySmokeOrderCreateInput) {
    const { data, error } = await this.from("customer_wechat_pay_smoke_orders")
      .insert(input)
      .select("*")
      .single();

    if (error) {
      throw Errors.dbError("创建客户微信支付测试订单失败", error);
    }

    return data as CustomerWechatPaySmokeOrderRecord;
  }

  async markPrepayCreated(input: {
    tenantId: string;
    customerId: string;
    orderId: string;
    prepayId: string;
  }) {
    const { data, error } = await this.from("customer_wechat_pay_smoke_orders")
      .update({ prepay_id: input.prepayId })
      .eq("tenant_id", input.tenantId)
      .eq("customer_id", input.customerId)
      .eq("id", input.orderId)
      .eq("status", "pending")
      .select("*")
      .maybeSingle();

    if (error) {
      throw Errors.dbError("保存客户微信支付测试预支付单失败", error);
    }

    return (data as CustomerWechatPaySmokeOrderRecord | null) ?? null;
  }

  async findOrderById(input: {
    tenantId: string;
    customerId: string;
    orderId: string;
  }) {
    const { data, error } = await this.from("customer_wechat_pay_smoke_orders")
      .select("*")
      .eq("tenant_id", input.tenantId)
      .eq("customer_id", input.customerId)
      .eq("id", input.orderId)
      .maybeSingle();

    if (error) {
      throw Errors.dbError("查询客户微信支付测试订单失败", error);
    }

    return (data as CustomerWechatPaySmokeOrderRecord | null) ?? null;
  }

  async findByOutTradeNo(outTradeNo: string) {
    const { data, error } = await this.from("customer_wechat_pay_smoke_orders")
      .select("*")
      .eq("out_trade_no", outTradeNo)
      .maybeSingle();

    if (error) {
      throw Errors.dbError("查询客户微信支付测试订单失败", error);
    }

    return (data as CustomerWechatPaySmokeOrderRecord | null) ?? null;
  }

  async markOrderPaid(input: {
    tenantId: string;
    customerId: string;
    orderId: string;
    transactionId: string;
    paidAmountFen: number;
    paidAt: string;
    notificationId: string | null;
    tradeStateDesc: string | null;
    metadata: Record<string, unknown>;
  }) {
    const { data, error } = await this.from("customer_wechat_pay_smoke_orders")
      .update({
        status: "paid",
        transaction_id: input.transactionId,
        trade_state: "SUCCESS",
        trade_state_desc: input.tradeStateDesc,
        paid_amount_fen: input.paidAmountFen,
        paid_at: input.paidAt,
        latest_notification_id: input.notificationId,
        metadata: input.metadata,
        failure_reason: null,
      })
      .eq("tenant_id", input.tenantId)
      .eq("customer_id", input.customerId)
      .eq("id", input.orderId)
      .select("*")
      .single();

    if (error) {
      throw Errors.dbError("标记客户微信支付测试订单已支付失败", error);
    }

    return data as CustomerWechatPaySmokeOrderRecord;
  }

  async markOrderTradeState(input: {
    tenantId: string;
    customerId: string;
    orderId: string;
    tradeState: string;
    tradeStateDesc: string | null;
  }) {
    const patch: Record<string, unknown> = {
      trade_state: input.tradeState,
      trade_state_desc: input.tradeStateDesc,
    };
    if (input.tradeState === "CLOSED") {
      patch.status = "closed";
      patch.closed_at = new Date().toISOString();
    }
    if (input.tradeState === "PAYERROR") {
      patch.status = "failed";
      patch.failed_at = new Date().toISOString();
      patch.failure_reason = input.tradeStateDesc;
    }
    if (input.tradeState === "REFUND") {
      patch.status = "refunded";
    }

    const { data, error } = await this.from("customer_wechat_pay_smoke_orders")
      .update(patch)
      .eq("tenant_id", input.tenantId)
      .eq("customer_id", input.customerId)
      .eq("id", input.orderId)
      .select("*")
      .single();

    if (error) {
      throw Errors.dbError("同步客户微信支付测试订单状态失败", error);
    }

    return data as CustomerWechatPaySmokeOrderRecord;
  }

  async findNotificationByNotifyId(input: { notifyId: string }) {
    const { data, error } = await this
      .from("customer_wechat_pay_smoke_notifications")
      .select("*")
      .eq("notify_id", input.notifyId)
      .maybeSingle();

    if (error) {
      throw Errors.dbError("查询客户微信支付测试回调通知失败", error);
    }

    return (data as CustomerWechatPaySmokeNotificationRecord | null) ?? null;
  }

  async createNotification(
    input: CustomerWechatPaySmokeNotificationCreateInput,
  ) {
    const { data, error } = await this
      .from("customer_wechat_pay_smoke_notifications")
      .insert(input)
      .select("*")
      .single();

    if (error) {
      throw Errors.dbError("写入客户微信支付测试回调通知失败", error);
    }

    return data as CustomerWechatPaySmokeNotificationRecord;
  }

  async markNotificationProcessed(input: { notificationId: string }) {
    const { data, error } = await this
      .from("customer_wechat_pay_smoke_notifications")
      .update({
        processed: true,
        processed_at: new Date().toISOString(),
        error_message: null,
      })
      .eq("id", input.notificationId)
      .select("*")
      .single();

    if (error) {
      throw Errors.dbError("标记客户微信支付测试回调通知已处理失败", error);
    }

    return data as CustomerWechatPaySmokeNotificationRecord;
  }

  async markNotificationFailed(input: {
    notificationId: string;
    errorMessage: string;
  }) {
    const { data, error } = await this
      .from("customer_wechat_pay_smoke_notifications")
      .update({
        processed: false,
        error_message: input.errorMessage.slice(0, 500),
      })
      .eq("id", input.notificationId)
      .select("*")
      .single();

    if (error) {
      throw Errors.dbError("标记客户微信支付测试回调通知失败原因失败", error);
    }

    return data as CustomerWechatPaySmokeNotificationRecord;
  }
}

export const customerWechatPaySmokeRepository =
  new CustomerWechatPaySmokeRepository();
