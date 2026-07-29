import type {
  PlatformBrandingAddonProduct,
  PlatformBrandingAddonProductFormValues,
  PlatformBrandingAddonProductPatch,
} from "./platform-branding-addon-product-types";

export const MAX_BRANDING_ADDON_AMOUNT_FEN = 2_147_483_647;

type PriceParseResult =
  | { ok: true; amountFen: number }
  | { ok: false; message: string };

export type ProductFormField = "name" | "amountYuan" | "purchaseNotes";

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
