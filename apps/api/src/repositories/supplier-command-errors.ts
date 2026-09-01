import { Errors } from "@/errors/error-factory";
import {
  BUSINESS_ERRORS,
  type SupplierBusinessCode,
} from "@/repositories/supplier-command-business-errors";

const TOKEN_ALIASES = {
  SUPPLIER_OWNERSHIP_IMMUTABLE: "PRODUCT_OWNERSHIP_CONFLICT",
  FULFILLMENT_NOT_CONFIRMED:
    "SUPPLIER_PURCHASE_ORDER_FULFILLMENT_NOT_CONFIRMED",
  FULFILLMENT_VERSION_CONFLICT:
    "SUPPLIER_PURCHASE_ORDER_FULFILLMENT_VERSION_CONFLICT",
  OVER_SHIPPED: "SUPPLIER_PURCHASE_ORDER_OVER_SHIPPED",
  OVER_RECEIVED: "SUPPLIER_PURCHASE_ORDER_OVER_RECEIVED",
  VARIANCE_REASON_REQUIRED:
    "SUPPLIER_PURCHASE_ORDER_VARIANCE_REASON_REQUIRED",
} as const satisfies Record<string, SupplierBusinessCode>;
type SupplierCommandToken =
  SupplierBusinessCode | keyof typeof TOKEN_ALIASES;
const DATABASE_CONSTRAINT_CODES = {
  supplier_products_pkey: "SUPPLIER_PRODUCT_ID_CONFLICT",
  supplier_products_platform_code_unique_idx:
    "SUPPLIER_PRODUCT_CODE_CONFLICT",
  supplier_products_tenant_code_unique_idx:
    "SUPPLIER_PRODUCT_CODE_CONFLICT",
  supplier_skus_pkey: "SUPPLIER_SKU_ID_CONFLICT",
  supplier_skus_platform_code_unique_idx: "SUPPLIER_SKU_CODE_CONFLICT",
  supplier_skus_tenant_code_unique_idx: "SUPPLIER_SKU_CODE_CONFLICT",
} as const satisfies Record<string, SupplierBusinessCode>;
const FULFILLMENT_ENVELOPE_CODES: Readonly<
  Record<string, readonly SupplierCommandToken[]>
> = {
  validation_error: [
    "SUPPLIER_PURCHASE_ORDER_VALIDATION_ERROR",
    "SUPPLIER_PURCHASE_ORDER_FULFILLMENT_VALIDATION_ERROR",
    "SUPPLIER_PURCHASE_ORDER_SHIPMENT_VALIDATION_ERROR",
    "SUPPLIER_PURCHASE_ORDER_RECEIPT_VALIDATION_ERROR",
  ],
  not_found: [
    "SUPPLIER_PURCHASE_ORDER_NOT_FOUND",
    "SUPPLIER_PURCHASE_ORDER_ITEM_NOT_FOUND",
  ],
  version_conflict: [
    "SUPPLIER_PURCHASE_ORDER_VERSION_CONFLICT",
    "FULFILLMENT_VERSION_CONFLICT",
  ],
  state_conflict: [
    "SUPPLIER_PURCHASE_ORDER_STATE_CONFLICT",
    "SUPPLIER_PURCHASE_ORDER_FULFILLMENT_ALREADY_CONFIRMED",
    "FULFILLMENT_NOT_CONFIRMED",
    "SUPPLIER_PURCHASE_ORDER_FULFILLMENT_STATE_CONFLICT",
    "SUPPLIER_PURCHASE_ORDER_SHIPMENT_ID_CONFLICT",
    "SUPPLIER_PURCHASE_ORDER_RECEIPT_ID_CONFLICT",
    "SUPPLIER_PURCHASE_ORDER_FULFILLMENT_STARTED",
  ],
  project_invalid: ["SUPPLIER_PURCHASE_ORDER_PROJECT_INVALID"],
  idempotency_conflict: ["SUPPLIER_IDEMPOTENCY_CONFLICT"],
  over_shipped: ["OVER_SHIPPED"],
  over_received: ["OVER_RECEIVED"],
  variance_reason_required: ["VARIANCE_REASON_REQUIRED"],
};
const REQUISITION_ENVELOPE_CODES: Readonly<
  Record<string, readonly SupplierCommandToken[]>
