import { Errors } from "@/errors/error-factory";
import type { PlatformPaymentConfigRecord } from "@/repositories/platform-payment-configs";
import type {
  ServiceProviderWechatPayOrderCreateInput,
  WechatPayOrderCreateInput,
  WechatPayOrderRecord,
} from "@/repositories/wechat-pay-orders";
import type { WechatPayConfigRecord } from "@/repositories/wechat-pay-configs";
import type { WechatPayOrderPaymentContext } from "@/services/wechat-pay-order-platform-provenance";

type OrderCreationPort = {
  createOrder: (
    input: WechatPayOrderCreateInput,
  ) => Promise<WechatPayOrderRecord>;
  createServiceProviderOrder: (
    input: ServiceProviderWechatPayOrderCreateInput,
  ) => Promise<WechatPayOrderRecord>;
};

export function createPendingWechatPayOrder(input: {
  config: WechatPayConfigRecord;
  orderInput: WechatPayOrderCreateInput;
  paymentContext: WechatPayOrderPaymentContext;
  orderRepository: OrderCreationPort;
}) {
  if (input.config.merchant_mode !== "service_provider_sub_merchant") {
    return input.orderRepository.createOrder(input.orderInput);
  }

  const platformConfig = requireGuardedPlatformConfig(
    input.paymentContext.platformConfig,
  );
  return input.orderRepository.createServiceProviderOrder({
    ...input.orderInput,
    platform_payment_config_id: platformConfig.id,
    expected_platform_guard_version: platformConfig.recharge_guard_version,
    expected_tenant_config_updated_at: input.config.updated_at,
  });
}

type GuardedPlatformPaymentConfig = PlatformPaymentConfigRecord & {
  recharge_guard_version: number;
};

function requireGuardedPlatformConfig(
  config: PlatformPaymentConfigRecord | null,
): GuardedPlatformPaymentConfig {
  if (
    !config ||
    !Number.isSafeInteger(config.recharge_guard_version) ||
    Number(config.recharge_guard_version) <= 0
  ) {
    throw Errors.business(
      409,
      "平台服务商支付配置尚未就绪",
      "WECHAT_PAY_PLATFORM_PROFILE_NOT_READY",
    );
  }
  return config as GuardedPlatformPaymentConfig;
}
