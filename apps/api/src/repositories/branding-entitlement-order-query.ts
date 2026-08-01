import { z } from "zod";

import { Errors } from "@/errors/error-factory";
import { BRANDING_ADDON_PRODUCT_CODE } from "@/services/branding-addon-contracts";
import {
  VIRTUAL_FULFILLMENT_STATUSES,
  VIRTUAL_PAYMENT_PLATFORMS,
  VIRTUAL_PAYMENT_STATUSES,
  VIRTUAL_REFUND_STATUSES,
} from "@/services/branding-virtual-payment-contracts";
import { SupabaseDB } from "@/utils/supabase";

const PaymentChannelSchema = z.enum(["legacy_direct", "wechat_virtual"]);
const EntitlementStatusSchema = z.enum([
  "active",
  "suspended",
  "expired",
  "revoked",
]);
const NullableTextSchema = z.string().nullable();

const ListRowSchema = z.object({
  payment_channel: PaymentChannelSchema,
  payment_platform: z.enum(VIRTUAL_PAYMENT_PLATFORMS),
  payment_status: z.enum(VIRTUAL_PAYMENT_STATUSES),
  fulfillment_status: z.enum(VIRTUAL_FULFILLMENT_STATUSES),
  refund_status: z.enum(VIRTUAL_REFUND_STATUSES),
  id: z.uuid(),
  tenant_id: z.uuid(),
  order_no: z.string(),
  product_code: z.literal(BRANDING_ADDON_PRODUCT_CODE),
  product_name: z.string(),
  amount_fen: z.number().int().nonnegative(),
  term_years: z.number().int().positive(),
  payment_expires_at: z.string(),
  paid_at: NullableTextSchema,
  closed_at: NullableTextSchema,
  failure_code: NullableTextSchema,
  created_at: z.string(),
  updated_at: z.string(),
  tenant_name: NullableTextSchema,
  tenant_slug: NullableTextSchema,
  entitlement_starts_at: NullableTextSchema,
  entitlement_expires_at: NullableTextSchema,
  entitlement_status: EntitlementStatusSchema.nullable(),
  entitlement_source: z.enum(["manual_grant", "purchase"]).nullable(),
  entitlement_source_id: z.uuid().nullable(),
  total_count: z.union([z.number().int().nonnegative(), z.string()]),
});

export type BrandingEntitlementOrderListRecord = Omit<
  z.infer<typeof ListRowSchema>,
  "total_count"
>;

const DetailOrderSchema = ListRowSchema.omit({ total_count: true }).extend({
  out_trade_no: z.string(),
  entitlement_code: z.literal("custom_support_branding"),
  purchase_notes: z.string(),
  refund_policy: z.string(),
  paid_amount_fen: z.number().int().nonnegative().nullable(),
  failure_message: NullableTextSchema,
  entitlement_event_id: z.uuid().nullable(),
  created_by: z.uuid(),
  channel: z.literal("wechat_pay").optional(),
  environment: z.enum(["sandbox", "production"]).optional(),
  settlement_channel: z.enum(["wechat", "apple"]).nullable().optional(),
  provider_order_no: NullableTextSchema.optional(),
  transaction_id: NullableTextSchema,
  requested_platform: z.enum(VIRTUAL_PAYMENT_PLATFORMS).optional(),
});

const EntitlementSchema = z.object({
  starts_at: z.string(),
  expires_at: z.string(),
  status: EntitlementStatusSchema,
  source: z.enum(["manual_grant", "purchase"]),
  order_no: z.string().nullable(),
}).nullable();

const EntitlementEventSchema = z.object({
  id: z.uuid(),
  event_type: z.enum([
    "granted", "renewed", "suspended", "resumed", "expired", "revoked",
  ]),
  source_type: z.enum(["manual_grant", "purchase", "system"]),
  source_id: z.uuid().nullable(),
  reason: NullableTextSchema,
  created_at: z.string(),
}).nullable();

const AuditSchema = z.object({
  id: z.uuid(),
  action: z.string(),
  status: z.enum(["success", "failure"]),
  summary: NullableTextSchema,
  created_at: z.string(),
}).nullable();

