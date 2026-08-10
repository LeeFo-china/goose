import { Errors } from "@/errors/error-factory";
import {
  platformPaymentConfigRepository,
  type PlatformPaymentConfigRecord,
} from "@/repositories/platform-payment-configs";
import type {
  OrderRecord,
  ProductRecord,
} from "@/repositories/platform-service-order-records";
import {
  platformServiceOrderRepository,
  type PlatformServiceOrderRepository,
} from "@/repositories/platform-service-orders";
import type {
  ServiceAcceptanceDecisionInput,
  ServiceFulfillmentAttachmentPreviewParam,
  ServiceOrderActionInput,
  ServiceOrderCreateInput,
  ServiceOrderListQuery,
  ServiceProductListQuery,
  ServiceRefundRequestInput,
} from "@/schema/billing-service-orders";
import { accessPolicyService as defaultAccessPolicyService } from "@/services/access-policy";
import type { AuthContext } from "@/services/authorization";
import { requireMatchingPlatformPaymentSecretBundle } from "@/services/platform-payment-secret-bundle-revision";
import {
  serializeTenantServiceOrder,
  serializeTenantServiceProduct,
} from "@/services/platform-service-order-views";
import { requireActiveServicePaymentConfig } from "@/services/tenant-platform-service-order-payment-config";
import {
  buildProductSnapshot,
  getOrderDescription,
  requirePublishedVersion,
} from "@/services/tenant-platform-service-order-snapshots";
import {
  requestServiceOrderRefund,
} from "@/services/tenant-platform-service-order-refunds";
import {
  decideTenantServiceOrderAcceptance,
  getTenantServiceFulfillmentAttachmentPreviewUrl,
  getTenantServiceOrderAcceptance,
} from "@/services/tenant-platform-service-order-acceptance";
import {
  createServiceOrderPaymentRequest,
} from "@/services/tenant-platform-service-order-payment";
import {
  createServiceTradeNo,
  normalizeServiceOrderPage,
  normalizeServiceOrderPageSize,
  SERVICE_PAYMENT_WINDOW_MS,
} from "@/services/tenant-platform-service-order-utils";
import {
  wechatPayGateway as defaultWechatPayGateway,
  type WechatPayCreateJsapiPrepayResult,
} from "@/services/wechat-pay-gateway";
import {
  wechatPaySecretBundleService,
  type WechatPaySecretBundle,
} from "@/services/wechat-pay-secret-bundles";

type RepositoryPort = Pick<
  PlatformServiceOrderRepository,
  | "listEnabledProducts"
  | "listOrders"
  | "findEnabledProductByCode"
  | "findOrderByIdempotencyKey"
  | "createPendingOrder"
  | "markPrepayCreated"
  | "findOrderByTenantAndId"
  | "findOrderForPaymentByTenantAndId"
  | "findAcceptanceViewByTenantAndOrderId"
  | "findTenantFulfillmentAttachmentPreview"
  | "decideAcceptance"
  | "requestRefundReview"
>;

type PaymentConfigRepositoryPort = Pick<
  typeof platformPaymentConfigRepository,
  "findWechatPayConfig" | "findWechatPayConfigById"
>;

type AccessPolicyPort = {
  assertTenantContext: (authContext: AuthContext) => string;
  hasPermission: (authContext: AuthContext, permissionCode: string) => boolean;
};

type TenantPlatformServiceOrderServiceDependencies = {
  repository?: RepositoryPort;
  paymentConfigRepository?: PaymentConfigRepositoryPort;
  accessPolicyService?: AccessPolicyPort;
  secretBundleService?: {
    load: (encryptedConfigRef: string | null) => Promise<WechatPaySecretBundle>;
  };
  wechatPayGateway?: {
    createJsapiPrepay: (input: {
      config: PlatformPaymentConfigRecord;
      order: {
        out_trade_no: string;
        amount: number;
        payer_openid: string;
        payment_expires_at: string;
      };
      description: string;
      secretBundle: WechatPaySecretBundle;
    }) => Promise<WechatPayCreateJsapiPrepayResult>;
    createMiniProgramPaymentRequest:
      typeof defaultWechatPayGateway.createMiniProgramPaymentRequest;
  };
  tradeNoFactory?: () => string;
  nowFactory?: () => Date;
};

