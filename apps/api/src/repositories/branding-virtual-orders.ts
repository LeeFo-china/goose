import { z } from "zod";

import { Errors } from "@/errors/error-factory";
import { matchesPostgresError } from "@/errors/postgres-error-details";
import { BRANDING_ADDON_PRODUCT_CODE } from "@/services/branding-addon-contracts";
import {
  VIRTUAL_FULFILLMENT_STATUSES,
  VIRTUAL_PAYMENT_ENVIRONMENTS,
  VIRTUAL_PAYMENT_PLATFORMS,
  VIRTUAL_PAYMENT_STATUSES,
  VIRTUAL_REFUND_STATUSES,
  type BrandingVirtualPaymentPlatform,
} from "@/services/branding-virtual-payment-contracts";
import { SupabaseDB } from "@/utils/supabase";

type QueryResult = { data: unknown; error: unknown };
type Query = {
  select(columns: string): Query;
  eq(column: string, value: unknown): Query;
  limit(count: number): Query;
  maybeSingle(): Promise<QueryResult>;
};
type Client = {
  from(
    table: "platform_virtual_payment_products" | "tenant_virtual_addon_orders",
  ): Query;
  rpc(name: string, parameters: Record<string, unknown>): Promise<QueryResult>;
};

const NullableBoundedText = z.string().nullable();
const BrandingVirtualOrderRecordSchema = z.object({
  id: z.uuid(),
  tenant_id: z.uuid(),
  order_no: z.string(),
  out_trade_no: z.string(),
  idempotency_key: z.uuid(),
  product_id: z.uuid(),
  product_code: z.literal(BRANDING_ADDON_PRODUCT_CODE),
  entitlement_code: z.literal("custom_support_branding"),
  product_name: z.string(),
  amount_fen: z.number().int().positive(),
  term_years: z.literal(1),
  purchase_notes: z.string(),
  refund_policy: z.string(),
  environment: z.enum(VIRTUAL_PAYMENT_ENVIRONMENTS),
  offer_id: z.string(),
  provider_product_id: z.string(),
  requested_platform: z.enum(VIRTUAL_PAYMENT_PLATFORMS),
  settlement_channel: z.enum(["wechat", "apple"]).nullable(),
  payer_openid: z.string(),
  provider_order_no: NullableBoundedText,
  transaction_id: NullableBoundedText,
  payment_status: z.enum(VIRTUAL_PAYMENT_STATUSES),
  fulfillment_status: z.enum(VIRTUAL_FULFILLMENT_STATUSES),
  refund_status: z.enum(VIRTUAL_REFUND_STATUSES),
  paid_amount_fen: z.number().int().nonnegative().nullable(),
  paid_at: z.string().nullable(),
  entitlement_event_id: z.uuid().nullable(),
  config_version: z.number().int().positive(),
  secret_revision: z.number().int().positive(),
  payment_expires_at: z.string(),
  failure_code: NullableBoundedText,
  failure_message: NullableBoundedText,
  payment_request_claim_token: z.uuid().nullable(),
  payment_request_claimed_at: z.string().nullable(),
  payment_request_claim_expires_at: z.string().nullable(),
  payment_request_issued_at: z.string().nullable(),
  payment_request_attempt_revision: z.number().int().nonnegative(),
  created_by: z.uuid(),
  created_at: z.string(),
  updated_at: z.string(),
});

export type BrandingVirtualOrderRecord = z.infer<
  typeof BrandingVirtualOrderRecordSchema
>;

const BrandingVirtualPurchaseConfirmationResultSchema = z.object({
  idempotent: z.boolean(),
  payment_recorded: z.boolean(),
  fulfilled: z.boolean(),
  recoverable: z.boolean(),
  entitlement_event_id: z.uuid().nullable(),
  entitlement_status: z.enum(["active", "suspended", "expired", "revoked"])
    .nullable(),
  failure_code: z.string().nullable(),
});

export type BrandingVirtualPurchaseConfirmationResult = z.infer<
  typeof BrandingVirtualPurchaseConfirmationResultSchema
