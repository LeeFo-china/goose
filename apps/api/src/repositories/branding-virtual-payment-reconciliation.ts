import { z } from "zod";

import { Errors } from "@/errors/error-factory";
import { matchesPostgresError } from "@/errors/postgres-error-details";

import {
  BrandingVirtualOrderRecordSchema,
  NullableBoundedText,
} from "./branding-virtual-order-record";

type QueryResult = { data: unknown; error: unknown };
type ReconciliationClient = {
  rpc(name: string, parameters: Record<string, unknown>): Promise<QueryResult>;
};

const ReconciliationClaimSchema = BrandingVirtualOrderRecordSchema.extend({
  reconcile_claim_token: z.uuid(),
  reconcile_claim_expires_at: z.string(),
  reconcile_attempt_count: z.number().int().nonnegative(),
  reconcile_last_error_code: NullableBoundedText,
  reconcile_last_error: NullableBoundedText,
  reconcile_next_at: z.string().nullable(),
  reconcile_last_checked_at: z.string().nullable(),
  reconcile_last_provider_status: z.union([
    z.literal(0), z.literal(1), z.literal(6),
  ]).nullable(),
  provider_delivery_status: z.enum([
    "not_required", "pending", "succeeded", "failed",
  ]),
  provider_delivery_attempt_count: z.number().int().nonnegative(),
  provider_delivery_last_error_code: NullableBoundedText,
  provider_delivery_last_error: NullableBoundedText,
  provider_delivery_notified_at: z.string().nullable(),
  provider_delivery_request_id: NullableBoundedText,
});

export type BrandingVirtualPaymentReconciliationClaim = z.infer<
  typeof ReconciliationClaimSchema
>;

type CompleteReconciliationInput = {
  orderId: string;
  claimToken: string;
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
  deliveryRequestId: string | null;
};

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
    errorCode: string | null;
    errorSummary: string | null;
  }): Promise<boolean> {
    return this.reconciliationBooleanCommand(
      "branding_reschedule_virtual_payment_reconciliation",
      {
        p_order_id: input.orderId,
        p_claim_token: input.claimToken,
        p_next_at: input.nextAt,
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

  async completeReconciliation(
    input: CompleteReconciliationInput,
  ): Promise<boolean> {
    return this.reconciliationBooleanCommand(
      "branding_complete_virtual_payment_reconciliation",
      {
        p_order_id: input.orderId,
        p_claim_token: input.claimToken,
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
        p_delivery_request_id: input.deliveryRequestId,
      },
      "完成虚拟支付补偿确认失败",
    );
  }

  async markReconciliationDelivery(input: {
    orderId: string;
    claimToken: string;
    status: "pending" | "succeeded" | "failed";
    requestId: string;
    errorCode: string | null;
    errorSummary: string | null;
  }): Promise<boolean> {
    return this.reconciliationBooleanCommand(
      "branding_mark_virtual_payment_delivery",
      {
        p_order_id: input.orderId,
        p_claim_token: input.claimToken,
        p_delivery_status: input.status,
        p_request_id: sanitizeText(input.requestId, 128),
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
    statusCode: 400, message: "虚拟支付官方状态不支持关闭订单",
  },
  BRANDING_VIRTUAL_DELIVERY_STATE_INVALID: {
    statusCode: 409, message: "虚拟支付发货通知状态冲突",
  },
  BRANDING_VIRTUAL_DELIVERY_REQUEST_INVALID: {
    statusCode: 400, message: "虚拟支付发货通知请求参数不正确",
  },
};

const CONFIRMATION_ERROR_STATUS: Record<string, number> = {
  BRANDING_VIRTUAL_CONFIRM_INPUT_INVALID: 400,
  BRANDING_VIRTUAL_ORDER_NOT_FOUND: 404,
  BRANDING_VIRTUAL_PAYMENT_OPENID_MISMATCH: 409,
  BRANDING_VIRTUAL_PAYMENT_OUT_TRADE_NO_MISMATCH: 409,
  BRANDING_VIRTUAL_PAYMENT_PRODUCT_MISMATCH: 409,
  BRANDING_VIRTUAL_PAYMENT_QUANTITY_MISMATCH: 409,
  BRANDING_VIRTUAL_PAYMENT_AMOUNT_MISMATCH: 409,
  BRANDING_VIRTUAL_PAYMENT_ENVIRONMENT_MISMATCH: 409,
  BRANDING_VIRTUAL_PAYMENT_TRANSACTION_CONFLICT: 409,
  BRANDING_VIRTUAL_PAYMENT_PROVIDER_ORDER_CONFLICT: 409,
  BRANDING_VIRTUAL_PAYMENT_CURRENCY_MISMATCH: 409,
  BRANDING_VIRTUAL_PAYMENT_ATTACH_MISMATCH: 409,
  BRANDING_VIRTUAL_PAYMENT_STATE_INVALID: 409,
  BRANDING_VIRTUAL_PAYMENT_ORDER_STATUS_INVALID: 409,
  BRANDING_VIRTUAL_PAYMENT_LATE_UNISSUED_ORDER: 409,
  BRANDING_VIRTUAL_NOTIFICATION_MISMATCH: 409,
};

function throwReconciliationError(error: unknown, fallback: string): never {
  for (const [code, mapped] of Object.entries(RECONCILIATION_ERRORS)) {
    if (matchesPostgresError(error, "P0001", code)) {
      throw Errors.business(mapped.statusCode, mapped.message, code);
    }
  }
  for (const [code, statusCode] of Object.entries(CONFIRMATION_ERROR_STATUS)) {
    if (matchesPostgresError(error, "P0001", code)) {
      throw Errors.business(statusCode, "虚拟支付补偿确认失败", code);
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
