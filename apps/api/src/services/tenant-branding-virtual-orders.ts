import { Errors } from "@/errors/error-factory";
import {
  brandingVirtualOrderRepository,
  type BrandingVirtualOrderRecord,
} from "@/repositories/branding-virtual-orders";
import type { BrandingVirtualCreateOrderInput } from "@/schema/branding-addon";
import { accessPolicyService } from "@/services/access-policy";
import type { AuthContext } from "@/services/authorization";
import {
  parseWechatVirtualPaymentSecretBundle,
  WECHAT_VIRTUAL_PAYMENT_SECRET_KEYS,
} from "@/services/branding-virtual-products";
import { systemSettingsService } from "@/services/system-settings";
import {
  wechatMiniSessionCredentialService,
} from "@/services/wechat-mini-session-credentials";
import { buildVirtualPaymentRequest } from "@/services/wechat-virtual-payment-signatures";

const PURCHASE_PERMISSION = "brand.entitlement.purchase";
const TENANT_ADMIN_ROLE = "system_admin";
const SECRET_KEYS = [
  WECHAT_VIRTUAL_PAYMENT_SECRET_KEYS.sandbox,
  WECHAT_VIRTUAL_PAYMENT_SECRET_KEYS.production,
] as const;

type RepositoryPort = Pick<
  typeof brandingVirtualOrderRepository,
  "findProductionMappingId" | "create" | "findTenantOrderById"
>;
type AccessPolicyPort = Pick<
  typeof accessPolicyService,
  "assertTenantContext" | "hasPermission"
>;
type SettingsServicePort = Pick<
  typeof systemSettingsService,
  "getPlatformSecretStrings"
>;
type CredentialServicePort = Pick<
  typeof wechatMiniSessionCredentialService,
  "getActiveForUser"
>;

export type TenantBrandingVirtualOrderServiceDependencies = {
  repository?: RepositoryPort;
  accessPolicy?: AccessPolicyPort;
  settingsService?: SettingsServicePort;
  credentials?: CredentialServicePort;
  nowFactory?: () => Date;
};

export class TenantBrandingVirtualOrderService {
  private readonly repository: RepositoryPort;
  private readonly accessPolicy: AccessPolicyPort;
  private readonly settingsService: SettingsServicePort;
  private readonly credentials: CredentialServicePort;
  private readonly nowFactory: () => Date;

  constructor(
    dependencies: TenantBrandingVirtualOrderServiceDependencies = {},
  ) {
    this.repository = dependencies.repository ?? brandingVirtualOrderRepository;
    this.accessPolicy = dependencies.accessPolicy ?? accessPolicyService;
    this.settingsService = dependencies.settingsService ?? systemSettingsService;
    this.credentials = dependencies.credentials ??
      wechatMiniSessionCredentialService;
    this.nowFactory = dependencies.nowFactory ?? (() => new Date());
  }

  async createOrder(
    authContext: AuthContext,
    input: BrandingVirtualCreateOrderInput,
    payerOpenid: string,
  ) {
    const actor = this.requirePurchaser(authContext);
    const virtualProductId = await this.repository.findProductionMappingId({
      productCode: input.product_code,
    });
    if (!virtualProductId) throw mappingUnavailable();
    const order = await this.repository.create({
      tenantId: actor.tenantId,
      idempotencyKey: input.idempotency_key,
      virtualProductId,
      requestedPlatform: input.requested_platform,
      payerOpenid,
      createdBy: actor.employeeId,
    });
    return {
      order: serializeVirtualOrder(order),
      server_time: this.nowFactory().toISOString(),
    };
  }

