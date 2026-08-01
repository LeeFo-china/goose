import { z } from "zod";

import { Errors } from "@/errors/error-factory";
import { matchesPostgresError } from "@/errors/postgres-error-details";
import { SupabaseDB } from "@/utils/supabase";

type RpcResult = { data: unknown; error: unknown };
type Client = {
  rpc(name: string, parameters: Record<string, unknown>): Promise<RpcResult>;
};

const nullableText = (maximum: number) =>
  z.string().trim().min(1).max(maximum).nullable();
const nullableDateTime = z.iso.datetime({ offset: true }).nullable();

const RefundRecordSchema = z.object({
  id: z.uuid(),
  refund_no: z.string().trim().min(8).max(64),
  order_id: z.uuid(),
  tenant_id: z.uuid(),
  idempotency_key: z.uuid(),
  amount_fen: z.number().int().positive(),
  reason: z.string().trim().min(1).max(500),
  evidence_summary: z.string().max(1_000),
  request_source: z.enum(["platform_admin", "apple_notification"]),
  requested_by: z.uuid().nullable(),
  reviewed_by: z.uuid().nullable(),
  platform_mode: z.enum(["merchant_initiated", "apple_external"]),
  status: z.enum([
    "reviewing", "submitted", "external_required", "succeeded", "failed",
    "rejected",
  ]),
  provider_refund_id: nullableText(128),
  provider_refund_no: nullableText(64).optional().default(null),
  provider_refund_transaction_id: nullableText(128),
  provider_request_id: nullableText(128),
  apple_receipt_hash: z.string().length(64).nullable(),
  purchase_entitlement_event_id: z.uuid(),
  compensation_entitlement_event_id: z.uuid().nullable(),
  provider_refund_started_at: nullableDateTime.optional().default(null),
  provider_refund_succeeded_at: nullableDateTime.optional().default(null),
  submitted_at: nullableDateTime,
  succeeded_at: nullableDateTime,
  failed_at: nullableDateTime,
  rejected_at: nullableDateTime,
  last_error_code: nullableText(100),
  last_error_summary: nullableText(500),
  compensation_status: z.enum(["pending", "succeeded", "failed"]),
  compensation_last_error: nullableText(500),
  reconcile_claim_token: z.uuid().nullable(),
  reconcile_claim_expires_at: nullableDateTime,
  reconcile_attempt_count: z.number().int().nonnegative(),
  reconcile_next_at: nullableDateTime,
  version: z.number().int().positive(),
  created_at: z.iso.datetime({ offset: true }),
  updated_at: z.iso.datetime({ offset: true }),
});

const ListRowSchema = RefundRecordSchema.extend({
  tenant_name: z.string().trim().min(1).max(200),
  out_trade_no: z.string().trim().min(8).max(32),
  requested_platform: z.enum(["android", "harmony", "windows", "ios"]),
  environment: z.enum(["sandbox", "production"]),
  product_name: z.string().trim().min(1).max(100),
  total_count: z.union([z.number().int().nonnegative(), z.string()]),
  count_only: z.boolean(),
});

const CompensationResultSchema = z.object({
  refund_id: z.uuid(),
  compensation_status: z.literal("succeeded"),
  compensation_entitlement_event_id: z.uuid(),
});

const RefundOrderContextSchema = z.object({
  id: z.uuid(),
  tenant_id: z.uuid(),
  out_trade_no: z.string().trim().min(8).max(32),
  environment: z.enum(["sandbox", "production"]),
  requested_platform: z.enum(["android", "harmony", "windows", "ios"]),
  payer_openid: z.string().trim().min(1).max(128),
  provider_order_no: nullableText(128),
  payment_status: z.enum(["pending", "succeeded", "closed", "failed"]),
  fulfillment_status: z.enum(["pending", "granted", "grant_failed"]),
  refund_status: z.enum([
    "none", "reviewing", "submitted", "external_required", "succeeded",
    "failed", "rejected",
  ]),
  amount_fen: z.number().int().positive(),
  paid_amount_fen: z.number().int().nonnegative().nullable(),
  paid_at: nullableDateTime,
  entitlement_event_id: z.uuid().nullable(),
  secret_revision: z.number().int().positive(),
  created_by_user_id: z.uuid(),
});

