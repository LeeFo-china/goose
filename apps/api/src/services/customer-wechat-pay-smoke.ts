import { randomUUID } from "node:crypto";
import { Errors } from "@/errors/error-factory";
import {
  customerWechatPaySmokeRepository,
  type CustomerWechatPaySmokeOrderRecord,
} from "@/repositories/customer-wechat-pay-smoke";
import { platformPaymentConfigRepository } from "@/repositories/platform-payment-configs";
import { wechatPayConfigRepository } from "@/repositories/wechat-pay-configs";
import type {
  CreateCustomerWechatPaySmokeOrderInput,
} from "@/schema/customer-wechat-pay-smoke";
import {
  loadWechatPayOrderPaymentContext,
  type PlatformPaymentConfigLookupPort,
} from "@/services/wechat-pay-order-platform-provenance";
import {
  assertWechatPayConfigReadyForOrder,
  requireWechatPayPayerOpenid,
} from "@/services/wechat-pay-order-retry";
import {
  wechatPayGateway,
  type WechatPayCreateJsapiPrepayResult,
  type WechatPayQueryTransactionByOutTradeNoInput,
  type WechatPayTransactionQueryResult,
} from "@/services/wechat-pay-gateway";
import {
  wechatPaySecretBundleService,
  type WechatPaySecretBundle,
} from "@/services/wechat-pay-secret-bundles";
import {
  assertWechatPaySuccessTransaction,
  buildWechatPayTransactionExpectedBinding,
  parseAndAssertWechatPayTransactionQuery,
} from "@/services/wechat-pay-transaction-contract";

type CustomerSmokeContext = {
  tenantId: string;
  customerId: string;
};

type OrderRepositoryPort = Pick<
  typeof customerWechatPaySmokeRepository,
  | "findByIdempotencyKey"
  | "createOrder"
  | "markPrepayCreated"
  | "findOrderById"
  | "markOrderPaid"
  | "markOrderTradeState"
>;

type ConfigRepositoryPort = Pick<
  typeof wechatPayConfigRepository,
  "findWechatPayConfig"
>;

type SecretBundleServicePort = {
  load: (encryptedConfigRef: string | null) => Promise<WechatPaySecretBundle>;
};

type WechatPayGatewayPort = {
  createJsapiPrepay: (input: {
    config: WechatPayQueryTransactionByOutTradeNoInput["config"];
    order: {
      out_trade_no: string;
      amount: number;
      payer_openid: string;
      payment_expires_at?: string;
    };
    description: string;
    secretBundle: WechatPaySecretBundle;
  }) => Promise<WechatPayCreateJsapiPrepayResult>;
  createMiniProgramPaymentRequest:
    typeof wechatPayGateway.createMiniProgramPaymentRequest;
  queryTransactionByOutTradeNo: (
    input: WechatPayQueryTransactionByOutTradeNoInput,
  ) => Promise<WechatPayTransactionQueryResult>;
};

export type CustomerWechatPaySmokeServiceDependencies = {
  orderRepository?: OrderRepositoryPort;
  configRepository?: ConfigRepositoryPort;
  platformPaymentConfigRepository?: PlatformPaymentConfigLookupPort;
  secretBundleService?: SecretBundleServicePort;
  wechatPayGateway?: WechatPayGatewayPort;
  tradeNoFactory?: () => string;
  nowFactory?: () => Date;
};

const SMOKE_AMOUNT_FEN = 100;
const SMOKE_DESCRIPTION = "固始晴天装饰微信支付测试-1元";

export class CustomerWechatPaySmokeService {
  private readonly orderRepository: OrderRepositoryPort;
  private readonly configRepository: ConfigRepositoryPort;
  private readonly platformPaymentConfigRepository:
    PlatformPaymentConfigLookupPort;
  private readonly secretBundleService: SecretBundleServicePort;
  private readonly wechatPayGateway: WechatPayGatewayPort;
  private readonly tradeNoFactory: () => string;
  private readonly nowFactory: () => Date;

