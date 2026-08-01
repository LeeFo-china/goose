import { z } from "zod";

import { Errors } from "@/errors/error-factory";
import { SupabaseDB } from "@/utils/supabase";

type Client = { rpc(name: string, input: Record<string, unknown>): Promise<{
  data: unknown;
  error: unknown;
}> };

const ProviderResultSchema = z.object({
  notification_id: z.uuid(),
  refund_id: z.uuid(),
  refund_status: z.enum(["succeeded", "failed"]),
  compensation_status: z.enum(["pending", "succeeded", "failed"]),
});
const InquiryResultSchema = z.object({
  notification_id: z.uuid(),
  result_code: z.union([z.literal(0), z.literal(1)]),
  result_info: z.string().min(1).max(100),
  evidence: z.string().min(1).max(500),
});

export class BrandingVirtualRefundNotificationRepository {
  constructor(private readonly clientProvider: () => Client = () =>
    SupabaseDB.getAdminClient() as unknown as Client) {}

  async processProviderNotification(input: {
    recipientOriginalId: string; senderIdHash: string;
    providerCreatedAtUnix: number; outTradeNo: string; openidHash: string;
    localRefundNo: string; providerOrderId: string; providerRefundId: string;
    providerRefundTransactionId: string; refundFeeFen: number;
    successful: boolean; providerResultCode: number;
    providerResultMessage: string; refundStartedAt: string;
    refundSucceededAt: string | null; retryTimes: number;
    requestId: string | null;
  }) {
    const { data, error } = await this.clientProvider().rpc(
      "branding_process_virtual_refund_notification",
      {
        p_recipient_original_id: input.recipientOriginalId,
        p_sender_id_hash: input.senderIdHash,
        p_provider_created_at: input.providerCreatedAtUnix,
        p_out_trade_no: input.outTradeNo,
        p_openid_hash: input.openidHash,
        p_local_refund_no: input.localRefundNo,
        p_provider_order_id: input.providerOrderId,
        p_provider_refund_id: input.providerRefundId,
        p_provider_refund_transaction_id: input.providerRefundTransactionId,
        p_refund_fee_fen: input.refundFeeFen,
        p_successful: input.successful,
        p_provider_result_code: input.providerResultCode,
        p_provider_result_message: input.providerResultMessage,
        p_refund_started_at: input.refundStartedAt,
        p_refund_succeeded_at: input.refundSucceededAt,
        p_retry_times: input.retryTimes,
        p_request_id: input.requestId,
      },
    );
    if (error) throw Errors.dbError("处理微信虚拟支付退款通知失败");
    const parsed = ProviderResultSchema.safeParse(firstRow(data));
    if (!parsed.success) throw Errors.dbError("微信虚拟支付退款通知结果格式错误");
    return parsed.data;
  }

  async processIosInquiry(input: {
    recipientOriginalId: string; senderIdHash: string;
    providerCreatedAtUnix: number; outTradeNo: string; refundTime: string;
    orderTime: string; channelBillHash: string; bundleId: string;
    providerProductId: string; quantity: number; refundRequestReason: string;
    provideStatus: number; requestId: string | null;
  }) {
    const { data, error } = await this.clientProvider().rpc(
      "branding_process_virtual_ios_refund_inquiry",
      {
        p_recipient_original_id: input.recipientOriginalId,
        p_sender_id_hash: input.senderIdHash,
        p_provider_created_at: input.providerCreatedAtUnix,
        p_out_trade_no: input.outTradeNo,
        p_refund_time: input.refundTime,
        p_order_time: input.orderTime,
        p_channel_bill_hash: input.channelBillHash,
        p_bundle_id: input.bundleId,
        p_provider_product_id: input.providerProductId,
        p_quantity: input.quantity,
        p_refund_request_reason: input.refundRequestReason,
        p_provide_status: input.provideStatus,
        p_request_id: input.requestId,
      },
    );
    if (error) throw Errors.dbError("处理 Apple 退款问询失败");
    const parsed = InquiryResultSchema.safeParse(firstRow(data));
    if (!parsed.success) throw Errors.dbError("Apple 退款问询结果格式错误");
    return parsed.data;
  }
}

function firstRow(value: unknown): unknown {
  return Array.isArray(value) ? value[0] : value;
}

export const brandingVirtualRefundNotificationRepository =
  new BrandingVirtualRefundNotificationRepository();
