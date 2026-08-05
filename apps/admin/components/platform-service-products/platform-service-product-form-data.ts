import type {
  PlatformServiceProductFormValues,
  PlatformServiceProductListItem,
} from "./platform-service-product-types";

const MAX_SERVICE_PRODUCT_AMOUNT_FEN = 99_999_999_999;

export const DEFAULT_PLATFORM_SERVICE_PRODUCT_FORM_VALUES:
  PlatformServiceProductFormValues = {
    code: "",
    title: "",
    termYears: "1",
    listAmountYuan: "",
    amountYuan: "",
    serviceScopeText: "",
    termsContent: "",
  };

export function createInitialPlatformServiceProductFormValues(
  product?: PlatformServiceProductListItem | null,
): PlatformServiceProductFormValues {
  if (!product) return DEFAULT_PLATFORM_SERVICE_PRODUCT_FORM_VALUES;
  return {
    code: product.code,
    title: product.draft.title,
    termYears: String(product.draft.term_years),
    listAmountYuan: fenToYuanInput(product.draft.list_amount_fen),
    amountYuan: fenToYuanInput(product.draft.amount_fen),
    serviceScopeText: product.draft.service_scope.join("\n"),
    termsContent: product.draft.terms_content,
  };
}

export function buildPlatformServiceProductPayload(
  values: PlatformServiceProductFormValues,
  version?: number,
):
  | { ok: true; body: Record<string, unknown> }
  | { ok: false; message: string } {
  const code = values.code.trim();
  const title = values.title.trim();
  if (!code) return { ok: false, message: "请填写套餐编码" };
  if (!title) return { ok: false, message: "请填写套餐名称" };

  const termYears = Number(values.termYears);
  if (!Number.isSafeInteger(termYears) || termYears < 1 || termYears > 3) {
    return { ok: false, message: "服务年限只能是 1、2 或 3 年" };
  }

  const listAmount = parseYuanInputToFen(values.listAmountYuan, "请填写套餐标价");
  if (!listAmount.ok) return { ok: false, message: listAmount.message };
  const amount = parseYuanInputToFen(values.amountYuan, "请填写套餐实付价");
  if (!amount.ok) return { ok: false, message: amount.message };
  if (amount.amountFen > listAmount.amountFen) {
    return { ok: false, message: "实付价不能高于标价" };
  }

  const serviceScope = values.serviceScopeText
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
  if (!serviceScope.length) {
    return { ok: false, message: "请至少填写一条服务范围" };
  }
  if (serviceScope.length > 20) {
    return { ok: false, message: "服务范围最多 20 条" };
  }

  const termsContent = values.termsContent.trim();
  if (!termsContent) return { ok: false, message: "请填写服务条款" };

  return {
    ok: true,
    body: {
      ...(version ? { expected_version: version } : {}),
      code,
      title,
      term_years: termYears,
      list_amount_fen: listAmount.amountFen,
      amount_fen: amount.amountFen,
      service_scope: serviceScope,
      terms_content: termsContent,
    },
  };
}

function fenToYuanInput(value: number) {
  return (value / 100).toFixed(2);
}

function parseYuanInputToFen(value: string, emptyMessage: string):
  | { ok: true; amountFen: number }
  | { ok: false; message: string } {
  const normalized = value.trim();
  if (!normalized) return { ok: false, message: emptyMessage };
  if (!/^\d+(?:\.\d+)?$/.test(normalized)) {
    return { ok: false, message: "金额格式不正确" };
  }

  const [yuanPart, fractionPart = ""] = normalized.split(".");
  if (fractionPart.length > 2) {
    return { ok: false, message: "金额最多保留两位小数" };
  }

  const yuan = Number(yuanPart);
  const fen = Number(fractionPart.padEnd(2, "0") || "0");
  const amountFen = yuan * 100 + fen;
  if (
    !Number.isSafeInteger(amountFen) ||
    amountFen > MAX_SERVICE_PRODUCT_AMOUNT_FEN
  ) {
    return { ok: false, message: "金额超出支持范围" };
  }
  if (amountFen <= 0) return { ok: false, message: "金额必须大于 0 元" };

  return { ok: true, amountFen };
}
