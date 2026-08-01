import { Errors } from "@/errors/error-factory";
import {
  brandingEntitlementOrderQueryRepository,
  type BrandingEntitlementOrderDetail,
  type BrandingEntitlementOrderListInput,
  type BrandingEntitlementOrderListRecord,
} from "@/repositories/branding-entitlement-order-query";
import type {
  BrandingAddonOrderListQuery,
  PlatformBrandingAddonOrderListQuery,
} from "@/schema/branding-addon";
import { accessPolicyService } from "@/services/access-policy";
import type { AuthContext } from "@/services/authorization";

const TENANT_READ_PERMISSION = "brand.entitlement_order.read";
const PLATFORM_READ_PERMISSION = "platform.branding_order.read";

type RepositoryPort = Pick<
  typeof brandingEntitlementOrderQueryRepository,
  "list" | "findDetail"
>;
type AccessPolicyPort = Pick<
  typeof accessPolicyService,
  "assertTenantContext" | "hasPermission" | "assertPermission"
>;

export type BrandingEntitlementOrderQueryServiceDependencies = {
  repository?: RepositoryPort;
  accessPolicy?: AccessPolicyPort;
  nowFactory?: () => Date;
};

export class BrandingEntitlementOrderQueryService {
  private readonly repository: RepositoryPort;
  private readonly accessPolicy: AccessPolicyPort;
  private readonly nowFactory: () => Date;

  constructor(
    dependencies: BrandingEntitlementOrderQueryServiceDependencies = {},
  ) {
    this.repository = dependencies.repository ??
      brandingEntitlementOrderQueryRepository;
    this.accessPolicy = dependencies.accessPolicy ?? accessPolicyService;
    this.nowFactory = dependencies.nowFactory ?? (() => new Date());
  }

  async listTenant(
    authContext: AuthContext,
    query: BrandingAddonOrderListQuery,
  ) {
    const tenantId = this.requireTenantReader(authContext);
    const result = await this.list({
      ...mapCommonFilters(query),
      tenantId,
      page: query.page,
      pageSize: query.pageSize,
    });
    const now = this.nowFactory();
    return {
      ...result,
      list: result.list.map((order) => serializeTenantOrder(order, now)),
      server_time: now.toISOString(),
    };
  }

  async getTenant(authContext: AuthContext, orderId: string) {
    const tenantId = this.requireTenantReader(authContext);
    const detail = await this.findDetail({ tenantId, orderId });
    if (!detail) throw orderNotFound();
    const now = this.nowFactory();
    return {
      order: serializeTenantOrder(detail.order, now, true),
      audit_summary: detail.audit_summary,
      server_time: now.toISOString(),
    };
  }

  async listPlatform(
    authContext: AuthContext,
    query: PlatformBrandingAddonOrderListQuery,
  ) {
    this.requirePlatformReader(authContext);
    const result = await this.list({
      ...mapCommonFilters(query),
      tenantId: query.tenant_id ?? null,
      page: query.page,
      pageSize: query.pageSize,
      createdFrom: query.created_from,
      createdTo: query.created_to,
    });
    return {
      ...result,
      list: result.list.map(serializePlatformListOrder),
    };
  }

  async getPlatform(authContext: AuthContext, orderId: string) {
    this.requirePlatformReader(authContext);
    const detail = await this.findDetail({ tenantId: null, orderId });
    if (!detail) throw orderNotFound();
    return serializePlatformDetail(detail);
  }

  private async list(input: BrandingEntitlementOrderListInput) {
    try {
      return await this.repository.list(input);
    } catch {
      throw Errors.dbError("查询品牌权益订单列表失败");
    }
  }

  private async findDetail(input: { tenantId: string | null; orderId: string }) {
    try {
      return await this.repository.findDetail(input);
    } catch {
      throw Errors.dbError("查询品牌权益订单详情失败");
    }
  }

  private requireTenantReader(authContext: AuthContext): string {
    const tenantId = this.accessPolicy.assertTenantContext(authContext);
    if (
      !authContext.employeeId ||
      !this.accessPolicy.hasPermission(authContext, TENANT_READ_PERMISSION)
    ) throw Errors.forbidden();
    return tenantId;
  }

  private requirePlatformReader(authContext: AuthContext): void {
    if (
      !authContext.isPlatformAdmin ||
      authContext.tenantId !== null ||
      !authContext.employeeId ||
      authContext.employeeStatus !== "active" ||
      !authContext.authUserId
    ) throw Errors.forbidden();
    this.accessPolicy.assertPermission(authContext, PLATFORM_READ_PERMISSION);
  }
}

function mapCommonFilters(query: BrandingAddonOrderListQuery) {
  return {
    paymentChannel: query.payment_channel,
    paymentStatus: query.payment_status ?? mapLegacyStatus(query.status),
    fulfillmentStatus: query.fulfillment_status,
    refundStatus: query.refund_status,
    keyword: query.keyword,
  };
}

function mapLegacyStatus(status: BrandingAddonOrderListQuery["status"]) {
  return status === "paid" ? "succeeded" : status;
}

