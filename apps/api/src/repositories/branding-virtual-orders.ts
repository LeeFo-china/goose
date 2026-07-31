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
  created_by: z.uuid(),
  created_at: z.string(),
  updated_at: z.string(),
});

export type BrandingVirtualOrderRecord = z.infer<
  typeof BrandingVirtualOrderRecordSchema
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
  "created_at", "updated_at",
].join(",");

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

  async findProductionMappingId(input: {
    productCode: typeof BRANDING_ADDON_PRODUCT_CODE;
  }): Promise<string | null> {
    const { data, error } = await this.clientProvider()
      .from("platform_virtual_payment_products")
      .select("id,platform_addon_products!inner(code)")
      .eq("environment", "production")
      .eq("platform_addon_products.code", input.productCode)
      .limit(1)
      .maybeSingle();
    if (error) throw Errors.dbError("查询品牌权益虚拟商品映射失败");
    if (data === null) return null;
    const parsed = z.object({ id: z.uuid() }).safeParse(data);
    if (!parsed.success) {
      throw Errors.dbError("查询品牌权益虚拟商品映射失败");
    }
    return parsed.data.id;
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
};

function throwCreateError(error: unknown): never {
  for (const [code, mapped] of Object.entries(CREATE_ERRORS)) {
    if (matchesPostgresError(error, "P0001", code)) {
      throw Errors.business(mapped.statusCode, mapped.message, code);
    }
  }
  throw Errors.dbError("创建品牌权益虚拟支付订单失败");
}

function parseOrder(data: unknown, message: string): BrandingVirtualOrderRecord {
  const row = Array.isArray(data) ? data[0] : data;
  const parsed = BrandingVirtualOrderRecordSchema.safeParse(row);
  if (!parsed.success) throw Errors.dbError(message);
  return parsed.data;
}

export const brandingVirtualOrderRepository =
  new BrandingVirtualOrderRepository();