const RefundDetailSchema = RefundRecordSchema.extend({
  order: z.object({
    out_trade_no: z.string().trim().min(8).max(32),
    requested_platform: z.enum(["android", "harmony", "windows", "ios"]),
    environment: z.enum(["sandbox", "production"]),
    provider_order_no: nullableText(128),
    transaction_id: nullableText(128),
    payment_status: z.enum(["pending", "succeeded", "closed", "failed"]),
    fulfillment_status: z.enum(["pending", "granted", "grant_failed"]),
    refund_status: z.enum([
      "none", "reviewing", "submitted", "external_required", "succeeded",
      "failed", "rejected",
    ]),
    paid_amount_fen: z.number().int().nonnegative().nullable(),
    paid_at: nullableDateTime,
  }),
});

export type BrandingVirtualRefundRecord = z.infer<typeof RefundRecordSchema>;
export type BrandingVirtualRefundStatus = BrandingVirtualRefundRecord["status"];
export type BrandingVirtualRefundOrderContext = z.infer<
  typeof RefundOrderContextSchema
>;

const COMMAND_ERRORS: Record<string, { statusCode: number; message: string }> = {
  BRANDING_VIRTUAL_REFUND_INPUT_INVALID: {
    statusCode: 400,
    message: "虚拟支付退款参数不正确",
  },
  BRANDING_VIRTUAL_REFUND_ACTOR_INVALID: {
    statusCode: 403,
    message: "虚拟支付退款操作人无效",
  },
  BRANDING_VIRTUAL_REFUND_ORDER_NOT_FOUND: {
    statusCode: 404,
    message: "虚拟支付订单不存在",
  },
  BRANDING_VIRTUAL_REFUND_NOT_FOUND: {
    statusCode: 404,
    message: "虚拟支付退款不存在",
  },
  BRANDING_VIRTUAL_REFUND_ORDER_NOT_REFUNDABLE: {
    statusCode: 409,
    message: "当前虚拟支付订单不可退款",
  },
  BRANDING_VIRTUAL_REFUND_ALREADY_EXISTS: {
    statusCode: 409,
    message: "虚拟支付订单已有退款记录",
  },
  BRANDING_VIRTUAL_REFUND_PLATFORM_UNSUPPORTED: {
    statusCode: 409,
    message: "当前支付平台不支持退款",
  },
  BRANDING_VIRTUAL_REFUND_IDEMPOTENCY_CONFLICT: {
    statusCode: 409,
    message: "虚拟支付退款幂等键冲突",
  },
  BRANDING_VIRTUAL_REFUND_STATE_CONFLICT: {
    statusCode: 409,
    message: "虚拟支付退款状态已变化",
  },
  BRANDING_VIRTUAL_REFUND_ORDER_STATE_CONFLICT: {
    statusCode: 409,
    message: "虚拟支付订单退款状态已变化",
  },
  BRANDING_VIRTUAL_REFUND_PROVIDER_CONFLICT: {
    statusCode: 409,
    message: "微信虚拟支付退款标识冲突",
  },
  BRANDING_VIRTUAL_REFUND_NOT_SUCCEEDED: {
    statusCode: 409,
    message: "退款尚未成功，不能补偿权益",
  },
  BRANDING_VIRTUAL_REFUND_ENTITLEMENT_CHAIN_INVALID: {
    statusCode: 409,
    message: "退款权益链路不一致，需要人工处理",
  },
  BRANDING_VIRTUAL_REFUND_REVERSAL_CONFLICT: {
    statusCode: 409,
    message: "退款反向权益事实冲突，需要人工处理",
  },
};

