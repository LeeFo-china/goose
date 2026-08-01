import { Errors } from "@/errors/error-factory";
import {
  brandingVirtualRefundRepository,
  type BrandingVirtualRefundOrderContext,
  type BrandingVirtualRefundRecord,
  type BrandingVirtualRefundStatus,
} from "@/repositories/branding-virtual-refunds";
import { accessPolicyService } from "@/services/access-policy";
import type { AuthContext } from "@/services/authorization";
import {
  parseWechatVirtualPaymentSecretBundle,
  WECHAT_VIRTUAL_PAYMENT_SECRET_KEYS,
} from "@/services/branding-virtual-products";
import { platformAuditLogService } from "@/services/platform-audit-logs";
import { systemSettingsService } from "@/services/system-settings";
import {
  wechatMiniProgramAccessTokenProvider,
  type WechatMiniProgramAccessTokenPort,
} from "@/services/wechat-miniprogram-access-token";
import { wechatMiniSessionCredentialService } from "@/services/wechat-mini-session-credentials";
import { WechatVirtualPaymentGateway } from "@/services/wechat-virtual-payment-gateway";
import type { WechatVirtualPaymentGatewayPort } from "@/services/wechat-virtual-payment-gateway-contracts";

const MANAGE_PERMISSION = "platform.branding_virtual_refund.manage";

type RepositoryPort = Pick<
  typeof brandingVirtualRefundRepository,
  | "findOrderContext"
  | "recordProviderOrderTypeFact"
  | "create"
  | "claimSubmission"
  | "renewSubmissionClaim"
  | "releaseSubmissionClaim"
  | "markSubmitted"
  | "list"
  | "findDetail"
>;
type AccessPolicyPort = Pick<typeof accessPolicyService, "assertPermission">;
type CredentialsPort = Pick<
  typeof wechatMiniSessionCredentialService,
  "getActiveForUser"
>;
type GatewayPort = Pick<WechatVirtualPaymentGatewayPort, "queryOrder" | "refundOrder">;
type SettingsPort = Pick<
  typeof systemSettingsService,
  "getPlatformSecretString"
>;
type AuditPort = Pick<typeof platformAuditLogService, "recordBestEffort">;

export type BrandingVirtualRefundCreateInput = {
  order_id: string;
  idempotency_key: string;
  reason: string;
  evidence_summary: string;
};

export type BrandingVirtualRefundListInput = {
  page: number;
  pageSize: number;
  status?: BrandingVirtualRefundStatus;
  tenantId?: string;
};

export type BrandingVirtualRefundServiceDependencies = {
  repository?: RepositoryPort;
  accessPolicy?: AccessPolicyPort;
  credentials?: CredentialsPort;
  gateway?: GatewayPort;
  accessTokenProvider?: WechatMiniProgramAccessTokenPort;
  settingsService?: SettingsPort;
  audit?: AuditPort;
};

export class BrandingVirtualRefundService {
  private readonly repository: RepositoryPort;
  private readonly accessPolicy: AccessPolicyPort;
  private readonly credentials: CredentialsPort;
  private readonly gateway: GatewayPort;
  private readonly accessTokenProvider: WechatMiniProgramAccessTokenPort;
  private readonly settingsService: SettingsPort;
  private readonly audit: AuditPort;

  constructor(dependencies: BrandingVirtualRefundServiceDependencies = {}) {
    this.repository = dependencies.repository ?? brandingVirtualRefundRepository;
    this.accessPolicy = dependencies.accessPolicy ?? accessPolicyService;
    this.credentials = dependencies.credentials ??
      wechatMiniSessionCredentialService;
    this.gateway = dependencies.gateway ?? new WechatVirtualPaymentGateway({
      credentialInvalidation: wechatMiniSessionCredentialService,
    });
    this.accessTokenProvider = dependencies.accessTokenProvider ??
      wechatMiniProgramAccessTokenProvider;
    this.settingsService = dependencies.settingsService ?? systemSettingsService;
    this.audit = dependencies.audit ?? platformAuditLogService;
  }

