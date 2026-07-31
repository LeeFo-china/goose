import { z } from "zod";

import { Errors } from "@/errors/error-factory";
import { SupabaseDB } from "@/utils/supabase";

type QueryResult = { data: unknown; error: unknown };
type QueryBuilder = {
  select(columns: string): QueryBuilder;
  eq(column: string, value: unknown): QueryBuilder;
  neq(column: string, value: unknown): QueryBuilder;
  limit(count: number): QueryBuilder;
  maybeSingle(): Promise<QueryResult>;
  single(): Promise<QueryResult>;
  insert(values: Record<string, unknown>): QueryBuilder;
  update(values: Record<string, unknown>): QueryBuilder;
};
type Client = {
  from(table: "wechat_virtual_payment_notifications"): QueryBuilder;
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

export type WechatVirtualPaymentNotificationRecord = z.infer<
  typeof NotificationRecordSchema
>;

const NOTIFICATION_COLUMNS = [
  "id",
  "event_key",
  "payload_sha256",
  "status",
  "order_id",
  "retry_count",
  "result_summary",
].join(",");

export class WechatVirtualPaymentNotificationRepository {
  constructor(
    private readonly clientProvider: () => Client = () =>
      SupabaseDB.getAdminClient() as unknown as Client,
  ) {}

  async createOrGet(input: {
    eventKey: string;
    eventType: "xpay_goods_deliver_notify";
    environment: "sandbox" | "production";
    outTradeNo: string;
    providerProductId: string;
    openidHash: string;
    normalizedPayload: Record<string, unknown>;
    payloadSha256: string;
    requestId: string | null;
  }): Promise<{
    created: boolean;
    record: WechatVirtualPaymentNotificationRecord;
  }> {
    const table = this.clientProvider().from(
      "wechat_virtual_payment_notifications",
    );
    const { data, error } = await table.insert({
      event_key: input.eventKey,
      event_type: input.eventType,
      environment: input.environment,
      out_trade_no: input.outTradeNo,
      provider_product_id: input.providerProductId,
      openid_hash: input.openidHash,
      authentication_method: "wechat_plaintext_sha1",
      authentication_status: "verified",
      normalized_payload: input.normalizedPayload,
      payload_sha256: input.payloadSha256,
      status: "processing",
      request_id: input.requestId,
    }).select(NOTIFICATION_COLUMNS).single();
    if (!error) {
      return { created: true, record: parseRecord(data) };
    }
    if (readPostgresCode(error) !== "23505") {
      throw Errors.dbError("保存微信虚拟支付消息失败");
    }

    const existing = await this.findByEventKey(input.eventKey);
    if (!existing) throw Errors.dbError("读取重复微信虚拟支付消息失败");
    return { created: false, record: existing };
  }

  async findByEventKey(
    eventKey: string,
  ): Promise<WechatVirtualPaymentNotificationRecord | null> {
    const { data, error } = await this.clientProvider()
      .from("wechat_virtual_payment_notifications")
      .select(NOTIFICATION_COLUMNS)
      .eq("event_key", eventKey)
      .limit(1)
      .maybeSingle();
    if (error) throw Errors.dbError("查询微信虚拟支付消息失败");
    return data === null ? null : parseRecord(data);
  }

  async markProcessed(input: {
    notificationId: string;
    orderId: string;
    resultSummary: Record<string, unknown>;
  }): Promise<void> {
    const { error } = await this.clientProvider()
      .from("wechat_virtual_payment_notifications")
      .update({
        order_id: input.orderId,
        status: "processed",
        result_summary: input.resultSummary,
        last_error_code: null,
        last_error_summary: null,
        processed_at: new Date().toISOString(),
      })
      .eq("id", input.notificationId)
      .neq("status", "processed")
      .select("id")
      .maybeSingle();
    if (error) throw Errors.dbError("完成微信虚拟支付消息处理失败");
  }

  async markFailed(input: {
    notificationId: string;
    orderId: string | null;
    retryCount: number;
    errorCode: string;
    errorSummary: string;
  }): Promise<void> {
    const { error } = await this.clientProvider()
      .from("wechat_virtual_payment_notifications")
      .update({
        order_id: input.orderId,
        status: "failed",
        retry_count: input.retryCount + 1,
        last_error_code: input.errorCode.slice(0, 100),
        last_error_summary: input.errorSummary.slice(0, 500),
        processed_at: null,
      })
      .eq("id", input.notificationId)
      .neq("status", "processed")
      .select("id")
      .maybeSingle();
    if (error) throw Errors.dbError("记录微信虚拟支付消息失败状态失败");
  }
}

function parseRecord(data: unknown): WechatVirtualPaymentNotificationRecord {
  const parsed = NotificationRecordSchema.safeParse(data);
  if (!parsed.success) throw Errors.dbError("微信虚拟支付消息数据格式错误");
  return parsed.data;
}

function readPostgresCode(error: unknown): string | null {
  if (!error || typeof error !== "object") return null;
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : null;
}

export const wechatVirtualPaymentNotificationRepository =
  new WechatVirtualPaymentNotificationRepository();
