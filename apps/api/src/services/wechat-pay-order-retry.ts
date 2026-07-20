import { Errors } from "@/errors/error-factory";
import type { WechatPayOrderRecord } from "@/repositories/wechat-pay-orders";
import type { WechatPayConfigRecord } from "@/repositories/wechat-pay-configs";
import type { CreateWechatPayOrderInput } from "@/schema/wechat-pay-orders";

export function requireWechatPayPayerOpenid(
  value: string | null | undefined,
) {
  const openid = typeof value === "string" ? value.trim() : "";
  if (openid) return openid;

  throw Errors.business(
    400,
    "请输入付款用户 openid",
    "WECHAT_PAY_PAYER_OPENID_REQUIRED",
  );
}

export function assertWechatPayConfigReadyForOrder(
  config: WechatPayConfigRecord | null,
): asserts config is WechatPayConfigRecord {
  if (!config || config.status !== "active") {
    throw Errors.business(
      409,
      "微信支付配置未启用",
      "WECHAT_PAY_CONFIG_NOT_ACTIVE",
    );
  }

  const requiredFields = [
    "merchant_id",
    "app_id",
    "encrypted_config_ref",
    "serial_no",
    "notify_url",
  ] as const;
  const missingFields = requiredFields.filter((field) =>
    !hasText(config[field])
  );
  if (missingFields.length > 0) {
    throw Errors.business(
      409,
      "微信支付签名或回调配置不完整",
      "WECHAT_PAY_CONFIG_INCOMPLETE",
      { missing_fields: missingFields },
    );
  }
  if (
    !Array.isArray(config.enabled_channels) ||
    !config.enabled_channels.includes("project_payment")
  ) {
    throw Errors.business(
      409,
      "微信支付配置未启用项目收款渠道",
      "WECHAT_PAY_CHANNEL_NOT_ENABLED",
    );
  }
  if (config.merchant_mode !== "service_provider_sub_merchant") return;
  if (
    !hasText(config.sub_merchant_id) ||
    config.applyment_state !== "opened" ||
    config.appid_binding_state !== "bound"
  ) {
    throw Errors.business(
      409,
      "租户特约商户尚未开通或 AppID 未完成绑定",
      "WECHAT_PAY_SUB_MERCHANT_NOT_READY",
      {
        applyment_state: config.applyment_state,
        appid_binding_state: config.appid_binding_state,
        has_sub_merchant_id: hasText(config.sub_merchant_id),
      },
    );
  }
}

export function assertWechatPayPendingOrderRetryMatches(input: {
  config: WechatPayConfigRecord;
  order: WechatPayOrderRecord;
  request: CreateWechatPayOrderInput;
}) {
  const conflicts = [
    input.order.project_id === input.request.project_id ? null : "project_id",
    input.order.receivable_plan_id === input.request.receivable_plan_id
      ? null
      : "receivable_plan_id",
    Number(input.order.amount) === input.request.amount ? null : "amount",
    input.order.payer_openid === input.request.payer_openid
      ? null
      : "payer_openid",
  ].filter((field): field is string => Boolean(field));

  if (conflicts.length > 0) {
    throw Errors.business(
      409,
      "同一流程待办已存在参数不同的微信支付订单",
      "WECHAT_PAY_ORDER_IDEMPOTENCY_CONFLICT",
      { order_id: input.order.id, conflicts },
    );
  }
  if (input.order.payment_config_id !== input.config.id) {
    throw Errors.business(
      409,
      "微信支付订单关联的支付配置已变化",
      "WECHAT_PAY_ORDER_CONFIG_MISMATCH",
      {
        order_id: input.order.id,
        order_payment_config_id: input.order.payment_config_id,
        active_payment_config_id: input.config.id,
      },
    );
  }
}

function hasText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