  constructor(dependencies: CustomerWechatPaySmokeServiceDependencies = {}) {
    this.orderRepository = dependencies.orderRepository ??
      customerWechatPaySmokeRepository;
    this.configRepository = dependencies.configRepository ??
      wechatPayConfigRepository;
    this.platformPaymentConfigRepository =
      dependencies.platformPaymentConfigRepository ??
        platformPaymentConfigRepository;
    this.secretBundleService = dependencies.secretBundleService ??
      wechatPaySecretBundleService;
    this.wechatPayGateway = dependencies.wechatPayGateway ?? wechatPayGateway;
    this.tradeNoFactory = dependencies.tradeNoFactory ?? createSmokeTradeNo;
    this.nowFactory = dependencies.nowFactory ?? (() => new Date());
  }

  async createOrder(
    context: CustomerSmokeContext,
    input: CreateCustomerWechatPaySmokeOrderInput,
  ) {
    const payerOpenid = requireWechatPayPayerOpenid(input.payer_openid);
    if (input.idempotency_key) {
      const existing = await this.orderRepository.findByIdempotencyKey({
        tenantId: context.tenantId,
        customerId: context.customerId,
        idempotencyKey: input.idempotency_key,
      });
      if (existing) {
        return this.buildResponse({
          order: existing,
          paymentRequest: await this.createPaymentRequestForExisting(existing),
          idempotent: true,
        });
      }
    }

    const config = await this.loadReadyConfig(context.tenantId);
    const paymentContext = await loadWechatPayOrderPaymentContext({
      tenantConfig: config,
      platformConfigRepository: this.platformPaymentConfigRepository,
      secretBundleService: this.secretBundleService,
    });
    const order = await this.orderRepository.createOrder({
      tenant_id: context.tenantId,
      customer_id: context.customerId,
      payment_config_id: config.id,
      out_trade_no: this.tradeNoFactory(),
      idempotency_key: input.idempotency_key ?? null,
      amount_fen: SMOKE_AMOUNT_FEN,
      paid_amount_fen: 0,
      currency: "CNY",
      status: "pending",
      payer_openid: payerOpenid,
      metadata: {
        source: "customer_wechat_pay_smoke",
        customer_id: context.customerId,
        fixed_amount_fen: SMOKE_AMOUNT_FEN,
        real_wechat_prepay_created: false,
      },
    });
    const prepay = await this.wechatPayGateway.createJsapiPrepay({
      config,
      order: {
        out_trade_no: order.out_trade_no,
        amount: SMOKE_AMOUNT_FEN / 100,
        payer_openid: payerOpenid,
      },
      description: SMOKE_DESCRIPTION,
      secretBundle: paymentContext.secretBundle,
    });
    const marked = await this.orderRepository.markPrepayCreated({
      tenantId: context.tenantId,
      customerId: context.customerId,
      orderId: order.id,
      prepayId: prepay.prepayId,
    });

    return this.buildResponse({
      order: marked ?? { ...order, prepay_id: prepay.prepayId },
      paymentRequest: marked ? prepay.paymentRequest : null,
      idempotent: false,
    });
  }

  async getOrder(context: CustomerSmokeContext, orderId: string) {
    const order = await this.orderRepository.findOrderById({
      tenantId: context.tenantId,
      customerId: context.customerId,
      orderId,
    });
    if (!order) {
      throw Errors.business(
        404,
        "客户微信支付测试订单不存在",
        "CUSTOMER_WECHAT_PAY_SMOKE_ORDER_NOT_FOUND",
      );
    }

    const synced = await this.syncPendingOrderFromWechat(order);
    return this.buildResponse({
      order: synced,
      paymentRequest: null,
      idempotent: false,
    });
  }

  async confirmPaidFromWechat(input: {
    order: CustomerWechatPaySmokeOrderRecord;
    transaction: {
      transactionId: string;
      amountFen: number;
      successTime: string;
    };
    tradeStateDesc: string | null;
    notificationId: string | null;
    source: "wechat_callback" | "wechat_query";
    requestId?: string | null;
  }) {
    if (
      input.order.status === "paid" &&
      input.order.transaction_id === input.transaction.transactionId
    ) {
      return input.order;
    }

    return this.orderRepository.markOrderPaid({
      tenantId: input.order.tenant_id,
      customerId: input.order.customer_id,
      orderId: input.order.id,
      transactionId: input.transaction.transactionId,
      paidAmountFen: input.transaction.amountFen,
      paidAt: input.transaction.successTime,
      notificationId: input.notificationId,
      tradeStateDesc: input.tradeStateDesc,
      metadata: {
        ...asRecord(input.order.metadata),
        source: input.source,
        confirmation_source: input.source,
        request_id: input.requestId ?? null,
        out_trade_no: input.order.out_trade_no,
      },
    });
  }

