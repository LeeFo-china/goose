import { randomUUID } from "node:crypto";

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
import {
  requireActiveServicePaymentConfig,
  requireOrderPaymentConfig,
} from "@/services/tenant-platform-service-order-payment-config";
import {
  buildProductSnapshot,
  getOrderDescription,
  requirePublishedVersion,
} from "@/services/tenant-platform-service-order-snapshots";
import {
  requestServiceOrderRefund,
} from "@/services/tenant-platform-service-order-refunds";
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
const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;
export const SERVICE_PAYMENT_WINDOW_MS = 5 * 60 * 1000;

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
      page: normalizePositiveInteger(query.page, DEFAULT_PAGE),
      pageSize: normalizePageSize(query.pageSize),
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
      page: normalizePositiveInteger(query.page, DEFAULT_PAGE),
      pageSize: normalizePageSize(query.pageSize),
      paymentStatus: query.paymentStatus,
      serviceStatus: query.serviceStatus,
      keyword: query.keyword,
    });
    const responseNow = this.nowFactory();
    return {
      ...orders,
      list: orders.list.map((order) =>
        serializeTenantServiceOrder(order, responseNow)
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
      order: serializeTenantServiceOrder(order, responseNow),
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
      order: serializeTenantServiceOrder(order, responseNow),
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
      order: serializeTenantServiceOrder(order, responseNow),
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

  private async buildExistingOrderResponse(order: OrderRecord) {
    const paymentRequest = order.payment_status === "pending"
      ? await this.createPaymentRequestForOrder(
        order,
        getOrderDescription(order),
        false,
      )
      : null;
    const responseNow = this.nowFactory();
    const orderView = serializeTenantServiceOrder(order, responseNow);
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
    this.assertPaymentReusable(order);
    const config = requireOrderPaymentConfig(
      await this.paymentConfigRepository.findWechatPayConfigById(
        requireText(order.payment_config_id, "SERVICE_PAYMENT_CONFIG_INVALID"),
      ),
      order,
    );
    const secretBundle = requireMatchingPlatformPaymentSecretBundle(
      config,
      await this.secretBundleService.load(config.encrypted_config_ref),
    );

    const existingPrepayId = order.prepay_id?.trim();
    if (existingPrepayId) {
      return this.wechatPayGateway.createMiniProgramPaymentRequest({
        config,
        prepayId: existingPrepayId,
        secretBundle,
      });
    }

    try {
      const prepay = await this.wechatPayGateway.createJsapiPrepay({
        config,
        order: {
          out_trade_no: order.out_trade_no ?? order.order_no,
          amount: order.amount_fen / 100,
          payer_openid: requireText(
            order.payer_openid,
            "PAYER_OPENID_REQUIRED",
          ),
          payment_expires_at: order.payment_expires_at,
        },
        description,
        secretBundle,
      });
      const markedOrder = await this.repository.markPrepayCreated({
        orderId: order.id,
        prepayId: prepay.prepayId,
      });
      return markedOrder ? prepay.paymentRequest : null;
    } catch (error) {
      if (!wrapPrepayError) throw error;
      throw Errors.business(
        502,
        "微信支付预下单失败，请稍后继续支付",
        "SERVICE_PAYMENT_PREPAY_FAILED",
        { order_id: order.id },
      );
    }
  }

  private assertCanCreate(authContext: AuthContext) {
    const tenantId = this.accessPolicyService.assertTenantContext(authContext);
    if (!this.accessPolicyService.hasPermission(authContext, CREATE_PERMISSION)) {
      throw Errors.forbidden();
    }
    return tenantId;
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

  private assertPaymentReusable(order: OrderRecord) {
    if (order.payment_status !== "pending") {
      throw Errors.business(
        409,
        "平台服务订单不是待支付状态",
        "SERVICE_ORDER_INVALID_STATE",
      );
    }
    if (new Date(order.payment_expires_at).getTime() <= this.nowFactory().getTime()) {
      throw Errors.business(
        409,
        "平台服务订单支付时间已结束",
        "SERVICE_ORDER_INVALID_STATE",
      );
    }
  }
}

function requireText(value: string | null | undefined, code: string) {
  const text = value?.trim();
  if (!text) {
    throw Errors.business(409, "平台服务支付参数缺失", code);
  }
  return text;
}

function normalizePositiveInteger(value: number | undefined, fallback: number) {
  return Number.isInteger(value) && Number(value) > 0 ? Number(value) : fallback;
}

function normalizePageSize(value: number | undefined) {
  return Math.min(
    normalizePositiveInteger(value, DEFAULT_PAGE_SIZE),
    MAX_PAGE_SIZE,
  );
}

function createServiceTradeNo() {
  return `TSO${new Date().toISOString().replace(/\D/g, "").slice(0, 17)}${
    randomUUID().replaceAll("-", "").slice(0, 8).toUpperCase()
  }`;
}

export const tenantPlatformServiceOrderService =
  new TenantPlatformServiceOrderService();