  async create(
    authContext: AuthContext,
    input: BrandingVirtualRefundCreateInput,
  ): Promise<BrandingVirtualRefundRecord> {
    const actor = this.requireOperator(authContext);
    const order = await this.repository.findOrderContext(input.order_id);
    if (!order) throw refundOrderNotFound();
    assertRefundableOrder(order);

    let accessToken: string | null = null;
    let signingSecret: { environment: "sandbox" | "production"; appKey: string } | null = null;
    if (order.provider_order_type === null) {
      [accessToken, signingSecret] = await Promise.all([
        this.accessTokenProvider.getAccessToken(),
        this.requireBoundSecret(order),
      ]);
      const providerFact = await this.gateway.queryOrder({
        accessToken,
        openid: order.payer_openid,
        environment: order.environment,
        signingSecret,
        orderId: order.out_trade_no,
      });
      assertProviderRefundableFact(order, providerFact);
      await this.repository.recordProviderOrderTypeFact({
        orderId: order.id,
        officialStatus: providerFact.status,
        providerOrderType: providerFact.orderType,
        outTradeNo: providerFact.orderId,
        environment: providerFact.environment,
        providerOrderNo: providerFact.wechatOrderId,
        orderFeeFen: providerFact.orderFee,
        paidFeeFen: providerFact.paidFee,
        leftFeeFen: providerFact.leftFee,
      });
    }

    const refund = await this.repository.create({
      orderId: input.order_id,
      idempotencyKey: input.idempotency_key,
      reason: input.reason,
      evidenceSummary: input.evidence_summary,
      requestedBy: actor.employeeId,
    });
    if (refund.platform_mode === "apple_external") {
      await this.recordAudit(actor, refund, "Apple 外部退款待用户处理");
      return refund;
    }
    if (refund.status !== "reviewing") return refund;

    const claim = await this.repository.claimSubmission({
      refundId: refund.id,
      leaseSeconds: 120,
    });
    if (!claim) return refund;
    try {
      [accessToken, signingSecret] = await Promise.all([
        accessToken ?? this.accessTokenProvider.getAccessToken(),
        signingSecret ?? this.requireBoundSecret(order),
      ]);
      const credential = await
        this.credentials.getActiveForUser({
          userId: order.created_by_user_id,
          openid: order.payer_openid,
        });
      const renewed = await this.repository.renewSubmissionClaim({
        refundId: refund.id,
        claimToken: claim.claimToken,
        leaseSeconds: 120,
      });
      if (!renewed) throw submissionClaimLost();
      const result = await this.gateway.refundOrder({
        accessToken,
        openid: order.payer_openid,
        environment: order.environment,
        signingSecret,
        sessionKey: credential.sessionKey,
        credential: {
          userId: order.created_by_user_id,
          credentialId: credential.credentialId,
          sessionRevision: credential.sessionRevision,
        },
        orderId: order.out_trade_no,
        refundOrderId: refund.refund_no,
        leftFee: order.amount_fen,
        refundFee: order.amount_fen,
        bizMeta: refund.id,
        refundReason: "5",
        requestSource: "1",
      });
      const submitted = await this.repository.markSubmitted({
        refundId: refund.id,
        claimToken: claim.claimToken,
        providerRefundId: result.refundWechatOrderId ?? result.refundOrderId,
        providerRequestId: result.requestId,
      });
      await this.recordAudit(actor, submitted, "提交微信虚拟支付全额退款");
      return submitted;
    } catch (error) {
      await this.releaseSubmissionClaimBestEffort(refund.id, claim.claimToken);
      throw error;
    }
  }

  list(authContext: AuthContext, input: BrandingVirtualRefundListInput) {
    this.requireOperator(authContext);
    return this.repository.list(input);
  }

  async get(authContext: AuthContext, refundId: string) {
    this.requireOperator(authContext);
    const refund = await this.repository.findDetail(refundId);
    if (!refund) {
      throw Errors.business(
        404,
        "虚拟支付退款不存在",
        "BRANDING_VIRTUAL_REFUND_NOT_FOUND",
      );
    }
    return refund;
  }

