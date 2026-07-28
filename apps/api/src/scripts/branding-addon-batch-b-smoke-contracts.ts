import {
  BrandingAddonSmokeFailure,
  contractFailure,
  isRecord,
  readString,
  requireRecord,
} from "./branding-addon-batch-b-smoke-support";

export const BRANDING_ADDON_PRODUCT_CODE =
  "custom_support_branding_annual";

const MAX_PAGE_SIZE = 100;

export type CreateOrderSnapshot = {
  id: string;
  orderNo: string;
  productCode: string;
  productName: string;
  amountFen: number;
  termYears: number;
  expiresAt: string;
  createdAt: string;
};

export function assertExpectedEffectiveBranding(
  data: Record<string, unknown>,
  expectedSource: "tenant" | "platform",
): void {
  if (data.source !== expectedSource) {
    throw contractFailure(
      `effective branding source must be ${expectedSource}`,
    );
  }
  if (
    !readString(data.display_name) ||
    !readString(data.logo_url) ||
    data.support_text !== data.display_name ||
    !Number.isInteger(data.version)
  ) {
    throw contractFailure("Batch A effective branding contract is invalid");
  }
}

export function assertPurchasableProduct(
  data: Record<string, unknown>,
): void {
  const product = requireRecord(data.product, "tenant product");
  if (
    product.code !== BRANDING_ADDON_PRODUCT_CODE ||
    !Number.isSafeInteger(product.amount_fen) ||
    Number(product.amount_fen) <= 0 ||
    product.term_years !== 1
  ) {
    throw productPreconditionFailure(
      contractFailure("product is not configured"),
    );
  }
  const action = requireRecord(product.purchase_action, "purchase_action");
  if (action.enabled !== true || action.disabled_reason !== null) {
    throw productPreconditionFailure(
      contractFailure("test tenant is not allowed to purchase"),
    );
  }
}

export function assertConfiguredPlatformProduct(
  data: Record<string, unknown>,
): void {
  const product = requireRecord(data.product, "platform product");
  if (
    product.code !== BRANDING_ADDON_PRODUCT_CODE ||
    product.enabled !== true ||
    !Number.isSafeInteger(product.amount_fen) ||
    Number(product.amount_fen) <= 0 ||
    product.term_years !== 1
  ) {
    throw productPreconditionFailure(
      contractFailure("platform product is disabled or has no positive price"),
    );
  }
}

export function assertInitialCreateOrderResult(
  data: Record<string, unknown>,
): CreateOrderSnapshot {
  assertCreateFlags(data, "initial create", false, false);
  const snapshot = readPendingCreateSnapshot(data, "initial create");
  assertPaymentRequest(data);
  return snapshot;
}

export function assertRepeatedCreateOrderResult(
  data: Record<string, unknown>,
  expected: CreateOrderSnapshot,
  label: string,
  flags: { idempotent: boolean; reusedPending: boolean },
): void {
  assertCreateFlags(data, label, flags.idempotent, flags.reusedPending);
  const actual = readPendingCreateSnapshot(data, label);
  for (const key of Object.keys(expected) as Array<keyof CreateOrderSnapshot>) {
    if (actual[key] !== expected[key]) {
      throw contractFailure(`${label} changed order snapshot field ${key}`);
    }
  }
  assertPaymentRequest(data);
}

export function assertSameOrder(
  data: Record<string, unknown>,
  expectedId: string,
  label: string,
): void {
  const order = requireRecord(data.order, `${label} order`);
  if (order.id !== expectedId) {
    throw contractFailure(`${label} returned a different order`);
  }
}

export function assertPaymentRequest(
  data: Record<string, unknown>,
): void {
  const payment = requireRecord(data.payment_request, "payment_request");
  for (
    const field of ["timeStamp", "nonceStr", "package", "signType", "paySign"]
  ) {
    if (!readString(payment[field])) {
      throw contractFailure(`payment_request.${field} is required`);
    }
  }
}

export function assertPaginatedOrders(
  data: Record<string, unknown>,
  expectedOrderId: string,
): void {
  const list = Array.isArray(data.list) ? data.list : null;
  const pagination = requireRecord(data.pagination, "pagination");
  if (
    !list ||
    pagination.page !== 1 ||
    pagination.pageSize !== 20 ||
    Number(pagination.pageSize) > MAX_PAGE_SIZE ||
    !list.some((item) => isRecord(item) && item.id === expectedOrderId)
  ) {
    throw contractFailure("paginated order list is invalid");
  }
}

export function productPreconditionFailure(error: unknown) {
  const failure = error instanceof BrandingAddonSmokeFailure ? error : null;
  return new BrandingAddonSmokeFailure(
    "年度品牌权益商品必须已启用并配置正整数分价格，两个测试租户管理员必须具备购买权限",
    "BRANDING_ADDON_SMOKE_PRECONDITION_PRODUCT_UNAVAILABLE",
    failure?.http_status ?? 0,
    failure?.request_id ?? null,
    failure?.response ?? null,
  );
}

function readPendingCreateSnapshot(
  data: Record<string, unknown>,
  label: string,
): CreateOrderSnapshot {
  const order = requireRecord(data.order, `${label} order`);
  const id = readString(order.id);
  const orderNo = readString(order.order_no);
  const productCode = readString(order.product_code);
  const productName = readString(order.product_name);
  const expiresAt = readString(order.expires_at);
  const createdAt = readString(order.created_at);
  if (
    !id ||
    !orderNo ||
    !productCode ||
    !productName ||
    !expiresAt ||
    !createdAt ||
    order.status !== "pending" ||
    productCode !== BRANDING_ADDON_PRODUCT_CODE ||
    !Number.isSafeInteger(order.amount_fen) ||
    Number(order.amount_fen) <= 0 ||
    order.term_years !== 1
  ) {
    throw contractFailure(`${label} is not a valid pending order`);
  }
  return {
    id,
    orderNo,
    productCode,
    productName,
    amountFen: Number(order.amount_fen),
    termYears: Number(order.term_years),
    expiresAt,
    createdAt,
  };
}

function assertCreateFlags(
  data: Record<string, unknown>,
  label: string,
  idempotent: boolean,
  reusedPending: boolean,
): void {
  if (
    data.idempotent === idempotent &&
    data.reused_pending === reusedPending
  ) return;
  throw contractFailure(`${label} flags are invalid`);
}
