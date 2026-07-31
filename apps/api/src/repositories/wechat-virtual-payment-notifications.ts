import { z } from "zod";

import { Errors } from "@/errors/error-factory";
import { matchesPostgresError } from "@/errors/postgres-error-details";
import { SupabaseDB } from "@/utils/supabase";

type RpcResult = { data: unknown; error: unknown };
type Client = {
  rpc(name: string, parameters: Record<string, unknown>): Promise<RpcResult>;
};

const NotificationRecordSchema = z.object({
  id: z.uuid(),
  event_key: z.string().length(64),
  payload_sha256: z.string().length(64),
  status: z.enum(["processing", "processed", "failed"]),
  order_id: z.uuid().nullable(),
  retry_count: z.number().int().nonnegative(),
  result_summary: z.record(z.string(), z.unknown()),
});
const AcceptanceResultSchema = z.object({
  created: z.boolean(),
  record: NotificationRecordSchema,
});

export type WechatVirtualPaymentNotificationRecord = z.infer<
  typeof NotificationRecordSchema
>;

const COMMAND_ERRORS = {
  WECHAT_VIRTUAL_NOTIFICATION_INPUT_INVALID: {
    statusCode: 400,
    message: "微信虚拟支付消息字段无效",
  },
  WECHAT_VIRTUAL_NOTIFICATION_EVENT_CONFLICT: {
    statusCode: 409,
    message: "微信虚拟支付消息幂等事实冲突",
  },
  WECHAT_VIRTUAL_NOTIFICATION_NOT_FOUND: {
    statusCode: 404,
    message: "微信虚拟支付消息不存在",
  },
  WECHAT_VIRTUAL_NOTIFICATION_ORDER_CONFLICT: {
    statusCode: 409,
    message: "微信虚拟支付消息关联订单冲突",
  },
  WECHAT_VIRTUAL_NOTIFICATION_RESULT_IMMUTABLE: {
    statusCode: 409,
    message: "微信虚拟支付消息结果不可变更",
  },
  WECHAT_VIRTUAL_NOTIFICATION_PROCESSED_TERMINAL: {
    statusCode: 409,
    message: "微信虚拟支付消息已完成处理",
  },
  WECHAT_VIRTUAL_NOTIFICATION_RETRY_MONOTONIC: {
    statusCode: 409,
    message: "微信虚拟支付消息重试状态冲突",
  },
} as const;

export class WechatVirtualPaymentNotificationRepository {
  constructor(
    private readonly clientProvider: () => Client = () =>
      SupabaseDB.getAdminClient() as unknown as Client,
  ) {}

  async createOrGet(input: {
    eventType: "xpay_goods_deliver_notify";
    environment: "sandbox" | "production";
    recipientOriginalId: string;
    senderIdHash: string;
    providerCreatedAtUnix: number;
    messageType: "event";
    outTradeNo: string;
    providerProductId: string;
    openidHash: string;
    providerOrderNo: string;
    transactionId: string;
    paidAt: string;
    quantity: 1;
    origPriceFen: number;
    actualPriceFen: number;
    attach: string;
    requestId: string | null;
  }): Promise<{
    created: boolean;
    record: WechatVirtualPaymentNotificationRecord;
  }> {
    const { data, error } = await this.clientProvider().rpc(
      "wechat_accept_virtual_payment_notification",
      {
        p_event_type: input.eventType,
        p_environment: input.environment,
        p_recipient_original_id: input.recipientOriginalId,
        p_sender_id_hash: input.senderIdHash,
        p_provider_created_at: input.providerCreatedAtUnix,
        p_msg_type: input.messageType,
        p_out_trade_no: input.outTradeNo,
        p_provider_product_id: input.providerProductId,
        p_openid_hash: input.openidHash,
        p_provider_order_no: input.providerOrderNo,
        p_transaction_id: input.transactionId,
        p_paid_at: input.paidAt,
        p_quantity: input.quantity,
        p_orig_price_fen: input.origPriceFen,
        p_actual_price_fen: input.actualPriceFen,
        p_attach: input.attach,
        p_request_id: input.requestId,
      },
    );
    if (error) throwCommandError(error, "保存微信虚拟支付消息失败");
    const parsed = AcceptanceResultSchema.safeParse(firstRow(data));
    if (!parsed.success) throw Errors.dbError("微信虚拟支付消息数据格式错误");
    return parsed.data;
  }

  async markProcessed(input: {
    notificationId: string;
    orderId: string;
    paymentRecorded: true;
    fulfilled: true;
    entitlementEventId: string;
    entitlementStatus: "active" | "suspended" | "expired" | "revoked";
  }): Promise<WechatVirtualPaymentNotificationRecord> {
    const { data, error } = await this.clientProvider().rpc(
      "wechat_mark_virtual_payment_notification_processed",
      {
        p_notification_id: input.notificationId,
        p_order_id: input.orderId,
        p_payment_recorded: input.paymentRecorded,
        p_fulfilled: input.fulfilled,
        p_entitlement_event_id: input.entitlementEventId,
        p_entitlement_status: input.entitlementStatus,
      },
    );
    if (error) throwCommandError(error, "完成微信虚拟支付消息处理失败");
    return parseRecord(firstRow(data));
  }

  async markFailed(input: {
    notificationId: string;
    orderId: string | null;
    errorCode: string;
    errorSummary: string;
  }): Promise<WechatVirtualPaymentNotificationRecord> {
    const { data, error } = await this.clientProvider().rpc(
      "wechat_mark_virtual_payment_notification_failed",
      {
        p_notification_id: input.notificationId,
        p_order_id: input.orderId,
        p_error_code: input.errorCode.slice(0, 100),
        p_error_summary: input.errorSummary.slice(0, 500),
      },
    );
    if (error) throwCommandError(error, "记录微信虚拟支付消息失败状态失败");
    return parseRecord(firstRow(data));
  }
}

function firstRow(data: unknown): unknown {
  return Array.isArray(data) ? data[0] : data;
}

function parseRecord(data: unknown): WechatVirtualPaymentNotificationRecord {
  const parsed = NotificationRecordSchema.safeParse(data);
  if (!parsed.success) throw Errors.dbError("微信虚拟支付消息数据格式错误");
  return parsed.data;
}

function throwCommandError(error: unknown, fallbackMessage: string): never {
  for (const [code, mapped] of Object.entries(COMMAND_ERRORS)) {
    if (matchesPostgresError(error, "P0001", code)) {
      throw Errors.business(mapped.statusCode, mapped.message, code);
    }
  }
  throw Errors.dbError(fallbackMessage);
}

export const wechatVirtualPaymentNotificationRepository =
  new WechatVirtualPaymentNotificationRepository();
