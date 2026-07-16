import { randomUUID } from "node:crypto";
import { Errors } from "@/errors/error-factory";
import { billingRechargeRepository } from "@/repositories/billing-recharge";
import {
  platformPaymentConfigRepository,
  type PlatformPaymentConfigRecord,
} from "@/repositories/platform-payment-configs";
import type { AuthContext } from "@/services/authorization";
import { accessPolicyService } from "@/services/access-policy";
import {
  toBillingRechargeOrderView,
  toProductSnapshot,
  toProductView,
} from "@/services/billing-recharge-views";
import {
  BillingRechargeRefundService,
  type BillingRechargeRefundRequestInput,
  type BillingRechargeRefundServiceDependencies,
} from "@/services/billing-recharge-refunds";
import {
  wechatPayGateway,
  type WechatPayCreateJsapiPrepayResult,
} from "@/services/wechat-pay-gateway";
import {
  wechatPaySecretBundleService,
  type WechatPaySecretBundle,
} from "@/services/wechat-pay-secret-bundles";

export type BillingRechargeProductQuery = {
  page?: number;
  pageSize?: number;
};

export type BillingRechargeOrderQuery = {
  page?: number;
  pageSize?: number;
  status?: "pending" | "paid" | "closed" | "refunded";
  keyword?: string;
};

export type BillingRechargeCreateOrderInput = {
  package_code: string;
  payer_openid: string;
  idempotency_key?: string | null;
};

type BillingRechargeRepositoryPort = Pick<
  typeof billingRechargeRepository,
  | "listEnabledProducts"
  | "listOrders"
  | "findEnabledProductByCode"
  | "findOrderByIdempotencyKey"
  | "createOrder"
  | "markPrepayCreated"
  | "findOrderById"
  | "getAccountByTenantId"
>;

type PaymentConfigRepositoryPort = Pick<
  typeof platformPaymentConfigRepository,
  "findWechatPayConfig"
>;

type AccessPolicyPort = {
  assertTenantContext: (authContext: AuthContext) => string;
  hasPermission: (authContext: AuthContext, permissionCode: string) => boolean;
};

type BillingRechargeServiceDependencies = {
  rechargeRepository?: BillingRechargeRepositoryPort;
  refundRepository?: BillingRechargeRefundServiceDependencies["refundRepository"];
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
      };
      description: string;
      secretBundle: WechatPaySecretBundle;
    }) => Promise<WechatPayCreateJsapiPrepayResult>;
  };
  tradeNoFactory?: () => string;
  requestNoFactory?: () => string;
  nowFactory?: () => Date;
};

const RECHARGE_CREATE_PERMISSION = "billing.recharge.create";
const RECHARGE_READ_PERMISSION = "billing.recharge.read";
const RECHARGE_CHANNEL = "tenant_recharge";
const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

export class BillingRechargeService {
  private readonly rechargeRepository: BillingRechargeRepositoryPort;
  private readonly paymentConfigRepository: PaymentConfigRepositoryPort;
  private readonly accessPolicyService: AccessPolicyPort;
  private readonly secretBundleService: NonNullable<
    BillingRechargeServiceDependencies["secretBundleService"]
  >;
  private readonly wechatPayGateway: NonNullable<
    BillingRechargeServiceDependencies["wechatPayGateway"]
  >;
  private readonly tradeNoFactory: () => string;
  private readonly refundService: BillingRechargeRefundService;

  constructor(dependencies: BillingRechargeServiceDependencies = {}) {
    this.rechargeRepository =
      dependencies.rechargeRepository ?? billingRechargeRepository;
    this.paymentConfigRepository =
      dependencies.paymentConfigRepository ?? platformPaymentConfigRepository;
    this.accessPolicyService =
      dependencies.accessPolicyService ?? accessPolicyService;
    this.secretBundleService =
      dependencies.secretBundleService ?? wechatPaySecretBundleService;
    this.wechatPayGateway = dependencies.wechatPayGateway ?? wechatPayGateway;
    this.tradeNoFactory = dependencies.tradeNoFactory ?? createRechargeTradeNo;
    this.refundService = new BillingRechargeRefundService({
      orderRepository: this.rechargeRepository,
      refundRepository: dependencies.refundRepository,
      accessPolicyService: this.accessPolicyService,
      requestNoFactory: dependencies.requestNoFactory,
      nowFactory: dependencies.nowFactory,
    });
  }

  async listProducts(
    authContext: AuthContext,
    query: BillingRechargeProductQuery = {},
  ) {
    this.assertCanCreate(authContext);
    const page = normalizePositiveInteger(query.page, DEFAULT_PAGE);
    const pageSize = Math.min(
      normalizePositiveInteger(query.pageSize, DEFAULT_PAGE_SIZE),
      MAX_PAGE_SIZE,
    );
    const products = await this.rechargeRepository.listEnabledProducts({
      page,
      pageSize,
    });
    return {
      ...products,
      list: products.list.map(toProductView),
    };
  }

  async listOrders(
    authContext: AuthContext,
    query: BillingRechargeOrderQuery = {},
  ) {
    const tenantId = this.assertCanRead(authContext);
    const page = normalizePositiveInteger(query.page, DEFAULT_PAGE);
    const pageSize = Math.min(
      normalizePositiveInteger(query.pageSize, DEFAULT_PAGE_SIZE),
      MAX_PAGE_SIZE,
    );
    const orders = await this.rechargeRepository.listOrders({
      tenantId,
      page,
      pageSize,
      status: query.status,
      keyword: query.keyword,
    });

    return {
      ...orders,
      list: orders.list.map(toBillingRechargeOrderView),
    };
  }