const AuditSummarySchema = z.object({
  source: z.enum(["legacy_order", "virtual_order"]),
  payment_status: z.enum(VIRTUAL_PAYMENT_STATUSES),
  fulfillment_status: z.enum(VIRTUAL_FULFILLMENT_STATUSES),
  refund_status: z.enum(VIRTUAL_REFUND_STATUSES),
  failure_code: NullableTextSchema.optional(),
  failure_message: NullableTextSchema.optional(),
  updated_at: z.string().optional(),
});

const DetailSchema = z.object({
  payment_channel: PaymentChannelSchema,
  order: DetailOrderSchema,
  entitlement: EntitlementSchema,
  entitlement_event: EntitlementEventSchema,
  audit: AuditSchema,
  audit_summary: AuditSummarySchema,
});

export type BrandingEntitlementOrderDetail = z.infer<typeof DetailSchema>;

type QueryResult = { data: unknown; error: unknown };
type Client = {
  rpc(name: string, parameters: Record<string, unknown>): Promise<QueryResult>;
};

export type BrandingEntitlementOrderListInput = {
  tenantId: string | null;
  page: number;
  pageSize: number;
  paymentChannel?: "legacy_direct" | "wechat_virtual";
  paymentStatus?: "pending" | "succeeded" | "closed" | "failed";
  fulfillmentStatus?: "pending" | "granted" | "grant_failed";
  refundStatus?: "none" | "reviewing" | "submitted" | "external_required" |
    "succeeded" | "failed" | "rejected";
  keyword?: string;
  createdFrom?: string;
  createdTo?: string;
};

export class BrandingEntitlementOrderQueryRepository {
  constructor(
    private readonly clientProvider: () => Client = () =>
      SupabaseDB.getAdminClient() as unknown as Client,
  ) {}

  async list(input: BrandingEntitlementOrderListInput) {
    const page = Math.max(1, Math.floor(input.page));
    const pageSize = Math.min(100, Math.max(1, Math.floor(input.pageSize)));
    const { data, error } = await this.clientProvider().rpc(
      "branding_list_entitlement_orders",
      {
        p_tenant_id: input.tenantId,
        p_page: page,
        p_page_size: pageSize,
        p_payment_channel: input.paymentChannel ?? null,
        p_payment_status: input.paymentStatus ?? null,
        p_fulfillment_status: input.fulfillmentStatus ?? null,
        p_refund_status: input.refundStatus ?? null,
        p_keyword: input.keyword ?? null,
        p_created_from: input.createdFrom ?? null,
        p_created_to: input.createdTo ?? null,
      },
    );
    if (error) throw Errors.dbError("查询品牌权益订单列表失败");
    const parsed = z.array(ListRowSchema).safeParse(data ?? []);
    if (!parsed.success) throw Errors.dbError("查询品牌权益订单列表失败");
    const total = parseTotal(parsed.data[0]?.total_count);
    return {
      list: parsed.data.map(({ total_count: _totalCount, ...row }) => row),
      pagination: {
        page,
        pageSize,
        total,
        totalPages: total === 0 ? 0 : Math.ceil(total / pageSize),
      },
    };
  }

  async findDetail(input: { tenantId: string | null; orderId: string }) {
    const { data, error } = await this.clientProvider().rpc(
      "branding_get_entitlement_order_detail",
      { p_tenant_id: input.tenantId, p_order_id: input.orderId },
    );
    if (error) throw Errors.dbError("查询品牌权益订单详情失败");
    if (data === null) return null;
    const parsed = DetailSchema.safeParse(data);
    if (!parsed.success) throw Errors.dbError("查询品牌权益订单详情失败");
    return parsed.data;
  }
}

function parseTotal(value: number | string | undefined): number {
  if (value === undefined) return 0;
  const total = Number(value);
  return Number.isSafeInteger(total) && total >= 0 ? total : 0;
}

export const brandingEntitlementOrderQueryRepository =
  new BrandingEntitlementOrderQueryRepository();
