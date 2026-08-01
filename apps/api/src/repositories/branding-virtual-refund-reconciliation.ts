import { z } from "zod";

import { Errors } from "@/errors/error-factory";
import { SupabaseDB } from "@/utils/supabase";

type Client = { rpc(name: string, input: Record<string, unknown>): Promise<{
  data: unknown; error: unknown;
}> };

const ClaimSchema = z.object({
  refund_id: z.uuid(), order_id: z.uuid(), claim_token: z.uuid(),
  claim_expires_at: z.iso.datetime({ offset: true }),
  attempt_count: z.number().int().positive(),
  refund_status: z.enum(["submitted", "external_required", "succeeded"]),
  compensation_status: z.enum(["pending", "failed", "succeeded"]),
  platform_mode: z.enum(["merchant_initiated", "apple_external"]),
  out_trade_no: z.string().min(8).max(32), payer_openid: z.string().min(1).max(128),
  environment: z.enum(["sandbox", "production"]),
  secret_revision: z.number().int().positive(), amount_fen: z.number().int().positive(),
  provider_order_no: z.string().min(1).max(128).nullable(),
});
export type BrandingVirtualRefundReconciliationClaim = z.infer<typeof ClaimSchema>;
const FinalizedSchema = z.object({
  id: z.uuid(), status: z.enum(["succeeded", "failed"]),
  compensation_status: z.enum(["pending", "failed", "succeeded"]),
  reconcile_claim_token: z.uuid().nullable(),
});

export class BrandingVirtualRefundReconciliationRepository {
  constructor(private readonly clientProvider: () => Client = () =>
    SupabaseDB.getAdminClient() as unknown as Client) {}

  async claim(input: { limit: number; leaseSeconds: number }) {
    const { data, error } = await this.clientProvider().rpc(
      "branding_claim_virtual_refund_reconciliation_batch",
      { p_limit: clamp(input.limit, 1, 100), p_lease_seconds: clamp(input.leaseSeconds, 30, 600) },
    );
    if (error || !Array.isArray(data) || data.length > 100) {
      throw Errors.dbError("领取虚拟支付退款对账任务失败");
    }
    const parsed = z.array(ClaimSchema).safeParse(data);
    if (!parsed.success) throw Errors.dbError("虚拟支付退款对账任务格式错误");
    return parsed.data;
  }

  async finalize(input: {
    refundId: string; claimToken: string; officialStatus: 5 | 7 | 8;
    refundFeeFen: number; leftFeeFen: number;
  }): Promise<void> {
    const { data, error } = await this.clientProvider().rpc(
      "branding_finalize_virtual_refund_reconciliation",
      {
        p_refund_id: input.refundId, p_claim_token: input.claimToken,
        p_official_status: input.officialStatus,
        p_refund_fee_fen: input.refundFeeFen, p_left_fee_fen: input.leftFeeFen,
      },
    );
    if (error) throw Errors.dbError("完成虚拟支付退款对账失败");
    const parsed = FinalizedSchema.safeParse(Array.isArray(data) ? data[0] : data);
    const expectedStatus = input.officialStatus === 7 ? "failed" : "succeeded";
    const claimValid = expectedStatus === "succeeded"
      ? parsed.success && parsed.data.reconcile_claim_token === input.claimToken
      : parsed.success && parsed.data.reconcile_claim_token === null;
    if (!parsed.success || parsed.data.id !== input.refundId
      || parsed.data.status !== expectedStatus || !claimValid) {
      throw Errors.dbError("虚拟支付退款对账结果格式错误");
    }
  }

  async reschedule(input: {
    refundId: string; claimToken: string; nextAt: string;
    errorCode: string; errorSummary: string;
  }): Promise<void> {
    const { data, error } = await this.clientProvider().rpc(
      "branding_reschedule_virtual_refund_reconciliation",
      {
        p_refund_id: input.refundId, p_claim_token: input.claimToken,
        p_next_at: input.nextAt, p_error_code: input.errorCode.slice(0, 100),
        p_error_summary: input.errorSummary.slice(0, 500),
      },
    );
    if (error || data !== true) throw Errors.dbError("重排虚拟支付退款对账失败");
  }

  async markConflict(input: {
    refundId: string; claimToken: string; errorCode: string;
  }): Promise<void> {
    const { data, error } = await this.clientProvider().rpc(
      "branding_mark_virtual_refund_reconciliation_conflict",
      { p_refund_id: input.refundId, p_claim_token: input.claimToken,
        p_error_code: input.errorCode.slice(0, 100) },
    );
    if (error || data !== true) throw Errors.dbError("标记虚拟支付退款终态冲突失败");
  }
}

function clamp(value: number, minimum: number, maximum: number): number {
  if (!Number.isFinite(value)) return minimum;
  return Math.min(maximum, Math.max(minimum, Math.trunc(value)));
}

export const brandingVirtualRefundReconciliationRepository =
  new BrandingVirtualRefundReconciliationRepository();