  async createOrder(
    authContext: AuthContext,
    input: BillingRechargeCreateOrderInput,
  ) {
    const tenantId = this.assertCanCreate(authContext);
    if (!authContext.employeeId) throw Errors.forbidden();

    if (input.idempotency_key) {
      const existing = await this.rechargeRepository.findOrderByIdempotencyKey({
        tenantId,
        idempotencyKey: input.idempotency_key,
      });
      if (existing) {
        return {
          idempotent: true,
          order: toBillingRechargeOrderView(existing),
          product: null,
          payment_request: null,
        };
      }
    }

    const product = await this.rechargeRepository.findEnabledProductByCode(
      input.package_code,
    );
    if (!product) {
      throw Errors.business(
        404,
        "充值套餐不存在或已停用",
        "BILLING_RECHARGE_PRODUCT_NOT_FOUND",
      );
    }

    const config = await this.paymentConfigRepository.findWechatPayConfig();
    this.assertPaymentConfigReady(config);
    const secretBundle = await this.secretBundleService.load(
      config.encrypted_config_ref,
    );
    const outTradeNo = this.tradeNoFactory();
    const order = await this.rechargeRepository.createOrder({
      tenant_id: tenantId,
      order_no: outTradeNo,
      out_trade_no: outTradeNo,
      idempotency_key: input.idempotency_key ?? null,
      package_code: product.code,
      credits: product.credits,
      bonus_credits: product.bonus_credits,
      amount_fen: product.amount_fen,
      channel: "wechat_pay",
      status: "pending",
      created_by: authContext.employeeId,
      payment_config_id: config.id,
      metadata: {
        payer_openid: input.payer_openid,
        product_snapshot: toProductSnapshot(product),
      },
    });
    const prepay = await this.wechatPayGateway.createJsapiPrepay({
      config,
      order: {
        out_trade_no: order.out_trade_no ?? order.order_no,
        amount: order.amount_fen / 100,
        payer_openid: input.payer_openid,
      },
      description: "积分充值",
      secretBundle,
    });
    const orderWithPrepay = await this.rechargeRepository.markPrepayCreated({
      tenantId,
      orderId: order.id,
      prepayId: prepay.prepayId,
    });

    return {
      idempotent: false,
      order: toBillingRechargeOrderView(orderWithPrepay),
      product: toProductView(product),
      payment_request: prepay.paymentRequest,
    };
  }

  async getOrder(authContext: AuthContext, orderId: string) {
    const tenantId = this.assertCanRead(authContext);
    const order = await this.rechargeRepository.findOrderById({
      tenantId,
      orderId,
    });
    if (!order) {
      throw Errors.business(
        404,
        "积分充值订单不存在",
        "BILLING_RECHARGE_ORDER_NOT_FOUND",
      );
    }

    return {
      order: toBillingRechargeOrderView(order),
      account: await this.rechargeRepository.getAccountByTenantId(tenantId),
    };
  }

  async requestRefund(
    authContext: AuthContext,
    orderId: string,
    input: BillingRechargeRefundRequestInput,
  ) {
    return this.refundService.requestRefund(authContext, orderId, input);
  }

  private assertCanCreate(authContext: AuthContext) {
    const tenantId = this.accessPolicyService.assertTenantContext(authContext);
    if (!this.accessPolicyService.hasPermission(
      authContext,
      RECHARGE_CREATE_PERMISSION,
    )) {
      throw Errors.forbidden();
    }
    return tenantId;
  }

  private assertCanRead(authContext: AuthContext) {
    const tenantId = this.accessPolicyService.assertTenantContext(authContext);
    if (
      !this.accessPolicyService.hasPermission(
        authContext,
        RECHARGE_READ_PERMISSION,
      ) &&
      !this.accessPolicyService.hasPermission(
        authContext,
        RECHARGE_CREATE_PERMISSION,
      )
    ) {
      throw Errors.forbidden();
    }
    return tenantId;
  }

  private assertPaymentConfigReady(
    config: PlatformPaymentConfigRecord | null,
  ): asserts config is PlatformPaymentConfigRecord {
    if (!config || config.status !== "active") {
      throw Errors.business(
        409,
        "平台微信支付配置未启用",
        "BILLING_RECHARGE_PAYMENT_CONFIG_INVALID",
      );
    }
    if (!config.enabled_channels.includes(RECHARGE_CHANNEL)) {
      throw Errors.business(
        409,
        "平台微信支付配置未启用积分充值",
        "BILLING_RECHARGE_PAYMENT_CONFIG_INVALID",
      );
    }
    if (
      !config.merchant_id ||
      !config.app_id ||
      !config.encrypted_config_ref ||
      !config.serial_no ||
      !config.notify_url
    ) {
      throw Errors.business(
        409,
        "平台微信支付配置不完整",
        "BILLING_RECHARGE_PAYMENT_CONFIG_MISSING",
      );
    }
  }
}

function normalizePositiveInteger(value: number | undefined, fallback: number) {
  return Number.isInteger(value) && Number(value) > 0 ? Number(value) : fallback;
}

function createRechargeTradeNo() {
  return `TC${new Date().toISOString().replace(/\D/g, "").slice(0, 17)}${
    randomUUID().replaceAll("-", "").slice(0, 8).toUpperCase()
  }`;
}

export const billingRechargeService = new BillingRechargeService();
