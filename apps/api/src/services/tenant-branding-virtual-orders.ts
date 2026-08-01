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

type RepositoryPort = Pick<
  typeof brandingVirtualOrderRepository,
  | "findTenantOrderByIdempotencyKey"
  | "findProductionMapping"
  | "create"
  | "claimPaymentRequest"
  | "finalizePaymentRequest"
  | "releasePaymentRequestClaim"
>;
type AccessPolicyPort = Pick<
  typeof accessPolicyService,
  "assertTenantContext" | "hasPermission"
>;
type SettingsServicePort = Pick<
  typeof systemSettingsService,
  "getPlatformSecretString"
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
    const replayInput = {
      tenantId: actor.tenantId,
      idempotencyKey: input.idempotency_key,
    };
    const existing = await this.repository.findTenantOrderByIdempotencyKey(
      replayInput,
    );
    if (existing) {
      assertReplayIdentity(existing, actor.employeeId, payerOpenid);
      return createOrderResult(existing, this.nowFactory());
    }

    let mapping: Awaited<ReturnType<RepositoryPort["findProductionMapping"]>>;
    try {
      mapping = await this.repository.findProductionMapping({
        productCode: input.product_code,
      });
    } catch (error) {
      const replay = await this.replayAfterPreflightFailure(
        replayInput,
        actor.employeeId,
        payerOpenid,
        error,
      );
      return createOrderResult(replay, this.nowFactory());
    }
    if (!mapping) {
      const replay = await this.replayAfterPreflightFailure(
        replayInput,
        actor.employeeId,
        payerOpenid,
        mappingUnavailable(),
      );
      return createOrderResult(replay, this.nowFactory());
    }
    try {
      await this.requireBoundSecret(mapping.environment, mapping.secret_revision);
    } catch (error) {
      const replay = await this.replayAfterPreflightFailure(
        replayInput,
        actor.employeeId,
        payerOpenid,
        error,
      );
      return createOrderResult(replay, this.nowFactory());
    }
    const order = await this.repository.create({
      tenantId: actor.tenantId,
      idempotencyKey: input.idempotency_key,
      virtualProductId: mapping.id,
      requestedPlatform: input.requested_platform,
      payerOpenid,
      createdBy: actor.employeeId,
    });
    return createOrderResult(order, this.nowFactory());
  }

  async createPaymentRequest(
    authContext: AuthContext,
    orderId: string,
    payerOpenid: string,
  ) {
    const actor = this.requirePurchaser(authContext);
    const order = await this.repository.claimPaymentRequest({
      tenantId: actor.tenantId,
      orderId,
      payerOpenid,
      createdBy: actor.employeeId,
    });
    if (order.payment_status === "closed") throw orderExpired();
    const claimToken = order.payment_request_claim_token;
    if (!claimToken) throw claimInvalid();

    try {
      const secret = await this.requireBoundSecret(
        order.environment,
        order.secret_revision,
      );
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
      const finalized = await this.repository.finalizePaymentRequest({
        tenantId: actor.tenantId,
        orderId,
        payerOpenid,
        createdBy: actor.employeeId,
        claimToken,
      });
      if (
        finalized.payment_status === "closed" ||
        !finalized.payment_request_issued_at
      ) throw orderExpired();
      return {
        order: serializeVirtualOrder(finalized),
        payment_request: {
          kind: "wechat_virtual" as const,
          environment: finalized.environment,
          request_payload: requestPayload,
        },
        server_time: this.nowFactory().toISOString(),
      };
    } catch (error) {
      await this.releaseClaimBestEffort({
        tenantId: actor.tenantId,
        orderId,
        payerOpenid,
        createdBy: actor.employeeId,
        claimToken,
      });
      throw error;
    }
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

  private async requireBoundSecret(
    environment: BrandingVirtualOrderRecord["environment"],
    expectedRevision: number,
  ) {
    const key = WECHAT_VIRTUAL_PAYMENT_SECRET_KEYS[environment];
    const value = await this.settingsService.getPlatformSecretString(key);
    const secret = parseWechatVirtualPaymentSecretBundle(value);
    if (!secret || secret.revision !== expectedRevision) throw secretInvalid();
    return secret;
  }

  private async releaseClaimBestEffort(
    input: Parameters<RepositoryPort["releasePaymentRequestClaim"]>[0],
  ): Promise<void> {
    try {
      await this.repository.releasePaymentRequestClaim(input);
    } catch {
      // The short database lease recovers a process crash or release failure.
    }
  }

  private async replayAfterPreflightFailure(
    input: Parameters<RepositoryPort["findTenantOrderByIdempotencyKey"]>[0],
    employeeId: string,
    payerOpenid: string,
    originalError: unknown,
  ): Promise<BrandingVirtualOrderRecord> {
    let existing: BrandingVirtualOrderRecord | null;
    try {
      existing = await this.repository.findTenantOrderByIdempotencyKey(input);
    } catch {
      throw originalError;
    }
    if (!existing) throw originalError;
    assertReplayIdentity(existing, employeeId, payerOpenid);
    return existing;
  }
}

function createOrderResult(order: BrandingVirtualOrderRecord, now: Date) {
  return {
    order: serializeVirtualOrder(order),
    server_time: now.toISOString(),
  };
}

function assertReplayIdentity(
  order: BrandingVirtualOrderRecord,
  employeeId: string,
  payerOpenid: string,
): void {
  if (order.payer_openid !== payerOpenid) {
    throw Errors.business(
      409,
      "该订单已绑定其他付款人",
      "BRANDING_VIRTUAL_ORDER_PAYER_MISMATCH",
    );
  }
  if (order.created_by !== employeeId) {
    throw Errors.business(
      409,
      "该订单已绑定其他操作人",
      "BRANDING_VIRTUAL_ORDER_ACTOR_MISMATCH",
    );
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

function secretInvalid() {
  return Errors.business(
    409,
    "虚拟支付密钥未配置或版本不匹配",
    "BRANDING_VIRTUAL_PAYMENT_SECRET_INVALID",
  );
}

function orderExpired() {
  return Errors.business(
    409,
    "虚拟支付订单支付时间已结束",
    "BRANDING_VIRTUAL_ORDER_EXPIRED",
  );
}

function claimInvalid() {
  return Errors.business(
    409,
    "虚拟支付请求签发租约已失效",
    "BRANDING_VIRTUAL_PAYMENT_REQUEST_CLAIM_INVALID",
  );
}

export const tenantBrandingVirtualOrderService =
  new TenantBrandingVirtualOrderService();
