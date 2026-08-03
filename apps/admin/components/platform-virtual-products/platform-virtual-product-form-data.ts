import type { VirtualBenefitType } from "@gooes/domain";

import { getGrantRule } from "./platform-virtual-product-rules";
import type {
  PlatformVirtualProductDetailData,
  PlatformVirtualProductFormValues,
} from "./platform-virtual-product-types";

const MAX_VIRTUAL_PRODUCT_AMOUNT_FEN = 2_147_483_647;

export const DEFAULT_VIRTUAL_PRODUCT_FORM_VALUES: PlatformVirtualProductFormValues = {
  name: "",
  productType: "duration",
  amountYuan: "",
  imageFileId: "",
  imagePreviewUrl: "",
  purchaseNotes: "",
  refundTemplate: "duration_before_fulfillment",
  entitlementCode: "",
  durationValue: "1",
  durationUnit: "year",
  grantAmount: "1",
  expiryMode: "permanent",
  expiryValue: "1",
  expiryUnit: "year",
};

export function createInitialVirtualProductFormValues(
  product?: PlatformVirtualProductDetailData | null,
) {
  if (!product) return DEFAULT_VIRTUAL_PRODUCT_FORM_VALUES;
  const rule = getGrantRule(product);
  return {
    ...DEFAULT_VIRTUAL_PRODUCT_FORM_VALUES,
    name: product.name,
    productType: product.product_type,
    amountYuan: product.amount_fen ? (product.amount_fen / 100).toFixed(2) : "",
    imageFileId: product.image_file_id,
    imagePreviewUrl: product.image?.public_url ?? "",
    purchaseNotes: product.purchase_notes ?? "",
    refundTemplate: product.refund_template,
    entitlementCode: rule?.entitlement_code ?? "",
    durationValue: String(rule?.duration_value ?? 1),
    durationUnit: rule?.duration_unit ?? "year",
    grantAmount: String(rule?.grant_amount ?? 1),
    expiryMode: rule?.expiry_mode ?? "permanent",
    expiryValue: String(rule?.expiry_value ?? 1),
    expiryUnit: rule?.expiry_unit ?? "year",
  };
}

export function buildVirtualProductPayload(
  values: PlatformVirtualProductFormValues,
  version?: number,
):
  | { ok: true; body: Record<string, unknown> }
  | { ok: false; message: string } {
  const name = values.name.trim();
  const entitlementCode = values.entitlementCode.trim();
  if (!name) return { ok: false, message: "请填写商品名称" };
  if (!entitlementCode) return { ok: false, message: "请填写权益编码" };
  if (!values.imageFileId) return { ok: false, message: "请上传商品图片" };
  const amount = parseYuanInputToFen(values.amountYuan);
  if (!amount.ok) return { ok: false, message: amount.message };
  if (amount.amountFen < 100) {
    return { ok: false, message: "虚拟商品统一售价不得低于 1.00 元" };
  }

  const grantRule = buildGrantRule(values, entitlementCode);
  if (!grantRule.ok) return grantRule;
  return {
    ok: true,
    body: {
      ...(version ? { version } : {}),
      name,
      product_type: values.productType,
      amount_fen: amount.amountFen,
      image_file_id: values.imageFileId,
      purchase_notes: values.purchaseNotes.trim(),
      refund_template: values.refundTemplate,
      grant_rule: grantRule.body,
    },
  };
}

export function updateVirtualProductType(
  productType: VirtualBenefitType,
): Partial<PlatformVirtualProductFormValues> {
  return {
    productType,
    refundTemplate: productType === "duration"
      ? "duration_before_fulfillment"
      : "consumable_unused_full_reverse",
  };
}

function buildGrantRule(values: PlatformVirtualProductFormValues, entitlementCode: string) {
  if (values.productType === "duration") {
    const duration = parsePositiveInteger(values.durationValue, "请填写有效发放时长");
    if (!duration.ok) return duration;
    return {
      ok: true as const,
      body: {
        benefit_type: "duration",
        entitlement_code: entitlementCode,
        duration_value: duration.value,
        duration_unit: values.durationUnit,
        expiry_mode: "fixed_duration",
      },
    };
  }
  const amount = parsePositiveInteger(values.grantAmount, "请填写有效发放数量");
  if (!amount.ok) return amount;
  const expiry = values.expiryMode === "fixed_duration"
    ? parsePositiveInteger(values.expiryValue, "请填写有效期数值")
    : null;
  if (expiry && !expiry.ok) return expiry;
  return {
    ok: true as const,
    body: {
      benefit_type: values.productType,
      entitlement_code: entitlementCode,
      grant_amount: amount.value,
      expiry_mode: values.expiryMode,
      ...(values.expiryMode === "fixed_duration"
        ? { expiry_value: expiry?.value, expiry_unit: values.expiryUnit }
        : {}),
    },
  };
}

function parsePositiveInteger(value: string, message: string) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number <= 0) {
    return { ok: false as const, message };
  }
  return { ok: true as const, value: number };
}

function parseYuanInputToFen(value: string):
  | { ok: true; amountFen: number }
  | { ok: false; message: string } {
  const normalized = value.trim();
  if (!normalized) return { ok: false, message: "请填写商品售价" };
  if (!/^\d+(?:\.\d+)?$/.test(normalized)) {
    return { ok: false, message: "商品售价格式不正确" };
  }

  const [yuanPart, fractionPart = ""] = normalized.split(".");
  if (fractionPart.length > 2) {
    return { ok: false, message: "商品售价最多保留两位小数" };
  }

  const yuan = Number(yuanPart);
  const fen = Number(fractionPart.padEnd(2, "0") || "0");
  const amountFen = yuan * 100 + fen;
  if (
    !Number.isSafeInteger(amountFen) ||
    amountFen > MAX_VIRTUAL_PRODUCT_AMOUNT_FEN
  ) {
    return { ok: false, message: "商品售价超出支持范围" };
  }
  if (amountFen <= 0) return { ok: false, message: "商品售价必须大于 0 元" };

  return { ok: true, amountFen };
}
