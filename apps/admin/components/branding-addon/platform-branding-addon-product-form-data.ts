import type {
  PlatformBrandingAddonProduct,
  PlatformBrandingAddonProductFormValues,
  PlatformBrandingAddonProductPatch,
} from "./platform-branding-addon-product-types";
import type { BrandingPurchaseMode } from "@gooes/domain";

export const MAX_BRANDING_ADDON_AMOUNT_FEN = 2_147_483_647;

type PriceParseResult =
  | { ok: true; amountFen: number }
  | { ok: false; message: string };

export type ProductFormField = "name" | "amountYuan" | "purchaseNotes";

type ModePatchResult =
  | {
    ok: true;
    patch: { purchase_mode: BrandingPurchaseMode; version: number };
  }
  | { ok: false; message: string };

export function buildModePatch(input: {
  current: BrandingPurchaseMode;
  next: BrandingPurchaseMode;
  version: number;
}): ModePatchResult {
  if (input.current === input.next) {
    return {
      ok: true,
      patch: { purchase_mode: input.next, version: input.version },
    };
  }
  if (
    input.current === "direct_legacy" &&
    input.next === "wechat_virtual"
  ) {
    return {
      ok: false,
      message: "请先切换到维护模式并收敛旧待支付订单",
    };
  }
  if (
    input.current === "wechat_virtual" &&
    input.next === "direct_legacy"
  ) {
    return {
      ok: false,
      message: "虚拟支付启用后只能暂停，不能回退到普通支付",
    };
  }
  const isAllowed =
    (input.current === "direct_legacy" && input.next === "maintenance") ||
    (input.current === "maintenance" && input.next === "wechat_virtual") ||
    (input.current === "wechat_virtual" && input.next === "maintenance");
  if (!isAllowed) {
    return { ok: false, message: "不支持当前支付通道切换" };
  }
  return {
    ok: true,
    patch: { purchase_mode: input.next, version: input.version },
  };
}

export function isOrderRefundable(order: {
  payment_channel: "legacy_direct" | "wechat_virtual";
  payment_status: "pending" | "succeeded" | "closed" | "failed";
  fulfillment_status: "pending" | "granted" | "grant_failed";
  refund_status:
    | "none"
    | "reviewing"
    | "submitted"
    | "external_required"
    | "succeeded"
    | "failed"
    | "rejected";
}): boolean {
  return order.payment_channel === "wechat_virtual" &&
    order.payment_status === "succeeded" &&
    order.fulfillment_status === "granted" &&
    order.refund_status === "none";
}

export class ProductFormValidationError extends Error {
  constructor(
    readonly field: ProductFormField,
    message: string,
  ) {
    super(message);
    this.name = "ProductFormValidationError";
  }
}

export function formatFenAsYuanInput(amountFen: number | null): string {
  if (amountFen === null) return "";

  const yuan = Math.floor(amountFen / 100);
  const fen = String(amountFen % 100).padStart(2, "0");
  return `${yuan}.${fen}`;
}

export function createProductFormValues(
  product: PlatformBrandingAddonProduct,
): PlatformBrandingAddonProductFormValues {
  return {
    name: product.name,
    amountYuan: formatFenAsYuanInput(product.amount_fen),
    purchaseNotes: product.purchase_notes,
    enabled: product.enabled,
  };
}

export function parseYuanInputToFen(value: string): PriceParseResult {
  const normalized = value.trim();
  if (!normalized) {
    return { ok: false, message: "请填写年度价格" };
  }
  if (!/^\d+(?:\.\d+)?$/.test(normalized)) {
    return { ok: false, message: "年度价格格式不正确" };
  }

  const [yuanPart, fractionPart = ""] = normalized.split(".");
  if (fractionPart.length > 2) {
    return { ok: false, message: "年度价格最多保留两位小数" };
  }

  const yuan = Number(yuanPart);
  const fen = Number(fractionPart.padEnd(2, "0") || "0");
  const amountFen = yuan * 100 + fen;
  if (!Number.isSafeInteger(amountFen) ||
    amountFen > MAX_BRANDING_ADDON_AMOUNT_FEN) {
    return { ok: false, message: "年度价格超出支持范围" };
  }
  if (amountFen <= 0) {
    return { ok: false, message: "年度价格必须大于 0 元" };
  }

  return { ok: true, amountFen };
}

export function buildProductPatch(
  product: PlatformBrandingAddonProduct,
  values: PlatformBrandingAddonProductFormValues,
): PlatformBrandingAddonProductPatch {
  const name = values.name.trim();
  if (!name) {
    throw new ProductFormValidationError("name", "请填写商品名称");
  }
  if (name.length > 100) {
    throw new ProductFormValidationError(
      "name",
      "商品名称不能超过 100 个字符",
    );
  }

  const purchaseNotes = values.purchaseNotes.trim();
  if (!purchaseNotes) {
    throw new ProductFormValidationError(
      "purchaseNotes",
      "请填写购买说明",
    );
  }
  if (purchaseNotes.length > 500) {
    throw new ProductFormValidationError(
      "purchaseNotes",
      "购买说明不能超过 500 个字符",
    );
  }

  const amountYuan = values.amountYuan.trim();
  let amountFen: number | undefined;
  if (amountYuan) {
    const price = parseYuanInputToFen(amountYuan);
    if (!price.ok) {
      throw new ProductFormValidationError(
        "amountYuan",
        price.message,
      );
    }
    amountFen = price.amountFen;
  } else if (values.enabled) {
    throw new ProductFormValidationError(
      "amountYuan",
      "请填写年度价格",
    );
  }

  return {
    name,
    purchase_notes: purchaseNotes,
    enabled: values.enabled,
    version: product.version,
    ...(amountFen === undefined ? {} : { amount_fen: amountFen }),
  };
}