  private requireOperator(authContext: AuthContext) {
    if (
      !authContext.isPlatformAdmin || authContext.tenantId !== null ||
      !authContext.employeeId || !authContext.authUserId
    ) throw Errors.forbidden();
    this.accessPolicy.assertPermission(authContext, MANAGE_PERMISSION);
    return {
      employeeId: authContext.employeeId,
      authUserId: authContext.authUserId,
    };
  }

  private async requireBoundSecret(order: BrandingVirtualRefundOrderContext) {
    const value = await this.settingsService.getPlatformSecretString(
      WECHAT_VIRTUAL_PAYMENT_SECRET_KEYS[order.environment],
    );
    const secret = parseWechatVirtualPaymentSecretBundle(value);
    if (!secret || secret.revision !== order.secret_revision) {
      throw Errors.business(
        409,
        "虚拟支付退款密钥版本与订单不一致",
        "BRANDING_VIRTUAL_PAYMENT_SECRET_REVISION_INVALID",
      );
    }
    return { environment: order.environment, appKey: secret.appKey };
  }

  private recordAudit(
    actor: { employeeId: string; authUserId: string },
    refund: BrandingVirtualRefundRecord,
    summary: string,
  ) {
    return this.audit.recordBestEffort({
      action: "branding_virtual_refund.create",
      actorEmployeeId: actor.employeeId,
      actorUserId: actor.authUserId,
      resourceType: "tenant_virtual_addon_refund",
      resourceId: refund.id,
      resourceLabel: refund.refund_no,
      status: "success",
      summary,
      metadata: {
        order_id: refund.order_id,
        platform_mode: refund.platform_mode,
        refund_status: refund.status,
        amount_fen: refund.amount_fen,
      },
    });
  }

  private async releaseSubmissionClaimBestEffort(
    refundId: string,
    claimToken: string,
  ): Promise<void> {
    try {
      await this.repository.releaseSubmissionClaim({ refundId, claimToken });
    } catch {
      // The bounded lease makes this claim recoverable if persistence fails.
    }
  }
}

function assertRefundableOrder(order: BrandingVirtualRefundOrderContext): void {
  if (
    order.payment_status !== "succeeded" ||
    order.fulfillment_status !== "granted" ||
    order.paid_amount_fen !== order.amount_fen ||
    !order.paid_at || !order.entitlement_event_id
  ) {
    throw Errors.business(
      409,
      "当前虚拟支付订单不可退款",
      "BRANDING_VIRTUAL_REFUND_ORDER_NOT_REFUNDABLE",
    );
  }
  if (order.refund_status === "succeeded") {
    throw Errors.business(409, "虚拟支付订单已退款",
      "BRANDING_VIRTUAL_REFUND_ALREADY_EXISTS");
  }
}

function assertProviderRefundableFact(
  order: BrandingVirtualRefundOrderContext,
  fact: Awaited<ReturnType<GatewayPort["queryOrder"]>>,
): asserts fact is typeof fact & {
  status: 2 | 3 | 4;
  orderType: 0 | 7;
  wechatOrderId: string;
} {
  if (
    ![2, 3, 4].includes(fact.status) ||
    (fact.orderType !== 0 && fact.orderType !== 7) ||
    fact.orderId !== order.out_trade_no ||
    fact.environment !== order.environment ||
    !fact.wechatOrderId || fact.wechatOrderId !== order.provider_order_no ||
    fact.orderFee !== order.amount_fen || fact.paidFee !== order.amount_fen ||
    fact.leftFee !== order.amount_fen
  ) {
    throw Errors.business(409, "微信虚拟支付订单事实不可退款",
      "BRANDING_VIRTUAL_REFUND_PROVIDER_FACT_CONFLICT");
  }
}

function refundOrderNotFound() {
  return Errors.business(
    404,
    "虚拟支付订单不存在",
    "BRANDING_VIRTUAL_REFUND_ORDER_NOT_FOUND",
  );
}

function submissionClaimLost() {
  return Errors.business(
    409,
    "虚拟支付退款提交租约已失效，请重试",
    "BRANDING_VIRTUAL_REFUND_SUBMISSION_CLAIM_LOST",
  );
}

export const brandingVirtualRefundService = new BrandingVirtualRefundService();
