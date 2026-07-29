import { Errors } from "@/errors/error-factory";
import {
  brandingAddonOrderRepository,
  type PlatformBrandingAddonOrderAuditRecord,
  type PlatformBrandingAddonOrderDetailRecord,
  type PlatformBrandingAddonOrderListRecord,
} from "@/repositories/branding-addon-orders";
import type {
  PlatformBrandingAddonOrderListQuery,
} from "@/schema/branding-addon";
import { accessPolicyService } from "@/services/access-policy";
import type { AuthContext } from "@/services/authorization";

const READ_PERMISSION = "platform.branding_order.read";

type OrderRepositoryPort = Pick<
  typeof brandingAddonOrderRepository,
  "listPlatformOrders" | "findPlatformOrderAuditById"
>;

type AccessPolicyPort = Pick<
  typeof accessPolicyService,
  "assertPermission"
>;

export type PlatformBrandingAddonOrdersServiceDependencies = {
  repository?: OrderRepositoryPort;
  accessPolicy?: AccessPolicyPort;
};

export class PlatformBrandingAddonOrdersService {
  private readonly repository: OrderRepositoryPort;
  private readonly accessPolicy: AccessPolicyPort;

  constructor(
    dependencies: PlatformBrandingAddonOrdersServiceDependencies = {},
  ) {
    this.repository = dependencies.repository ?? brandingAddonOrderRepository;
    this.accessPolicy = dependencies.accessPolicy ?? accessPolicyService;
  }

  async list(
    authContext: AuthContext,
    query: PlatformBrandingAddonOrderListQuery,
  ) {
    this.requirePlatformReader(authContext);
    try {
      const result = await this.repository.listPlatformOrders({
        page: query.page,
        pageSize: query.pageSize,
        tenantId: query.tenant_id,
        status: query.status,
        keyword: query.keyword,
        createdFrom: query.created_from,
        createdTo: query.created_to,
      });
      return {
        ...result,
        list: result.list.map(serializeListOrder),
      };
    } catch {
      throw Errors.dbError("查询平台品牌权益订单失败");
    }
  }

  async get(authContext: AuthContext, orderId: string) {
    this.requirePlatformReader(authContext);
    let result: PlatformBrandingAddonOrderAuditRecord | null;
    try {
      result = await this.repository.findPlatformOrderAuditById(orderId);
    } catch {
      throw Errors.dbError("查询平台品牌权益订单审计详情失败");
    }
    if (!result) {
      throw Errors.business(
        404,
        "年度品牌权益订单不存在",
        "BRANDING_ADDON_ORDER_NOT_FOUND",
      );
    }
    return serializeDetail(result);
  }

  private requirePlatformReader(authContext: AuthContext): void {
    if (
      !authContext.isPlatformAdmin ||
      authContext.tenantId !== null ||
      !authContext.employeeId ||
      authContext.employeeStatus !== "active" ||
      !authContext.authUserId
    ) {
      throw Errors.forbidden();
    }
    this.accessPolicy.assertPermission(authContext, READ_PERMISSION);
  }
}

function serializeListOrder(order: PlatformBrandingAddonOrderListRecord) {
  return {
    id: order.id,
    tenant_id: order.tenant_id,
    order_no: order.order_no,
    product_code: order.product_code,
    product_name: order.product_name,
    amount_fen: order.amount_fen,
    term_years: order.term_years,
    status: order.status,
    payment_expires_at: order.payment_expires_at,
    paid_at: order.paid_at,
    closed_at: order.closed_at,
    failure_code: order.failure_code,
    created_at: order.created_at,
    updated_at: order.updated_at,
    tenant: serializeTenant(order.tenant),
  };
}

function serializeDetail(result: PlatformBrandingAddonOrderAuditRecord) {
  return {
    order: serializeDetailOrder(result.order),
    entitlement: result.entitlement
      ? {
        starts_at: result.entitlement.starts_at,
        expires_at: result.entitlement.expires_at,
        status: result.entitlement.status,
        source: result.entitlement.source,
        order_no: result.entitlement.order_no,
      }
      : null,
    entitlement_event: result.entitlement_event
      ? {
        id: result.entitlement_event.id,
        event_type: result.entitlement_event.event_type,
        source_type: result.entitlement_event.source_type,
        source_id: result.entitlement_event.source_id,
        reason: result.entitlement_event.reason,
        created_at: result.entitlement_event.created_at,
      }
      : null,
    audit: result.audit
      ? {
        id: result.audit.id,
        action: result.audit.action,
        status: result.audit.status,
        summary: result.audit.summary,
        created_at: result.audit.created_at,
      }
      : null,
  };
}

function serializeDetailOrder(order: PlatformBrandingAddonOrderDetailRecord) {
  return {
    id: order.id,
    tenant_id: order.tenant_id,
    order_no: order.order_no,
    out_trade_no: order.out_trade_no,
    product_code: order.product_code,
    entitlement_code: order.entitlement_code,
    product_name: order.product_name,
    amount_fen: order.amount_fen,
    term_years: order.term_years,
    purchase_notes: order.purchase_notes,
    refund_policy: order.refund_policy,
    status: order.status,
    channel: order.channel,
    payment_expires_at: order.payment_expires_at,
    transaction_id: order.transaction_id,
    paid_amount_fen: order.paid_amount_fen,
    paid_at: order.paid_at,
    closed_at: order.closed_at,
    failure_code: order.failure_code,
    failure_message: order.failure_message,
    entitlement_event_id: order.entitlement_event_id,
    created_by: order.created_by,
    created_at: order.created_at,
    updated_at: order.updated_at,
    tenant: serializeTenant(order.tenant),
  };
}

function serializeTenant(
  tenant: PlatformBrandingAddonOrderListRecord["tenant"],
) {
  return tenant
    ? {
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
    }
    : null;
}

export const platformBrandingAddonOrdersService =
  new PlatformBrandingAddonOrdersService();