const CREATE_PERMISSION = "billing.service_order.create";
const READ_PERMISSION = "billing.service_order.read";
export { SERVICE_PAYMENT_WINDOW_MS };

export class TenantPlatformServiceOrderService {
  private readonly repository: RepositoryPort;
  private readonly paymentConfigRepository: PaymentConfigRepositoryPort;
  private readonly accessPolicyService: AccessPolicyPort;
  private readonly secretBundleService: NonNullable<
    TenantPlatformServiceOrderServiceDependencies["secretBundleService"]
  >;
  private readonly wechatPayGateway: NonNullable<
    TenantPlatformServiceOrderServiceDependencies["wechatPayGateway"]
  >;
  private readonly tradeNoFactory: () => string;
  private readonly nowFactory: () => Date;

  constructor(
    dependencies: TenantPlatformServiceOrderServiceDependencies = {},
  ) {
    this.repository = dependencies.repository ?? platformServiceOrderRepository;
    this.paymentConfigRepository =
      dependencies.paymentConfigRepository ?? platformPaymentConfigRepository;
    this.accessPolicyService =
      dependencies.accessPolicyService ?? defaultAccessPolicyService;
    this.secretBundleService =
      dependencies.secretBundleService ?? wechatPaySecretBundleService;
    this.wechatPayGateway =
      dependencies.wechatPayGateway ?? defaultWechatPayGateway;
    this.tradeNoFactory = dependencies.tradeNoFactory ?? createServiceTradeNo;
    this.nowFactory = dependencies.nowFactory ?? (() => new Date());
  }

  async listProducts(
    authContext: AuthContext,
    query: Partial<ServiceProductListQuery> = {},
  ) {
    this.assertCanCreate(authContext);
    const products = await this.repository.listEnabledProducts({
      page: normalizeServiceOrderPage(query.page),
      pageSize: normalizeServiceOrderPageSize(query.pageSize),
    });
    return {
      ...products,
      list: products.list.map(serializeTenantServiceProduct).filter(Boolean),
    };
  }

  async listOrders(
    authContext: AuthContext,
    query: Partial<ServiceOrderListQuery> = {},
  ) {
    const tenantId = this.assertCanRead(authContext);
    const orders = await this.repository.listOrders({
      tenantId,
      page: normalizeServiceOrderPage(query.page),
      pageSize: normalizeServiceOrderPageSize(query.pageSize),
      paymentStatus: query.paymentStatus,
      serviceStatus: query.serviceStatus,
      keyword: query.keyword,
    });
    const responseNow = this.nowFactory();
    const canCancelPayment = this.canCreate(authContext);
    return {
      ...orders,
      list: orders.list.map((order) =>
        serializeTenantServiceOrder(order, responseNow, { canCancelPayment })
      ),
      server_time: responseNow.toISOString(),
    };
  }

