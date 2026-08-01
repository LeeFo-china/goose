import { z } from "zod";

import { Errors } from "@/errors/error-factory";
import { matchesPostgresError } from "@/errors/postgres-error-details";

type QueryResult = { data: unknown; error: unknown };
type ReconciliationClient = {
  rpc(name: string, parameters: Record<string, unknown>): Promise<QueryResult>;
};

const isoDateTime = z.iso.datetime({ offset: true });
const nullableDateTime = isoDateTime.nullable();
const nullableText = (maximum: number) => z.string().trim().min(1)
  .max(maximum).nullable();
const officialStatus = z.number().int().min(0).max(10).nullable();

const ReconciliationClaimSchema = z.object({
  id: z.uuid(),
  tenant_id: z.uuid(),
  out_trade_no: z.string().trim().min(1).max(32),
  environment: z.enum(["sandbox", "production"]),
  offer_id: z.string().trim().min(1).max(128),
  provider_product_id: z.string().trim().min(1).max(128),
  payer_openid: z.string().trim().min(1).max(128),
  amount_fen: z.number().int().min(100),
  provider_order_no: nullableText(128),
  transaction_id: nullableText(128),
  payment_status: z.enum(["pending", "succeeded", "failed", "closed"]),
  fulfillment_status: z.enum(["pending", "granted", "grant_failed"]),
  paid_amount_fen: z.number().int().nonnegative().nullable(),
  paid_at: nullableDateTime,
  payment_expires_at: isoDateTime,
  payment_request_issued_at: nullableDateTime,
  entitlement_event_id: z.uuid().nullable(),
  reconcile_claim_token: z.uuid(),
  reconcile_claim_expires_at: isoDateTime,
  reconcile_attempt_count: z.number().int().nonnegative(),
  reconcile_last_error_code: nullableText(100),
  reconcile_last_error: nullableText(1_000),
  reconcile_next_at: nullableDateTime,
  reconcile_last_checked_at: nullableDateTime,
  reconcile_last_provider_status: officialStatus,
  reconcile_query_provider_order_no: nullableText(128),
  reconcile_query_transaction_id: nullableText(128),
  reconcile_query_paid_amount_fen: z.number().int().min(100).nullable(),
  reconcile_query_paid_at: nullableDateTime,
  provider_delivery_status: z.enum([
    "not_required", "pending", "succeeded", "failed",
  ]),
  provider_delivery_attempt_count: z.number().int().nonnegative(),
  provider_delivery_attempt_key: z.uuid().nullable(),
  provider_delivery_last_error_code: nullableText(100),
  provider_delivery_last_error: nullableText(500),
  provider_delivery_provided_at: nullableDateTime,
  provider_delivery_request_id: nullableText(128),
});

export type BrandingVirtualPaymentReconciliationClaim = z.infer<
  typeof ReconciliationClaimSchema
>;

export type BrandingVirtualOfficialStatus =
  | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

export class BrandingVirtualPaymentReconciliationRepository {
  constructor(
    private readonly reconciliationClientProvider: () => ReconciliationClient,
  ) {}

  async claimReconciliationBatch(input: {
    limit: number;
    leaseSeconds: number;
  }): Promise<BrandingVirtualPaymentReconciliationClaim[]> {
    const { data, error } = await this.reconciliationClientProvider().rpc(
      "branding_claim_virtual_payment_reconciliation_batch",
      {
        p_limit: clampInteger(input.limit, 1, 100),
        p_lease_seconds: clampInteger(input.leaseSeconds, 30, 600),
      },
    );
    if (error) throwReconciliationError(error, "领取虚拟支付补偿任务失败");
    if (!Array.isArray(data) || data.length > 100) {
      throw Errors.dbError("虚拟支付补偿任务格式不正确");
    }
    return data.map(parseReconciliationClaim);
  }

  async rescheduleReconciliation(input: {
    orderId: string;
    claimToken: string;
    nextAt: string;
    officialStatus: BrandingVirtualOfficialStatus | null;
    errorCode: string | null;
    errorSummary: string | null;
  }): Promise<boolean> {
    return this.reconciliationBooleanCommand(
      "branding_reschedule_virtual_payment_reconciliation",
      {
        p_order_id: input.orderId,
        p_claim_token: input.claimToken,
        p_next_at: input.nextAt,
        p_official_status: input.officialStatus,
        p_error_code: sanitizeText(input.errorCode, 100),
        p_error_summary: sanitizeText(input.errorSummary, 500),
      },
      "重排虚拟支付补偿任务失败",
    );
  }

  async closeUnpaidReconciliation(input: {
    orderId: string;
    claimToken: string;
    officialStatus: 0 | 1 | 6;
  }): Promise<boolean> {
    return this.reconciliationBooleanCommand(
      "branding_close_unpaid_virtual_payment_reconciliation",
      {
        p_order_id: input.orderId,
        p_claim_token: input.claimToken,
        p_official_status: input.officialStatus,
      },
      "关闭未支付虚拟支付补偿任务失败",
    );
  }