  async createPaymentRequest(
    authContext: AuthContext,
    orderId: string,
    payerOpenid: string,
  ) {
    const actor = this.requirePurchaser(authContext);
    const order = await this.repository.findTenantOrderById({
      tenantId: actor.tenantId,
      orderId,
    });
    if (!order) throw orderNotFound();
    assertPayableOrder(order, actor.employeeId, payerOpenid, this.nowFactory());

    const secretValues = await this.settingsService.getPlatformSecretStrings(
      SECRET_KEYS,
    );
    const secretKey = WECHAT_VIRTUAL_PAYMENT_SECRET_KEYS[order.environment];
    const secret = parseWechatVirtualPaymentSecretBundle(
      secretValues[secretKey] ?? "",
    );
    if (!secret || secret.revision !== order.secret_revision) {
      throw secretInvalid();
    }
    const credential = await this.credentials.getActiveForUser({
      userId: actor.authUserId,
      openid: payerOpenid,
    });
    const requestPayload = buildVirtualPaymentRequest({
      environment: order.environment,
      signingSecret: { environment: order.environment, appKey: secret.appKey },
      sessionKey: credential.sessionKey,
      offerId: order.offer_id,
      productId: order.provider_product_id,
      goodsPrice: order.amount_fen,
      outTradeNo: order.out_trade_no,
      attach: order.id,
    });
    return {
      order: serializeVirtualOrder(order),
      payment_request: {
        kind: "wechat_virtual" as const,
        environment: order.environment,
        request_payload: requestPayload,
      },
      server_time: this.nowFactory().toISOString(),
    };
  }

  private requirePurchaser(authContext: AuthContext) {
    const tenantId = this.accessPolicy.assertTenantContext(authContext);
    if (
      !authContext.employeeId ||
      !authContext.authUserId ||
      authContext.isPlatformAdmin ||
      !authContext.roleCodes.includes(TENANT_ADMIN_ROLE) ||
      !this.accessPolicy.hasPermission(authContext, PURCHASE_PERMISSION)
    ) {
      throw Errors.business(
        403,
        "仅当前租户管理员可以购买品牌权益",
        "BRANDING_ENTITLEMENT_PURCHASE_FORBIDDEN",
      );
    }
    return {
      tenantId,
      employeeId: authContext.employeeId,
      authUserId: authContext.authUserId,
    };
  }
}

function assertPayableOrder(
  order: BrandingVirtualOrderRecord,
  employeeId: string,
  payerOpenid: string,
  now: Date,
): void {
  if (order.payer_openid !== payerOpenid) {
    throw Errors.business(409, "该订单已绑定其他付款人", "BRANDING_VIRTUAL_ORDER_PAYER_MISMATCH");
  }
  if (order.created_by !== employeeId) {
    throw Errors.business(409, "该订单已绑定其他操作人", "BRANDING_VIRTUAL_ORDER_ACTOR_MISMATCH");
  }
  if (order.payment_status !== "pending") {
    throw Errors.business(409, "虚拟支付订单不是待支付状态", "BRANDING_VIRTUAL_ORDER_NOT_PENDING");
  }
  const expiresAt = Date.parse(order.payment_expires_at);
  if (!Number.isFinite(expiresAt) || expiresAt <= now.getTime()) {
    throw Errors.business(409, "虚拟支付订单支付时间已结束", "BRANDING_VIRTUAL_ORDER_EXPIRED");
  }
}

function serializeVirtualOrder(order: BrandingVirtualOrderRecord) {
  return {
    id: order.id,
    order_no: order.order_no,
    out_trade_no: order.out_trade_no,
    product_code: order.product_code,
    entitlement_code: order.entitlement_code,
    product_name: order.product_name,
    amount_fen: order.amount_fen,
    term_years: order.term_years,
    purchase_notes: order.purchase_notes,
    refund_policy: order.refund_policy,
    environment: order.environment,
    requested_platform: order.requested_platform,
    payment_status: order.payment_status,
    fulfillment_status: order.fulfillment_status,
    refund_status: order.refund_status,
    payment_expires_at: order.payment_expires_at,
    created_at: order.created_at,
    updated_at: order.updated_at,
  };
}

function mappingUnavailable() {
  return Errors.business(
    409,
    "生产虚拟商品映射不可用",
    "BRANDING_VIRTUAL_PRODUCT_MAPPING_UNAVAILABLE",
  );
}

function orderNotFound() {
  return Errors.business(
    404,
    "品牌权益虚拟支付订单不存在",
    "BRANDING_VIRTUAL_ORDER_NOT_FOUND",
  );
}

function secretInvalid() {
  return Errors.business(
    409,
    "虚拟支付密钥未配置或版本不匹配",
    "BRANDING_VIRTUAL_PAYMENT_SECRET_INVALID",
  );
}

export const tenantBrandingVirtualOrderService =
  new TenantBrandingVirtualOrderService();