  async createOrder(
    authContext: AuthContext,
    input: ServiceOrderCreateInput,
    payerOpenid: string,
  ) {
    const tenantId = this.assertCanCreate(authContext);
    const employeeId = this.requireEmployee(authContext);
    const existing = await this.repository.findOrderByIdempotencyKey({
      tenantId,
      idempotencyKey: input.idempotency_key,
    });
    if (existing) {
      return this.buildExistingOrderResponse(existing);
    }

    const product = await this.requireEnabledProduct(input.product_code);
    const publishedVersion = requirePublishedVersion(product);
    if (publishedVersion.terms_version !== input.terms_version) {
      throw Errors.business(
        409,
        "服务条款已更新，请重新确认后下单",
        "SERVICE_TERMS_VERSION_STALE",
      );
    }

    const initial = requireActiveServicePaymentConfig(
      await this.paymentConfigRepository.findWechatPayConfig(),
    );
    requireMatchingPlatformPaymentSecretBundle(
      initial.config,
      await this.secretBundleService.load(initial.config.encrypted_config_ref),
    );

    const orderNo = this.tradeNoFactory();
    const creationNow = this.nowFactory();
    const paymentExpiresAt = new Date(
      creationNow.getTime() + SERVICE_PAYMENT_WINDOW_MS,
    ).toISOString();
    const productSnapshot = buildProductSnapshot(product, publishedVersion);
    const order = await this.repository.createPendingOrder({
      tenantId,
      productId: product.id,
      productVersionId: publishedVersion.id,
      orderNo,
      outTradeNo: orderNo,
      idempotencyKey: input.idempotency_key,
      productCode: product.code,
      pricingVersion: publishedVersion.version,
      productSnapshot,
      termYears: publishedVersion.term_years,
      amountFen: publishedVersion.amount_fen,
      paymentConfigId: initial.config.id,
      paymentConfigGuardVersion: initial.guardVersion,
      payerOpenid,
      paymentExpiresAt,
      termsVersion: publishedVersion.terms_version,
      termsAcceptedAt: creationNow.toISOString(),
      createdByEmployeeId: employeeId,
    });

    const paymentRequest = await this.createPaymentRequestForOrder(
      order,
      productSnapshot.title,
      true,
    );
    const responseNow = this.nowFactory();
    return {
      idempotent: false,
      order: serializeTenantServiceOrder(order, responseNow, {
        canCancelPayment: true,
      }),
      product: serializeTenantServiceProduct(product),
      payment_request: paymentRequest,
      server_time: responseNow.toISOString(),
    };
  }

  async getOrder(authContext: AuthContext, orderId: string) {
    const tenantId = this.assertCanRead(authContext);
    const order = await this.requireTenantOrder(tenantId, orderId);
    const responseNow = this.nowFactory();
    return {
      order: serializeTenantServiceOrder(order, responseNow, {
        canCancelPayment: this.canCreate(authContext),
      }),
      server_time: responseNow.toISOString(),
    };
  }

  async createPaymentRequest(
    authContext: AuthContext,
    orderId: string,
    input: ServiceOrderActionInput,
    _payerOpenid: string,
  ) {
    const tenantId = this.assertCanCreate(authContext);
    const order = await this.requireTenantPaymentOrder(tenantId, orderId);
    this.assertOrderVersion(order, input.expected_version);
    const paymentRequest = await this.createPaymentRequestForOrder(
      order,
      getOrderDescription(order),
      false,
    );
    const responseNow = this.nowFactory();
    return {
      order: serializeTenantServiceOrder(order, responseNow, {
        canCancelPayment: true,
      }),
      payment_request: paymentRequest,
      server_time: responseNow.toISOString(),
    };
  }

  async requestRefund(
    authContext: AuthContext,
    orderId: string,
    input: ServiceRefundRequestInput,
  ) {
    return requestServiceOrderRefund({
      authContext,
      orderId,
      request: input,
      repository: this.repository,
      accessPolicyService: this.accessPolicyService,
      nowFactory: this.nowFactory,
    });
  }

  async getAcceptance(authContext: AuthContext, orderId: string) {
    return getTenantServiceOrderAcceptance(
      this.acceptanceDependencies(),
      authContext,
      orderId,
    );
  }

  async confirmAcceptance(
    authContext: AuthContext,
    orderId: string,
    input: ServiceAcceptanceDecisionInput,
  ) {
    return decideTenantServiceOrderAcceptance(
      this.acceptanceDependencies(),
      authContext,
      orderId,
      input,
      "accepted",
    );
  }

  async rejectAcceptance(
    authContext: AuthContext,
    orderId: string,
    input: ServiceAcceptanceDecisionInput,
  ) {
    return decideTenantServiceOrderAcceptance(
      this.acceptanceDependencies(),
      authContext,
      orderId,
      input,
      "rejected",
    );
  }