export class BrandingVirtualRefundRepository {
  constructor(
    private readonly clientProvider: () => Client = () =>
      SupabaseDB.getAdminClient() as unknown as Client,
  ) {}

  async create(input: {
    orderId: string;
    idempotencyKey: string;
    reason: string;
    evidenceSummary: string;
    requestedBy: string;
  }): Promise<BrandingVirtualRefundRecord> {
    return this.recordCommand("branding_create_virtual_addon_refund", {
      p_order_id: input.orderId,
      p_idempotency_key: input.idempotencyKey,
      p_reason: input.reason,
      p_evidence_summary: input.evidenceSummary,
      p_requested_by: input.requestedBy,
    }, "创建虚拟支付退款失败");
  }

  async markSubmitted(input: {
    refundId: string;
    claimToken: string;
    providerRefundId: string;
    providerRequestId: string | null;
  }): Promise<BrandingVirtualRefundRecord> {
    return this.recordCommand("branding_mark_virtual_addon_refund_submitted", {
      p_refund_id: input.refundId,
      p_claim_token: input.claimToken,
      p_provider_refund_id: input.providerRefundId,
      p_provider_request_id: input.providerRequestId,
    }, "更新虚拟支付退款提交状态失败");
  }

  async claimSubmission(input: {
    refundId: string;
    leaseSeconds: number;
  }): Promise<{
    refund: BrandingVirtualRefundRecord;
    claimToken: string;
  } | null> {
    const { data, error } = await this.clientProvider().rpc(
      "branding_claim_virtual_addon_refund_submission",
      {
        p_refund_id: input.refundId,
        p_lease_seconds: clamp(input.leaseSeconds, 30, 600),
      },
    );
    if (error) throwCommandError(error, "领取虚拟支付退款提交租约失败");
    const first = firstRow(data);
    if (first === undefined || first === null) return null;
    const parsed = RefundRecordSchema.safeParse(first);
    if (!parsed.success || !parsed.data.reconcile_claim_token) {
      throw Errors.dbError("虚拟支付退款提交租约格式错误");
    }
    return {
      refund: parsed.data,
      claimToken: parsed.data.reconcile_claim_token,
    };
  }

  renewSubmissionClaim(input: {
    refundId: string;
    claimToken: string;
    leaseSeconds: number;
  }): Promise<boolean> {
    return this.booleanCommand(
      "branding_renew_virtual_addon_refund_submission_claim",
      {
        p_refund_id: input.refundId,
        p_claim_token: input.claimToken,
        p_lease_seconds: clamp(input.leaseSeconds, 30, 600),
      },
      "续租虚拟支付退款提交任务失败",
    );
  }

  releaseSubmissionClaim(input: {
    refundId: string;
    claimToken: string;
  }): Promise<boolean> {
    return this.booleanCommand(
      "branding_release_virtual_addon_refund_submission_claim",
      { p_refund_id: input.refundId, p_claim_token: input.claimToken },
      "释放虚拟支付退款提交租约失败",
    );
  }

  async findOrderContext(
    orderId: string,
  ): Promise<BrandingVirtualRefundOrderContext | null> {
    const { data, error } = await this.clientProvider().rpc(
      "branding_get_virtual_refund_order_context",
      { p_order_id: orderId },
    );
    if (error) throwCommandError(error, "查询虚拟支付退款订单失败");
    if (data === null) return null;
    const parsed = RefundOrderContextSchema.safeParse(firstRow(data));
    if (!parsed.success) throw Errors.dbError("虚拟支付退款订单格式错误");
    return parsed.data;
  }

  async findDetail(refundId: string) {
    const { data, error } = await this.clientProvider().rpc(
      "branding_get_virtual_addon_refund_detail",
      { p_refund_id: refundId },
    );
    if (error) throwCommandError(error, "查询虚拟支付退款详情失败");
    if (data === null) return null;
    const parsed = RefundDetailSchema.safeParse(firstRow(data));
    if (!parsed.success) throw Errors.dbError("虚拟支付退款详情格式错误");
    return parsed.data;
  }

