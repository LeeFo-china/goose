export const MAX_WECHAT_VIRTUAL_PAYMENT_MESSAGE_TOKEN_LENGTH = 512;
export const MAX_WECHAT_MINIPROGRAM_ORIGINAL_ID_LENGTH = 128;

export function isValidWechatVirtualPaymentMessageToken(
  value: string,
): boolean {
  return value.trim().length > 0 &&
    value.length <= MAX_WECHAT_VIRTUAL_PAYMENT_MESSAGE_TOKEN_LENGTH;
}

export function isValidWechatMiniProgramOriginalId(value: string): boolean {
  return value.length <= MAX_WECHAT_MINIPROGRAM_ORIGINAL_ID_LENGTH &&
    /^gh_[A-Za-z0-9_-]+$/.test(value);
}