  private async syncPendingOrderFromWechat(
    order: CustomerWechatPaySmokeOrderRecord,
  ) {
    if (order.status !== "pending" || !order.prepay_id) return order;

    const config = await this.loadReadyConfig(order.tenant_id);
    if (order.payment_config_id !== config.id) {
      throw Errors.business(
        409,
        "客户微信支付测试订单关联的支付配置已变化",
        "CUSTOMER_WECHAT_PAY_SMOKE_CONFIG_MISMATCH",
      );
    }
    const { secretBundle } = await loadWechatPayOrderPaymentContext({
      tenantConfig: config,
      platformConfigRepository: this.platformPaymentConfigRepository,
      secretBundleService: this.secretBundleService,
    });
    const payload = await this.wechatPayGateway.queryTransactionByOutTradeNo({
      config,
      outTradeNo: order.out_trade_no,
      secretBundle,
    });
    const transaction = parseAndAssertWechatPayTransactionQuery(
      payload,
      buildWechatPayTransactionExpectedBinding({
        merchantMode: config.merchant_mode === "service_provider_sub_merchant"
          ? "service_provider_sub_merchant"
          : "direct_merchant",
        merchantId: config.merchant_id,
        subMerchantId: config.sub_merchant_id,
        outTradeNo: order.out_trade_no,
        amountFen: order.amount_fen,
        transactionId: order.transaction_id,
      }),
    );
    if (transaction.tradeState === "SUCCESS") {
      assertWechatPaySuccessTransaction(transaction);
      return this.confirmPaidFromWechat({
        order,
        transaction,
        tradeStateDesc: optionalString(
          (payload as Record<string, unknown>).trade_state_desc,
        ),
        notificationId: null,
        source: "wechat_query",
        requestId: payload.requestId ?? null,
      });
    }

    return this.orderRepository.markOrderTradeState({
      tenantId: order.tenant_id,
      customerId: order.customer_id,
      orderId: order.id,
      tradeState: transaction.tradeState,
      tradeStateDesc: optionalString(
        (payload as Record<string, unknown>).trade_state_desc,
      ),
    });
  }

  private async createPaymentRequestForExisting(
    order: CustomerWechatPaySmokeOrderRecord,
  ) {
    if (order.status !== "pending" || !order.prepay_id) return null;
    const config = await this.loadReadyConfig(order.tenant_id);
    if (order.payment_config_id !== config.id) return null;
    const { secretBundle } = await loadWechatPayOrderPaymentContext({
      tenantConfig: config,
      platformConfigRepository: this.platformPaymentConfigRepository,
      secretBundleService: this.secretBundleService,
    });
    return this.wechatPayGateway.createMiniProgramPaymentRequest({
      config,
      prepayId: order.prepay_id,
      secretBundle,
    });
  }

  private async loadReadyConfig(tenantId: string) {
    const config = await this.configRepository.findWechatPayConfig(tenantId);
    assertWechatPayConfigReadyForOrder(config);
    return config;
  }

  private buildResponse(input: {
    order: CustomerWechatPaySmokeOrderRecord;
    paymentRequest: WechatPayCreateJsapiPrepayResult["paymentRequest"] | null;
    idempotent: boolean;
  }) {
    return {
      idempotent: input.idempotent,
      order: toSmokeOrderView(input.order),
      payment_request: input.paymentRequest,
      server_time: this.nowFactory().toISOString(),
    };
  }
}

export function toSmokeOrderView(order: CustomerWechatPaySmokeOrderRecord) {
  return {
    id: order.id,
    order_no: order.out_trade_no,
    out_trade_no: order.out_trade_no,
    amount: order.amount_fen / 100,
    amount_fen: order.amount_fen,
    status: order.status,
    trade_state: order.trade_state,
    trade_state_desc: order.trade_state_desc,
    transaction_id: order.transaction_id,
    created_at: order.created_at,
    paid_at: order.paid_at,
  };
}

function createSmokeTradeNo() {
  return `CS${new Date().toISOString().replace(/\D/g, "").slice(0, 14)}${
    randomUUID().replaceAll("-", "").slice(0, 8).toUpperCase()
  }`;
}

function optionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export const customerWechatPaySmokeService =
  new CustomerWechatPaySmokeService();