  async compensate(input: { refundId: string }): Promise<z.infer<
    typeof CompensationResultSchema
  >> {
    const { data, error } = await this.clientProvider().rpc(
      "branding_compensate_virtual_addon_refund",
      { p_refund_id: input.refundId },
    );
    if (error) throwCommandError(error, "补偿虚拟支付退款权益失败");
    const parsed = CompensationResultSchema.safeParse(firstRow(data));
    if (!parsed.success) throw Errors.dbError("虚拟支付退款补偿结果格式错误");
    return parsed.data;
  }

  async list(input: {
    page: number;
    pageSize: number;
    status?: BrandingVirtualRefundStatus;
    tenantId?: string;
  }) {
    const page = clamp(input.page, 1, Number.MAX_SAFE_INTEGER);
    const pageSize = clamp(input.pageSize, 1, 100);
    const { data, error } = await this.clientProvider().rpc(
      "branding_list_virtual_addon_refunds",
      {
        p_page: page,
        p_page_size: pageSize,
        p_status: input.status ?? null,
        p_tenant_id: input.tenantId ?? null,
      },
    );
    if (error) throwCommandError(error, "查询虚拟支付退款列表失败");
    if (!Array.isArray(data) || data.length > pageSize) {
      throw Errors.dbError("虚拟支付退款列表格式错误");
    }
    const parsed = z.array(ListRowSchema).safeParse(data);
    if (!parsed.success) throw Errors.dbError("虚拟支付退款列表格式错误");
    const totals = new Set(parsed.data.map((row) => parseTotal(row.total_count)));
    if (totals.has(null) || totals.size > 1) {
      throw Errors.dbError("虚拟支付退款列表格式错误");
    }
    const total = totals.values().next().value ?? 0;
    const list = parsed.data.filter((row) => !row.count_only).map((row) => {
      const { total_count: _total, count_only: _countOnly, ...record } = row;
      return record;
    });
    return {
      list,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: total === 0 ? 0 : Math.ceil(total / pageSize),
      },
    };
  }

  private async recordCommand(
    name: string,
    parameters: Record<string, unknown>,
    fallbackMessage: string,
  ): Promise<BrandingVirtualRefundRecord> {
    const { data, error } = await this.clientProvider().rpc(name, parameters);
    if (error) throwCommandError(error, fallbackMessage);
    const parsed = RefundRecordSchema.safeParse(firstRow(data));
    if (!parsed.success) throw Errors.dbError(`${fallbackMessage}：结果格式错误`);
    return parsed.data;
  }

  private async booleanCommand(
    name: string,
    parameters: Record<string, unknown>,
    fallbackMessage: string,
  ): Promise<boolean> {
    const { data, error } = await this.clientProvider().rpc(name, parameters);
    if (error) throwCommandError(error, fallbackMessage);
    const parsed = z.boolean().safeParse(data);
    if (!parsed.success) throw Errors.dbError(`${fallbackMessage}：结果格式错误`);
    return parsed.data;
  }
}

function firstRow(data: unknown): unknown {
  return Array.isArray(data) ? data[0] : data;
}

function parseTotal(value: string | number): number | null {
  if (typeof value === "string" && !/^(0|[1-9]\d*)$/.test(value)) return null;
  const total = Number(value);
  return Number.isSafeInteger(total) && total >= 0 ? total : null;
}

function clamp(value: number, minimum: number, maximum: number): number {
  if (!Number.isFinite(value)) return minimum;
  return Math.min(maximum, Math.max(minimum, Math.floor(value)));
}

function throwCommandError(error: unknown, fallbackMessage: string): never {
  for (const [code, mapped] of Object.entries(COMMAND_ERRORS)) {
    if (matchesPostgresError(error, "P0001", code)) {
      throw Errors.business(mapped.statusCode, mapped.message, code);
    }
  }
  throw Errors.dbError(fallbackMessage, error);
}

export const brandingVirtualRefundRepository =
  new BrandingVirtualRefundRepository();