> = {
  validation_error: [
    "SUPPLIER_PURCHASE_REQUISITION_VALIDATION_ERROR",
    "SUPPLIER_PURCHASE_REQUISITION_DUPLICATE_SKU",
    "SUPPLIER_PURCHASE_REQUISITION_AMOUNT_LIMIT_EXCEEDED",
    "SUPPLIER_PURCHASE_ORDER_VALIDATION_ERROR",
    "SUPPLIER_PURCHASE_ORDER_DUPLICATE_SKU",
  ],
  not_found: [
    "SUPPLIER_PURCHASE_REQUISITION_NOT_FOUND",
    "SUPPLIER_PURCHASE_ORDER_NOT_FOUND",
  ],
  version_conflict: [
    "SUPPLIER_PURCHASE_REQUISITION_VERSION_CONFLICT",
    "SUPPLIER_PURCHASE_ORDER_VERSION_CONFLICT",
  ],
  state_conflict: [
    "SUPPLIER_PURCHASE_REQUISITION_ID_CONFLICT",
    "SUPPLIER_PURCHASE_REQUISITION_STATE_CONFLICT",
    "SUPPLIER_PURCHASE_REQUISITION_PRICE_CHANGED",
    "SUPPLIER_PURCHASE_REQUISITION_BUDGET_CHANGED",
    "SUPPLIER_PURCHASE_REQUISITION_SELF_REVIEW",
    "SUPPLIER_PURCHASE_REQUISITION_ALREADY_CONVERTED",
    "SUPPLIER_PURCHASE_ORDER_STATE_CONFLICT",
    "SUPPLIER_PURCHASE_ORDER_ID_CONFLICT",
  ],
  price_missing: [
    "SUPPLIER_PURCHASE_ORDER_PRICE_MISSING",
  ],
  price_changed: [
    "SUPPLIER_PURCHASE_REQUISITION_PRICE_CHANGED",
  ],
  supplier_not_eligible: ["SUPPLIER_ORDER_NOT_ELIGIBLE"],
  project_invalid: [
    "SUPPLIER_PURCHASE_REQUISITION_PROJECT_INVALID",
    "SUPPLIER_PURCHASE_ORDER_PROJECT_INVALID",
  ],
};

export function mapSupplierCommandDatabaseError(error: unknown) {
  const constraintCode = Object.entries(DATABASE_CONSTRAINT_CODES)
    .find(([constraint]) => containsToken(error, constraint))?.[1];
  const token = constraintCode ?? [
    ...Object.keys(BUSINESS_ERRORS) as SupplierBusinessCode[],
    ...Object.keys(TOKEN_ALIASES) as Array<keyof typeof TOKEN_ALIASES>,
  ]
    .sort((left, right) => right.length - left.length)
    .find((candidate) => containsToken(error, candidate)) as
      | SupplierCommandToken
      | undefined;
  if (!token) return null;
  const code = token in TOKEN_ALIASES
    ? TOKEN_ALIASES[token as keyof typeof TOKEN_ALIASES]
    : token as SupplierBusinessCode;
  const definition = BUSINESS_ERRORS[code];
  return Errors.business(
    definition.statusCode,
    definition.message,
    code,
  );
}

export function mapSupplierPurchaseFulfillmentEnvelopeError(
  status: string,
  errorCode: unknown,
) {
  if (typeof errorCode !== "string") return null;
  const allowedCodes = FULFILLMENT_ENVELOPE_CODES[status];
  if (!allowedCodes?.some((code) => code === errorCode)) return null;
  return mapSupplierCommandDatabaseError(errorCode);
}

export function mapSupplierPurchaseRequisitionEnvelopeError(
  status: string,
  errorCode: unknown,
) {
  if (typeof errorCode !== "string") return null;
  const allowedCodes = REQUISITION_ENVELOPE_CODES[status];
  if (!allowedCodes?.some((code) => code === errorCode)) return null;
  return mapSupplierCommandDatabaseError(errorCode);
}

export function mapSupplierPurchasableProductEnvelopeError(
  status: "validation_error" | "state_conflict",
  errorCode: unknown,
  reason: unknown,
) {
  if (errorCode === "SUPPLIER_PURCHASABLE_PRODUCT_CREATE_FAILED") {
    const reasonError = mapSupplierCommandDatabaseError(reason);
    if (reasonError) return reasonError;
    return Errors.business(
      status === "validation_error" ? 400 : 409,
      status === "validation_error"
        ? "可采购商品参数校验失败"
        : "创建可采购商品失败",
      errorCode,
      typeof reason === "string" ? { reason } : undefined,
    );
  }
  return mapSupplierCommandDatabaseError(errorCode);
}

export function throwSupplierCommandDatabaseError(
  error: unknown,
  fallbackMessage: string,
): never {
  const businessError = mapSupplierCommandDatabaseError(error);
  throw businessError ?? Errors.dbError(fallbackMessage, error);
}

function containsToken(value: unknown, token: string): boolean {
  if (typeof value === "string") {
    return new RegExp(`(^|[^A-Za-z0-9_])${token}($|[^A-Za-z0-9_])`)
      .test(value);
  }
  if (Array.isArray(value)) {
    return value.some((item) => containsToken(item, token));
  }
  if (typeof value !== "object" || value === null) return false;
  return Object.values(value).some((item) => containsToken(item, token));
}