  async getFulfillmentAttachmentPreviewUrl(
    authContext: AuthContext,
    params: ServiceFulfillmentAttachmentPreviewParam,
  ) {
    return getTenantServiceFulfillmentAttachmentPreviewUrl(
      this.acceptanceDependencies(),
      authContext,
      params.id,
      params.attachmentId,
    );
  }

  private async buildExistingOrderResponse(order: OrderRecord) {
    const paymentRequest = order.payment_status === "pending"
      ? await this.createPaymentRequestForOrder(
        order,
        getOrderDescription(order),
        false,
      )
      : null;
    const responseNow = this.nowFactory();
    const orderView = serializeTenantServiceOrder(order, responseNow, {
      canCancelPayment: true,
    });
    return {
      idempotent: true,
      order: orderView,
      product: null,
      payment_request: orderView.available_actions.continue_payment.enabled
        ? paymentRequest
        : null,
      server_time: responseNow.toISOString(),
    };
  }

  private async createPaymentRequestForOrder(
    order: OrderRecord,
    description: string,
    wrapPrepayError: boolean,
  ) {
    return createServiceOrderPaymentRequest(
      {
        repository: this.repository,
        paymentConfigRepository: this.paymentConfigRepository,
        secretBundleService: this.secretBundleService,
        wechatPayGateway: this.wechatPayGateway,
        secretBundleMatcher: requireMatchingPlatformPaymentSecretBundle,
        nowFactory: this.nowFactory,
      },
      order,
      description,
      wrapPrepayError,
    );
  }

  private assertCanCreate(authContext: AuthContext) {
    const tenantId = this.accessPolicyService.assertTenantContext(authContext);
    if (!this.accessPolicyService.hasPermission(authContext, CREATE_PERMISSION)) {
      throw Errors.forbidden();
    }
    return tenantId;
  }

  private canCreate(authContext: AuthContext) {
    return this.accessPolicyService.hasPermission(authContext, CREATE_PERMISSION);
  }

  private assertCanRead(authContext: AuthContext) {
    const tenantId = this.accessPolicyService.assertTenantContext(authContext);
    if (
      !this.accessPolicyService.hasPermission(authContext, READ_PERMISSION) &&
      !this.accessPolicyService.hasPermission(authContext, CREATE_PERMISSION)
    ) {
      throw Errors.forbidden();
    }
    return tenantId;
  }

  private requireEmployee(authContext: AuthContext) {
    if (!authContext.employeeId) throw Errors.forbidden();
    return authContext.employeeId;
  }

  private async requireEnabledProduct(productCode: string) {
    const product = await this.repository.findEnabledProductByCode(productCode);
    if (!product) {
      throw Errors.business(
        404,
        "平台服务商品不存在或已停用",
        "SERVICE_PRODUCT_NOT_FOUND",
      );
    }
    return product;
  }

  private async requireTenantOrder(tenantId: string, orderId: string) {
    const order = await this.repository.findOrderByTenantAndId({
      tenantId,
      orderId,
    });
    if (!order) {
      throw Errors.business(
        404,
        "平台服务订单不存在",
        "SERVICE_ORDER_NOT_FOUND",
      );
    }
    return order;
  }

  private async requireTenantPaymentOrder(tenantId: string, orderId: string) {
    const order = await this.repository.findOrderForPaymentByTenantAndId({
      tenantId,
      orderId,
    });
    if (!order) {
      throw Errors.business(
        404,
        "平台服务订单不存在",
        "SERVICE_ORDER_NOT_FOUND",
      );
    }
    return order;
  }

  private assertOrderVersion(order: OrderRecord, expectedVersion: number) {
    if (order.version !== expectedVersion) {
      throw Errors.business(
        409,
        "平台服务订单已更新，请刷新后重试",
        "SERVICE_ORDER_VERSION_CONFLICT",
      );
    }
  }

  private acceptanceDependencies() {
    return {
      repository: this.repository,
      accessPolicyService: this.accessPolicyService,
      nowFactory: this.nowFactory,
    };
  }
}

export const tenantPlatformServiceOrderService =
  new TenantPlatformServiceOrderService();