>;

const ORDER_COLUMNS = [
  "id", "tenant_id", "order_no", "out_trade_no", "idempotency_key",
  "product_id", "product_code", "entitlement_code", "product_name",
  "amount_fen", "term_years", "purchase_notes", "refund_policy",
  "environment", "offer_id", "provider_product_id", "requested_platform",
  "settlement_channel", "payer_openid", "provider_order_no", "transaction_id",
  "payment_status", "fulfillment_status", "refund_status", "paid_amount_fen",
  "paid_at", "entitlement_event_id", "config_version", "secret_revision",
  "payment_expires_at", "failure_code", "failure_message", "created_by",
  "payment_request_claim_token", "payment_request_claimed_at",
  "payment_request_claim_expires_at", "payment_request_issued_at",
  "payment_request_attempt_revision",
  "created_at", "updated_at",
].join(",");

const ProductionMappingSchema = z.object({
  id: z.uuid(),
  environment: z.literal("production"),
  secret_revision: z.number().int().positive(),
});

export type BrandingVirtualOrderProductionMapping = z.infer<
  typeof ProductionMappingSchema
>;

type CreateInput = {
  tenantId: string;
  idempotencyKey: string;
  virtualProductId: string;
  requestedPlatform: BrandingVirtualPaymentPlatform;
  payerOpenid: string;
  createdBy: string;
};

export class BrandingVirtualOrderRepository {
  constructor(
    private readonly clientProvider: () => Client = () =>
      SupabaseDB.getAdminClient() as unknown as Client,
  ) {}

  async findProductionMapping(input: {
    productCode: typeof BRANDING_ADDON_PRODUCT_CODE;
  }): Promise<BrandingVirtualOrderProductionMapping | null> {
    const { data, error } = await this.clientProvider()
      .from("platform_virtual_payment_products")
      .select("id,environment,secret_revision,platform_addon_products!inner(code)")
      .eq("environment", "production")
      .eq("platform_addon_products.code", input.productCode)
      .limit(1)
      .maybeSingle();
    if (error) throw Errors.dbError("查询品牌权益虚拟商品映射失败");
    if (data === null) return null;
    const parsed = ProductionMappingSchema.safeParse(data);
    if (!parsed.success) {
      throw Errors.dbError("查询品牌权益虚拟商品映射失败");
    }
    return parsed.data;
  }

  async findProductionMappingId(input: {
    productCode: typeof BRANDING_ADDON_PRODUCT_CODE;
  }): Promise<string | null> {
    return (await this.findProductionMapping(input))?.id ?? null;
  }

  async create(input: CreateInput): Promise<BrandingVirtualOrderRecord> {
    const { data, error } = await this.clientProvider().rpc(
      "branding_create_virtual_addon_order",
      {
        p_tenant_id: input.tenantId,
        p_idempotency_key: input.idempotencyKey,
        p_virtual_product_id: input.virtualProductId,
        p_requested_platform: input.requestedPlatform,
        p_payer_openid: input.payerOpenid,
        p_created_by: input.createdBy,
      },
    );
    if (error) throwCreateError(error);
    return parseOrder(data, "创建品牌权益虚拟支付订单失败");
  }

  async findTenantOrderById(input: {
    tenantId: string;
    orderId: string;
  }): Promise<BrandingVirtualOrderRecord | null> {
    const { data, error } = await this.clientProvider()
      .from("tenant_virtual_addon_orders")
      .select(ORDER_COLUMNS)
      .eq("tenant_id", input.tenantId)
      .eq("id", input.orderId)
      .limit(1)
      .maybeSingle();
    if (error) throw Errors.dbError("查询品牌权益虚拟支付订单失败");
    return data === null
      ? null
      : parseOrder(data, "查询品牌权益虚拟支付订单失败");
  }

