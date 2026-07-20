import type {
  WechatPayOrderRecord,
} from "@/repositories/wechat-pay-orders";
import type { WechatPayConfigRecord } from "@/repositories/wechat-pay-configs";
import type { CreateWechatPayOrderInput } from "@/schema/wechat-pay-orders";
import type { WechatPayGateway } from "@/services/wechat-pay-gateway";
import {
  loadWechatPayOrderPaymentContext,
  type PlatformPaymentConfigLookupPort,
} from "@/services/wechat-pay-order-platform-provenance";
import {
  assertWechatPayConfigReadyForOrder,
  assertWechatPayPendingOrderRetryMatches,
} from "@/services/wechat-pay-order-retry";
import type {
  WechatPaySecretBundle,
  WechatPaySecretBundleService,
} from "@/services/wechat-pay-secret-bundles";

type ConfigRepositoryPort = {
  findWechatPayConfig: (tenantId: string) =>
    Promise<WechatPayConfigRecord | null>;
};

type OrderRepositoryPort = {
  markPrepayCreated: (input: {
    tenantId: string;
    orderId: string;
    prepayId: string;
  }) => Promise<WechatPayOrderRecord>;
};

type GatewayPort = Pick<
  WechatPayGateway,
  "createJsapiPrepay" | "createMiniProgramPaymentRequest"
>;

type SecretBundleServicePort = Pick<WechatPaySecretBundleService, "load">;

type PaymentRequestDependencies = {
  orderRepository: OrderRepositoryPort;
  platformPaymentConfigRepository: PlatformPaymentConfigLookupPort;
  secretBundleService: SecretBundleServicePort;
  wechatPayGateway: GatewayPort;
};

export async function prepareWechatPayOrderPaymentRequest(
  input: PaymentRequestDependencies & {
    config: WechatPayConfigRecord;
    order: WechatPayOrderRecord;
    taskTitle: string;
    tenantId: string;
    secretBundle?: WechatPaySecretBundle;
  },
) {
  const secretBundle = input.secretBundle ??
    await input.secretBundleService.load(input.config.encrypted_config_ref);
  if (input.order.prepay_id) {
    return {
      order: input.order,
      paymentRequest: input.wechatPayGateway.createMiniProgramPaymentRequest({
        config: input.config,
        prepayId: input.order.prepay_id,
        secretBundle,
      }),
    };
  }

  const prepay = await input.wechatPayGateway.createJsapiPrepay({
    config: input.config,
    order: input.order,
    description: input.taskTitle || "项目收款",
    secretBundle,
  });
  const order = await input.orderRepository.markPrepayCreated({
    tenantId: input.tenantId,
    orderId: input.order.id,
    prepayId: prepay.prepayId,
  });
  return { order, paymentRequest: prepay.paymentRequest };
}

export async function resumePendingWechatPayOrder(
  input: PaymentRequestDependencies & {
    configRepository: ConfigRepositoryPort;
    tenantId: string;
    request: CreateWechatPayOrderInput;
    taskTitle: string;
    order: WechatPayOrderRecord;
  },
) {
  const config = await input.configRepository.findWechatPayConfig(input.tenantId);
  assertWechatPayConfigReadyForOrder(config);
  assertWechatPayPendingOrderRetryMatches({
    config,
    order: input.order,
    request: input.request,
  });
  const { secretBundle } = await loadWechatPayOrderPaymentContext({
    tenantConfig: config,
    platformConfigRepository: input.platformPaymentConfigRepository,
    secretBundleService: input.secretBundleService,
  });
  const resumed = await prepareWechatPayOrderPaymentRequest({
    ...input,
    config,
    secretBundle,
  });
  return {
    idempotent: true as const,
    payment_request: resumed.paymentRequest,
    order: {
      ...resumed.order,
      amount: normalizeMoney(resumed.order.amount),
      paid_amount: normalizeMoney(resumed.order.paid_amount),
    },
    receivable_plan: null,
  };
}

function normalizeMoney(value: unknown) {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount) ? amount : 0;
}
