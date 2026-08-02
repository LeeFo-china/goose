import type { StartVirtualGoodsUploadInput } from
  "@/services/wechat-virtual-payment-gateway-contracts";
import { MAX_WECHAT_VIRTUAL_PAYMENT_AMOUNT_FEN } from
  "@/services/wechat-virtual-payment-signatures";

const GOODS_ID_PATTERN = /^[A-Za-z0-9_-]{1,20}$/;
const IMAGE_PATH_PATTERN = /\.(?:png|jpe?g)$/i;
const MAX_NAME_LENGTH = 20;
const MAX_REMARK_LENGTH = 1_024;
const MAX_URL_LENGTH = 2_048;

export function isValidVirtualGoodsId(value: unknown): value is string {
  return typeof value === "string" && GOODS_ID_PATTERN.test(value);
}

export function isValidVirtualGoodsUploadItem(
  value: unknown,
): value is StartVirtualGoodsUploadInput["item"] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const item = value as Partial<StartVirtualGoodsUploadInput["item"]>;
  return isValidVirtualGoodsId(item.id) &&
    isBoundedText(item.name, MAX_NAME_LENGTH) &&
    Number.isSafeInteger(item.price) && Number(item.price) > 0 &&
    Number(item.price) <= MAX_WECHAT_VIRTUAL_PAYMENT_AMOUNT_FEN &&
    isBoundedText(item.remark, MAX_REMARK_LENGTH) &&
    isValidImageUrl(item.itemUrl);
}

function isBoundedText(value: unknown, maxLength: number): value is string {
  return typeof value === "string" && value.trim().length > 0 &&
    value.length <= maxLength;
}

function isValidImageUrl(value: unknown): value is string {
  if (
    typeof value !== "string" || value.trim().length === 0 ||
    value.length > MAX_URL_LENGTH || value !== value.trim()
  ) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && IMAGE_PATH_PATTERN.test(url.pathname) &&
      url.username === "" && url.password === "" && url.hash === "";
  } catch {
    return false;
  }
}
