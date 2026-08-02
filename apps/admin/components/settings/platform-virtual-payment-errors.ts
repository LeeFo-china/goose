const SAFE_VIRTUAL_PAYMENT_ERROR_MESSAGES: Readonly<Record<string, string>> = {
  FORBIDDEN: "当前账号没有管理微信虚拟支付配置的权限。",
  BRANDING_ADDON_PRODUCT_VERSION_CONFLICT:
    "权益商品已被其他管理员更新，请刷新后重试。",
  BRANDING_VIRTUAL_PRODUCT_VERSION_CONFLICT:
    "虚拟商品映射已被其他管理员更新，请刷新后重试。",
  BRANDING_VIRTUAL_PRODUCT_NOT_FOUND:
    "虚拟商品映射不存在，请先保存当前环境配置。",
  BRANDING_VIRTUAL_PAYMENT_NOT_READY:
    "生产虚拟支付尚未就绪，请处理阻塞项后重试。",
  BRANDING_ADDON_PURCHASE_MODE_TRANSITION_INVALID:
    "当前购买通道不支持这次切换，请刷新后重试。",
  BRANDING_VIRTUAL_PRODUCT_REVALIDATION_REQUIRED:
    "映射参数已变化，请保存并重新校验。",
  BRANDING_VIRTUAL_PRODUCT_INVALID: "虚拟商品映射尚未通过校验。",
  BRANDING_VIRTUAL_PRODUCT_PRODUCTION_REQUIRED:
    "请先配置生产环境虚拟商品映射。",
  BRANDING_VIRTUAL_PRODUCT_DISABLED: "请先启用生产环境虚拟商品映射。",
  BRANDING_VIRTUAL_PRODUCT_AMOUNT_MISMATCH:
    "生产映射价格必须与权益商品价格一致。",
  BRANDING_VIRTUAL_PRODUCT_AMOUNT_TOO_LOW: "生产映射价格不得低于 1.00 元。",
  BRANDING_VIRTUAL_PRODUCT_SECRET_INVALID:
    "当前环境 AppKey 未配置或版本不匹配。",
  BRANDING_VIRTUAL_PRODUCT_SECRET_ENVIRONMENT_MISMATCH:
    "虚拟商品映射与 AppKey 环境不一致。",
  WECHAT_VIRTUAL_PAYMENT_SECRET_REVISION_CONFLICT:
    "AppKey 版本已被其他管理员更新，请刷新后重试。",
  SYSTEM_SETTING_PAYMENT_SECRET_VERSION_CONFLICT:
    "支付密钥已被其他管理员更新，请刷新后重试。",
  BRANDING_VIRTUAL_PAYMENT_SECRET_ROTATION_PENDING_ORDERS:
    "存在待处理虚拟支付订单，请完成处理后再轮换 AppKey。",
  WECHAT_VIRTUAL_PAYMENT_SECRET_IDENTITY_IMMUTABLE:
    "AppKey 配置归属不可修改，请刷新后重试。",
  WECHAT_VIRTUAL_PAYMENT_SECRET_SCOPE_INVALID:
    "AppKey 必须保存为平台级加密配置。",
  WECHAT_VIRTUAL_MESSAGE_TOKEN_IDENTITY_IMMUTABLE:
    "消息令牌配置归属不可修改，请刷新后重试。",
  WECHAT_VIRTUAL_MESSAGE_TOKEN_SCOPE_INVALID:
    "消息令牌必须保存为平台级加密配置。",
  BRANDING_VIRTUAL_PRODUCT_WECHAT_QUERY_UNCONFIRMED:
    "暂未确认微信虚拟商品状态，请稍后重试。",
  BRANDING_VIRTUAL_PRODUCT_WECHAT_TASK_PENDING:
    "微信虚拟商品仍在处理中，请稍后重新校验。",
  BRANDING_VIRTUAL_PRODUCT_WECHAT_UPLOAD_TASK_MISSING:
    "微信侧尚无商品上传记录，请先上传商品。",
  BRANDING_VIRTUAL_PRODUCT_WECHAT_UPLOAD_TASK_PENDING:
    "微信正在处理商品上传，请稍后刷新状态。",
  BRANDING_VIRTUAL_PRODUCT_WECHAT_PUBLISH_TASK_MISSING:
    "微信侧尚无商品发布记录，请先发布商品。",
  BRANDING_VIRTUAL_PRODUCT_WECHAT_PUBLISH_TASK_PENDING:
    "微信正在处理商品发布，请稍后刷新状态。",
  BRANDING_VIRTUAL_PRODUCT_WECHAT_GOODS_INVALID:
    "本地商品名称、价格、图片或渠道商品 ID 不符合微信要求。",
  BRANDING_VIRTUAL_PRODUCT_WECHAT_UPLOAD_REQUIRED:
    "当前商品尚未完成上传，不能发布。",
  BRANDING_VIRTUAL_PRODUCT_WECHAT_QUERY_REJECTED:
    "微信拒绝了虚拟商品查询，请核对渠道配置。",
  BRANDING_VIRTUAL_PRODUCT_WECHAT_UPLOAD_MISMATCH:
    "微信上传态商品与当前映射不一致，请核对后重试。",
  BRANDING_VIRTUAL_PRODUCT_WECHAT_PUBLISH_MISMATCH:
    "微信发布态商品与当前映射不一致，请核对后重试。",
};
const SAFE_REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;

export type SafeVirtualPaymentMutationFeedback = {
  message: string;
  code?: string;
  requestId?: string;
};

class VirtualPaymentUiError extends Error {}

export function createVirtualPaymentUiError(message: string): Error {
  return new VirtualPaymentUiError(message);
}

export function toSafeVirtualPaymentMutationFeedback(
  caught: unknown,
  fallback: string,
): SafeVirtualPaymentMutationFeedback {
  if (caught instanceof VirtualPaymentUiError) {
    return { message: caught.message };
  }
  if (!caught || typeof caught !== "object") return { message: fallback };

  const rawCode = "code" in caught ? String(caught.code ?? "") : "";
  const code = Object.hasOwn(SAFE_VIRTUAL_PAYMENT_ERROR_MESSAGES, rawCode)
    ? rawCode
    : undefined;
  const rawRequestId = "requestId" in caught ? caught.requestId : undefined;
  const requestId = typeof rawRequestId === "string" &&
      SAFE_REQUEST_ID_PATTERN.test(rawRequestId)
    ? rawRequestId
    : undefined;
  const forbidden = "status" in caught && caught.status === 403;
  return {
    message: forbidden
      ? SAFE_VIRTUAL_PAYMENT_ERROR_MESSAGES.FORBIDDEN
      : code
      ? SAFE_VIRTUAL_PAYMENT_ERROR_MESSAGES[code]
      : fallback,
    ...(code ? { code } : {}),
    ...(requestId ? { requestId } : {}),
  };
}

export function toSafeVirtualPaymentMutationMessage(
  caught: unknown,
  fallback: string,
): string {
  return toSafeVirtualPaymentMutationFeedback(caught, fallback).message;
}