  async prepareSuccessfulQueryReconciliation(input: {
    orderId: string;
    claimToken: string;
    officialStatus: 2 | 3 | 4;
    environment: "sandbox" | "production";
    openid: string;
    outTradeNo: string;
    providerProductId: string;
    quantity: 1;
    currency: "CNY" | null;
    origPriceFen: number;
    actualPriceFen: number;
    providerOrderNo: string;
    transactionId: string;
    paidAt: string;
    attach: string;
  }): Promise<boolean> {
    return this.reconciliationBooleanCommand(
      "branding_prepare_successful_query_reconciliation",
      {
        p_order_id: input.orderId,
        p_claim_token: input.claimToken,
        p_official_status: input.officialStatus,
        p_environment: input.environment,
        p_openid: input.openid,
        p_out_trade_no: input.outTradeNo,
        p_provider_product_id: input.providerProductId,
        p_quantity: input.quantity,
        p_currency: input.currency,
        p_orig_price_fen: input.origPriceFen,
        p_actual_price_fen: input.actualPriceFen,
        p_provider_order_no: input.providerOrderNo,
        p_transaction_id: input.transactionId,
        p_paid_at: input.paidAt,
        p_attach: input.attach,
      },
      "准备虚拟支付查询补偿失败",
    );
  }

  async finalizeReconciliationAfterConfirmation(input: {
    orderId: string;
    claimToken: string;
    officialStatus: 2 | 3 | 4 | null;
    providerOrderNo: string | null;
    transactionId: string | null;
    paidAmountFen: number | null;
    paidAt: string | null;
    deliveryAttemptKey: string | null;
  }): Promise<boolean> {
    return this.reconciliationBooleanCommand(
      "branding_finalize_virtual_payment_reconciliation",
      {
        p_order_id: input.orderId,
        p_claim_token: input.claimToken,
        p_official_status: input.officialStatus,
        p_provider_order_no: input.providerOrderNo,
        p_transaction_id: input.transactionId,
        p_paid_amount_fen: input.paidAmountFen,
        p_paid_at: input.paidAt,
        p_delivery_attempt_key: input.deliveryAttemptKey,
      },
      "完成虚拟支付补偿确认失败",
    );
  }

  async markReconciliationDelivery(input: {
    orderId: string;
    claimToken: string;
    status: "succeeded" | "failed";
    attemptKey: string;
    providerRequestId: string | null;
    errorCode: string | null;
    errorSummary: string | null;
  }): Promise<boolean> {
    return this.reconciliationBooleanCommand(
      "branding_mark_virtual_payment_delivery",
      {
        p_order_id: input.orderId,
        p_claim_token: input.claimToken,
        p_delivery_status: input.status,
        p_attempt_key: input.attemptKey,
        p_provider_request_id: sanitizeText(input.providerRequestId, 128),
        p_error_code: sanitizeText(input.errorCode, 100),
        p_error_summary: sanitizeText(input.errorSummary, 500),
      },
      "更新虚拟支付发货通知状态失败",
    );
  }

  private async reconciliationBooleanCommand(
    functionName: string,
    parameters: Record<string, unknown>,
    fallbackMessage: string,
  ): Promise<boolean> {
    const { data, error } = await this.reconciliationClientProvider().rpc(
      functionName,
      parameters,
    );
    if (error) throwReconciliationError(error, fallbackMessage);
    const parsed = z.boolean().safeParse(data);
    if (!parsed.success) throw Errors.dbError(fallbackMessage);
    return parsed.data;
  }
}

const RECONCILIATION_ERRORS: Record<
  string,
  { statusCode: number; message: string }
> = {
  BRANDING_VIRTUAL_RECONCILIATION_INPUT_INVALID: {
    statusCode: 400, message: "虚拟支付补偿参数不正确",
  },
  BRANDING_VIRTUAL_RECONCILIATION_CLAIM_INVALID: {
    statusCode: 409, message: "虚拟支付补偿租约已失效",
  },
  BRANDING_VIRTUAL_RECONCILIATION_STATE_INVALID: {
    statusCode: 409, message: "虚拟支付订单状态不支持当前补偿操作",
  },
  BRANDING_VIRTUAL_RECONCILIATION_OFFICIAL_STATUS_INVALID: {
    statusCode: 400, message: "虚拟支付官方状态不支持当前操作",
  },
  BRANDING_VIRTUAL_RECONCILIATION_FACTS_MISMATCH: {
    statusCode: 409, message: "虚拟支付确认事实不一致",
  },
  BRANDING_VIRTUAL_DELIVERY_STATE_INVALID: {
    statusCode: 409, message: "虚拟支付发货通知状态冲突",
  },
  BRANDING_VIRTUAL_DELIVERY_REQUEST_INVALID: {
    statusCode: 400, message: "虚拟支付发货通知请求参数不正确",
  },
};

function throwReconciliationError(error: unknown, fallback: string): never {
  for (const [code, mapped] of Object.entries(RECONCILIATION_ERRORS)) {
    if (matchesPostgresError(error, "P0001", code)) {
      throw Errors.business(mapped.statusCode, mapped.message, code);
    }
  }
  throw Errors.dbError(fallback);
}

function parseReconciliationClaim(
  data: unknown,
): BrandingVirtualPaymentReconciliationClaim {
  const parsed = ReconciliationClaimSchema.safeParse(data);
  if (!parsed.success) throw Errors.dbError("虚拟支付补偿任务格式不正确");
  return parsed.data;
}

function clampInteger(value: number, minimum: number, maximum: number): number {
  if (!Number.isFinite(value)) return minimum;
  return Math.max(minimum, Math.min(Math.floor(value), maximum));
}

function sanitizeText(value: string | null, maximum: number): string | null {
  if (value === null) return null;
  const sanitized = value.trim().slice(0, maximum);
  return sanitized === "" ? null : sanitized;
}