  async findTenantOrderByIdempotencyKey(input: {
    tenantId: string;
    idempotencyKey: string;
  }): Promise<BrandingVirtualOrderRecord | null> {
    const { data, error } = await this.clientProvider()
      .from("tenant_virtual_addon_orders")
      .select(ORDER_COLUMNS)
      .eq("tenant_id", input.tenantId)
      .eq("idempotency_key", input.idempotencyKey)
      .limit(1)
      .maybeSingle();
    if (error) throw Errors.dbError("查询品牌权益虚拟支付订单失败");
    return data === null
      ? null
      : parseOrder(data, "查询品牌权益虚拟支付订单失败");
  }

  async findByOutTradeNo(
    outTradeNo: string,
  ): Promise<BrandingVirtualOrderRecord | null> {
    const { data, error } = await this.clientProvider()
      .from("tenant_virtual_addon_orders")
      .select(ORDER_COLUMNS)
      .eq("out_trade_no", outTradeNo)
      .limit(1)
      .maybeSingle();
    if (error) throw Errors.dbError("查询品牌权益虚拟支付订单失败");
    return data === null
      ? null
      : parseOrder(data, "查询品牌权益虚拟支付订单失败");
  }

  async confirmPurchase(input: {
    orderId: string;
    notificationId: string | null;
    source: "notification" | "query" | "reconciliation";
    allowLateClosedRecovery: boolean;
    eventType: "xpay_goods_deliver_notify" | "query_order";
    successful: true;
    environment: "sandbox" | "production";
    recipientOriginalId: string | null;
    senderIdHash: string | null;
    providerCreatedAtUnix: number | null;
    messageType: "event" | null;
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
  }): Promise<BrandingVirtualPurchaseConfirmationResult> {
    const { data, error } = await this.clientProvider().rpc(
      "branding_confirm_virtual_addon_purchase",
      {
        p_order_id: input.orderId,
        p_notification_id: input.notificationId,
        p_source: input.source,
        p_allow_late_closed_recovery: input.allowLateClosedRecovery,
        p_event_type: input.eventType,
        p_recipient_original_id: input.recipientOriginalId,
        p_sender_id_hash: input.senderIdHash,
        p_provider_created_at: input.providerCreatedAtUnix,
        p_msg_type: input.messageType,
        p_successful_state: input.successful,
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
    );
    if (error) throwConfirmationError(error);
    const parsed = BrandingVirtualPurchaseConfirmationResultSchema.safeParse(
      Array.isArray(data) ? data[0] : data,
    );
    if (!parsed.success) {
      throw Errors.dbError("确认品牌权益虚拟支付履约失败");
    }
    return parsed.data;
  }

  async claimPaymentRequest(input: {
    tenantId: string;
    orderId: string;
    payerOpenid: string;
    createdBy: string;
  }): Promise<BrandingVirtualOrderRecord> {
    return this.paymentRequestCommand(
      "branding_claim_virtual_addon_payment_request",
      {
        p_tenant_id: input.tenantId,
        p_order_id: input.orderId,
        p_payer_openid: input.payerOpenid,
        p_created_by: input.createdBy,
      },
      "获取虚拟支付请求签发租约失败",
    );
  }

  async finalizePaymentRequest(input: {
    tenantId: string;
    orderId: string;
    payerOpenid: string;
    createdBy: string;
    claimToken: string;
  }): Promise<BrandingVirtualOrderRecord> {
    return this.paymentRequestCommand(
      "branding_finalize_virtual_addon_payment_request",
      {
        p_tenant_id: input.tenantId,
        p_order_id: input.orderId,
        p_payer_openid: input.payerOpenid,
        p_created_by: input.createdBy,
        p_claim_token: input.claimToken,
      },
      "确认虚拟支付请求签发失败",
    );
  }

  async releasePaymentRequestClaim(input: {
    tenantId: string;
    orderId: string;
    payerOpenid: string;
    createdBy: string;
    claimToken: string;
  }): Promise<BrandingVirtualOrderRecord> {
    return this.paymentRequestCommand(
      "branding_release_virtual_addon_payment_request_claim",
      {
        p_tenant_id: input.tenantId,
        p_order_id: input.orderId,
        p_payer_openid: input.payerOpenid,
        p_created_by: input.createdBy,
        p_claim_token: input.claimToken,
      },
      "释放虚拟支付请求签发租约失败",
    );
  }

  private async paymentRequestCommand(
    functionName: string,
    parameters: Record<string, unknown>,
    fallbackMessage: string,
  ): Promise<BrandingVirtualOrderRecord> {
    const { data, error } = await this.clientProvider().rpc(
      functionName,
      parameters,
    );
    if (error) throwVirtualOrderCommandError(error, fallbackMessage);
    return parseOrder(data, fallbackMessage);
  }
}

const CREATE_ERRORS: Record<string, { statusCode: number; message: string }> = {
  BRANDING_VIRTUAL_ORDER_INPUT_INVALID: { statusCode: 400, message: "虚拟支付订单参数不正确" },
  BRANDING_VIRTUAL_PRODUCT_NOT_FOUND: { statusCode: 404, message: "年度品牌权益商品不存在" },
  BRANDING_VIRTUAL_ORDER_PAYER_MISMATCH: { statusCode: 409, message: "该订单已绑定其他付款人" },
  BRANDING_VIRTUAL_ORDER_ACTOR_MISMATCH: { statusCode: 409, message: "该订单已绑定其他操作人" },
  BRANDING_VIRTUAL_PURCHASE_MODE_UNAVAILABLE: { statusCode: 409, message: "年度品牌权益当前不可使用虚拟支付" },
  BRANDING_VIRTUAL_PRODUCT_DISABLED: { statusCode: 409, message: "年度品牌权益商品未启用" },
  BRANDING_VIRTUAL_PRODUCT_MAPPING_UNAVAILABLE: { statusCode: 409, message: "生产虚拟商品映射不可用" },
  BRANDING_VIRTUAL_PRODUCT_AMOUNT_MISMATCH: { statusCode: 409, message: "虚拟商品价格与年度权益价格不一致" },
  BRANDING_VIRTUAL_PRODUCT_AMOUNT_TOO_LOW: { statusCode: 409, message: "虚拟商品价格低于微信要求" },
  BRANDING_VIRTUAL_ORDER_CONFLICT: { statusCode: 409, message: "虚拟支付订单状态冲突，请刷新后重试" },
  BRANDING_ENTITLEMENT_SUSPENDED: { statusCode: 409, message: "品牌权益已暂停，不能购买或续费" },
  BRANDING_ENTITLEMENT_REVOKED: { statusCode: 409, message: "品牌权益已撤销，不能购买或续费" },
  BRANDING_VIRTUAL_ORDER_NOT_FOUND: { statusCode: 404, message: "品牌权益虚拟支付订单不存在" },
  BRANDING_VIRTUAL_ORDER_NOT_PENDING: { statusCode: 409, message: "虚拟支付订单不是待支付状态" },
  BRANDING_VIRTUAL_ORDER_EXPIRED: { statusCode: 409, message: "虚拟支付订单支付时间已结束" },
  BRANDING_VIRTUAL_PAYMENT_REQUEST_IN_PROGRESS: { statusCode: 409, message: "虚拟支付请求正在生成，请稍后重试" },
  BRANDING_VIRTUAL_PAYMENT_RECONCILIATION_REQUIRED: { statusCode: 409, message: "订单支付结果确认中，请稍后查询" },
  BRANDING_VIRTUAL_PAYMENT_REQUEST_CLAIM_INVALID: { statusCode: 409, message: "虚拟支付请求签发租约已失效" },
  BRANDING_VIRTUAL_ORDER_CONFIG_CHANGED: { statusCode: 409, message: "虚拟支付配置已变化，请重新发起购买" },
};

const CONFIRMATION_ERRORS: Record<
  string,
  { statusCode: number; message: string }
> = {
  BRANDING_VIRTUAL_CONFIRM_INPUT_INVALID: { statusCode: 400, message: "虚拟支付确认参数不正确" },
  BRANDING_VIRTUAL_ORDER_NOT_FOUND: { statusCode: 404, message: "品牌权益虚拟支付订单不存在" },
  BRANDING_VIRTUAL_PAYMENT_OPENID_MISMATCH: { statusCode: 409, message: "虚拟支付付款人与订单不一致" },
  BRANDING_VIRTUAL_PAYMENT_OUT_TRADE_NO_MISMATCH: { statusCode: 409, message: "虚拟支付商户订单号不一致" },
  BRANDING_VIRTUAL_PAYMENT_PRODUCT_MISMATCH: { statusCode: 409, message: "虚拟支付商品不一致" },
  BRANDING_VIRTUAL_PAYMENT_QUANTITY_MISMATCH: { statusCode: 409, message: "虚拟支付商品数量不一致" },
  BRANDING_VIRTUAL_PAYMENT_AMOUNT_MISMATCH: { statusCode: 409, message: "虚拟支付金额不一致" },
  BRANDING_VIRTUAL_PAYMENT_ENVIRONMENT_MISMATCH: { statusCode: 409, message: "虚拟支付环境不一致" },
  BRANDING_VIRTUAL_PAYMENT_TRANSACTION_CONFLICT: { statusCode: 409, message: "虚拟支付交易标识冲突" },
  BRANDING_VIRTUAL_PAYMENT_PROVIDER_ORDER_CONFLICT: { statusCode: 409, message: "虚拟支付平台订单标识冲突" },
  BRANDING_VIRTUAL_PAYMENT_CURRENCY_MISMATCH: { statusCode: 409, message: "虚拟支付币种不一致" },
  BRANDING_VIRTUAL_PAYMENT_ATTACH_MISMATCH: { statusCode: 409, message: "虚拟支付订单绑定信息不一致" },
  BRANDING_VIRTUAL_PAYMENT_STATE_INVALID: { statusCode: 409, message: "虚拟支付成功状态不正确" },
  BRANDING_VIRTUAL_PAYMENT_ORDER_STATUS_INVALID: { statusCode: 409, message: "虚拟支付订单状态不支持确认" },
  BRANDING_VIRTUAL_PAYMENT_LATE_UNISSUED_ORDER: { statusCode: 409, message: "未签发订单出现支付成功事实" },
  BRANDING_VIRTUAL_NOTIFICATION_MISMATCH: { statusCode: 409, message: "虚拟支付消息与订单不一致" },
};

function throwCreateError(error: unknown): never {
  for (const [code, mapped] of Object.entries(CREATE_ERRORS)) {
    if (matchesPostgresError(error, "P0001", code)) {
      throw Errors.business(mapped.statusCode, mapped.message, code);
    }
  }
  throw Errors.dbError("创建品牌权益虚拟支付订单失败");
}

function throwVirtualOrderCommandError(
  error: unknown,
  fallbackMessage: string,
): never {
  for (const [code, mapped] of Object.entries(CREATE_ERRORS)) {
    if (matchesPostgresError(error, "P0001", code)) {
      throw Errors.business(mapped.statusCode, mapped.message, code);
    }
  }
  throw Errors.dbError(fallbackMessage);
}

function throwConfirmationError(error: unknown): never {
  for (const [code, mapped] of Object.entries(CONFIRMATION_ERRORS)) {
    if (matchesPostgresError(error, "P0001", code)) {
      throw Errors.business(mapped.statusCode, mapped.message, code);
    }
  }
  throw Errors.dbError("确认品牌权益虚拟支付履约失败");
}

function parseOrder(data: unknown, message: string): BrandingVirtualOrderRecord {
  const row = Array.isArray(data) ? data[0] : data;
  const parsed = BrandingVirtualOrderRecordSchema.safeParse(row);
  if (!parsed.success) throw Errors.dbError(message);
  return parsed.data;
}

export const brandingVirtualOrderRepository =
  new BrandingVirtualOrderRepository();
