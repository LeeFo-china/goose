import { Errors } from "@/errors/error-factory";
import type { PlatformPaymentConfigRecord } from "@/repositories/platform-payment-configs";
import type { OrderRecord } from "@/repositories/platform-service-order-records";
import type { requireMatchingPlatformPaymentSecretBundle } from "@/services/platform-payment-secret-bundle-revision";
import {
  requireOrderPaymentConfig,
} from "@/services/tenant-platform-service-order-payment-config";
import type {
  wechatPayGateway as defaultWechatPayGateway,
  WechatPayCreateJsapiPrepayResult,
} from "@/services/wechat-pay-gateway";
import type { WechatPaySecretBundle } from "@/services/wechat-pay-secret-bundles";

type PaymentRepositoryPort = {
  markPrepayCreated: (input: {
    orderId: string;
    prepayId: string;
  }) => Promise<OrderRecord | null>;
};

type PaymentConfigRepositoryPort = {
  findWechatPayConfigById: (
    configId: string,
  ) => Promise<PlatformPaymentConfigRecord | null>;
};

type SecretBundleServicePort = {
  load: (encryptedConfigRef: string | null) => Promise<WechatPaySecretBundle>;
};

type WechatPayGatewayPort = {
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

type ServiceOrderPaymentDependencies = {
  repository: PaymentRepositoryPort;
  paymentConfigRepository: PaymentConfigRepositoryPort;
  secretBundleService: SecretBundleServicePort;
  wechatPayGateway: WechatPayGatewayPort;
  secretBundleMatcher: typeof requireMatchingPlatformPaymentSecretBundle;
  nowFactory: () => Date;
};

export async function createServiceOrderPaymentRequest(
  dependencies: ServiceOrderPaymentDependencies,
  order: OrderRecord & { cancel_idempotency_key?: string | null },
  description: string,
  wrapPrepayError: boolean,
) {
  assertPaymentReusable(order, dependencies.nowFactory);
  const config = requireOrderPaymentConfig(
    await dependencies.paymentConfigRepository.findWechatPayConfigById(
      requireText(order.payment_config_id, "SERVICE_PAYMENT_CONFIG_INVALID"),
    ),
    order,
  );
  const secretBundle = dependencies.secretBundleMatcher(
    config,
    await dependencies.secretBundleService.load(config.encrypted_config_ref),
  );

  const existingPrepayId = order.prepay_id?.trim();
  if (existingPrepayId) {
    return dependencies.wechatPayGateway.createMiniProgramPaymentRequest({
      config,
      prepayId: existingPrepayId,
      secretBundle,
    });
  }

  let prepay: WechatPayCreateJsapiPrepayResult;
  let markedOrder: OrderRecord | null;
  try {
    prepay = await dependencies.wechatPayGateway.createJsapiPrepay({
      config,
      order: {
        out_trade_no: order.out_trade_no ?? order.order_no,
        amount: order.amount_fen / 100,
        payer_openid: requireText(order.payer_openid, "PAYER_OPENID_REQUIRED"),
        payment_expires_at: order.payment_expires_at,
      },
      description,
      secretBundle,
    });
    markedOrder = await dependencies.repository.markPrepayCreated({
      orderId: order.id,
      prepayId: prepay.prepayId,
    });
  } catch (error) {
    if (!wrapPrepayError) throw error;
    throw Errors.business(
      502,
      "微信支付预下单失败，请稍后继续支付",
      "SERVICE_PAYMENT_PREPAY_FAILED",
      { order_id: order.id },
    );
  }
  if (!markedOrder) {
    throw Errors.business(
      409,
      "平台服务订单状态已变化，请刷新后重试",
      "SERVICE_ORDER_PAYMENT_STATE_CHANGED",
    );
  }
  return prepay.paymentRequest;
}

function assertPaymentReusable(
  order: OrderRecord & { cancel_idempotency_key?: string | null },
  nowFactory: () => Date,
) {
  if (order.payment_status !== "pending") {
    throw Errors.business(
      409,
      "平台服务订单不是待支付状态",
      "SERVICE_ORDER_INVALID_STATE",
    );
  }
  if (new Date(order.payment_expires_at).getTime() <= nowFactory().getTime()) {
    throw Errors.business(
      409,
      "平台服务订单支付时间已结束",
      "SERVICE_ORDER_INVALID_STATE",
    );
  }
  if (order.cancel_idempotency_key) {
    throw Errors.business(
      409,
      "平台服务订单正在取消，请稍后刷新",
      "SERVICE_ORDER_CANCEL_IN_PROGRESS",
    );
  }
}

function requireText(value: string | null | undefined, code: string) {
  const text = value?.trim();
  if (!text) {
    throw Errors.business(409, "平台服务支付参数缺失", code);
  }
  return text;
}