function serializeTenantOrder(
  order: BrandingEntitlementOrderListRecord |
    BrandingEntitlementOrderDetail["order"],
  now: Date,
  includeDetail = false,
) {
  const compatibilityStatus = toCompatibilityStatus(order.payment_status);
  return {
    id: order.id,
    order_no: order.order_no,
    product_code: order.product_code,
    product_name: order.product_name,
    amount_fen: order.amount_fen,
    term_years: order.term_years,
    status: compatibilityStatus,
    payment_channel: order.payment_channel,
    payment_platform: order.payment_platform,
    payment_status: order.payment_status,
    fulfillment_status: order.fulfillment_status,
    refund_status: order.refund_status,
    paid_at: order.paid_at,
    expires_at: order.payment_expires_at,
    entitlement: serializeEntitlement(order),
    payment_action: buildPaymentAction(order, compatibilityStatus, now),
    created_at: order.created_at,
    updated_at: order.updated_at,
    ...(includeDetail ? serializeTenantDetailFields(order) : {}),
  };
}

function serializeTenantDetailFields(
  order: BrandingEntitlementOrderListRecord |
    BrandingEntitlementOrderDetail["order"],
) {
  if (!("purchase_notes" in order)) return {};
  return {
    purchase_notes: order.purchase_notes,
    refund_policy: order.refund_policy,
    paid_amount_fen: order.paid_amount_fen,
  };
}

function serializeEntitlement(order: BrandingEntitlementOrderListRecord) {
  if (
    order.entitlement_source !== "purchase" ||
    order.entitlement_source_id !== order.id ||
    !order.entitlement_starts_at ||
    !order.entitlement_expires_at ||
    !order.entitlement_status
  ) return null;
  return {
    starts_at: order.entitlement_starts_at,
    expires_at: order.entitlement_expires_at,
    status: order.entitlement_status,
    source: order.entitlement_source,
    order_no: order.order_no,
  };
}

function buildPaymentAction(
  order: BrandingEntitlementOrderListRecord,
  status: "pending" | "paid" | "closed" | "failed",
  now: Date,
) {
  if (status === "paid") {
    return { enabled: false, disabled_reason: "ORDER_ALREADY_PAID" };
  }
  if (status === "closed") {
    return { enabled: false, disabled_reason: "ORDER_CLOSED" };
  }
  if (status === "failed") {
    return { enabled: false, disabled_reason: "ORDER_FAILED" };
  }
  if (order.entitlement_status === "suspended") {
    return { enabled: false, disabled_reason: "ENTITLEMENT_SUSPENDED" };
  }
  if (order.entitlement_status === "revoked") {
    return { enabled: false, disabled_reason: "ENTITLEMENT_REVOKED" };
  }
  const expiresAt = Date.parse(order.payment_expires_at);
  if (!Number.isFinite(expiresAt) || expiresAt <= now.getTime()) {
    return { enabled: false, disabled_reason: "ORDER_PAYMENT_EXPIRED" };
  }
  return { enabled: true, disabled_reason: null };
}

function serializePlatformListOrder(order: BrandingEntitlementOrderListRecord) {
  return {
    id: order.id,
    tenant_id: order.tenant_id,
    order_no: order.order_no,
    product_code: order.product_code,
    product_name: order.product_name,
    amount_fen: order.amount_fen,
    term_years: order.term_years,
    status: toCompatibilityStatus(order.payment_status),
    payment_channel: order.payment_channel,
    payment_platform: order.payment_platform,
    payment_status: order.payment_status,
    fulfillment_status: order.fulfillment_status,
    refund_status: order.refund_status,
    payment_expires_at: order.payment_expires_at,
    paid_at: order.paid_at,
    closed_at: order.closed_at,
    failure_code: order.failure_code,
    created_at: order.created_at,
    updated_at: order.updated_at,
    tenant: {
      id: order.tenant_id,
      name: order.tenant_name,
      slug: order.tenant_slug,
    },
  };
}

function serializePlatformDetail(detail: BrandingEntitlementOrderDetail) {
  const base = serializePlatformListOrder(detail.order);
  const common = {
    ...base,
    out_trade_no: detail.order.out_trade_no,
    entitlement_code: detail.order.entitlement_code,
    purchase_notes: detail.order.purchase_notes,
    refund_policy: detail.order.refund_policy,
    transaction_id: detail.order.transaction_id,
    paid_amount_fen: detail.order.paid_amount_fen,
    failure_message: detail.order.failure_message,
    entitlement_event_id: detail.order.entitlement_event_id,
    created_by: detail.order.created_by,
  };
  const channelFields = detail.payment_channel === "wechat_virtual"
    ? {
      environment: detail.order.environment,
      settlement_channel: detail.order.settlement_channel,
      provider_order_no: detail.order.provider_order_no,
      requested_platform: detail.order.requested_platform,
    }
    : { channel: detail.order.channel };
  return {
    order: { ...common, ...channelFields },
    entitlement: detail.entitlement,
    entitlement_event: detail.entitlement_event,
    audit: detail.audit,
    audit_summary: detail.audit_summary,
  };
}

function toCompatibilityStatus(status: BrandingEntitlementOrderListRecord["payment_status"]) {
  return status === "succeeded" ? "paid" : status;
}

function orderNotFound() {
  return Errors.business(
    404,
    "年度品牌权益订单不存在",
    "BRANDING_ADDON_ORDER_NOT_FOUND",
  );
}

export const brandingEntitlementOrderQueryService =
  new BrandingEntitlementOrderQueryService();
