const SAFE_VIRTUAL_PAYMENT_ERROR_MESSAGES: Readonly<Record<string, string>> = {
  BRANDING_ADDON_PRODUCT_VERSION_CONFLICT:
    "权益商品已被其他管理员更新，请刷新后重试。",
  BRANDING_VIRTUAL_PRODUCT_VERSION_CONFLICT:
    "虚拟商品映射已被其他管理员更新，请刷新后重试。",
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
};

export function toSafeVirtualPaymentMutationMessage(
  caught: unknown,
  fallback: string,
): string {
  if (caught instanceof Error &&
    !("status" in caught) && !("code" in caught)) {
    return caught.message;
  }
  if (!caught || typeof caught !== "object") return fallback;
  if ("status" in caught && caught.status === 403) {
    return "当前账号没有管理微信虚拟支付配置的权限。";
  }
  const code = "code" in caught ? String(caught.code ?? "") : "";
  return SAFE_VIRTUAL_PAYMENT_ERROR_MESSAGES[code] ?? fallback;
}
