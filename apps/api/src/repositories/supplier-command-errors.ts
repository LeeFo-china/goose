import { Errors } from "@/errors/error-factory";

const BUSINESS_ERRORS = {
  SUPPLIER_IDEMPOTENCY_CONFLICT: {
    statusCode: 409,
    message: "幂等键已用于其他供应商操作",
  },
  SUPPLIER_PRODUCT_NOT_FOUND: {
    statusCode: 404,
    message: "供应商商品不存在",
  },
  SUPPLIER_SKU_NOT_FOUND: {
    statusCode: 404,
    message: "供应商 SKU 不存在",
  },
  SUPPLIER_PRICE_LIST_NOT_FOUND: {
    statusCode: 404,
    message: "供应商价格簿不存在",
  },
  SUPPLIER_PROXY_ACTOR_INVALID: {
    statusCode: 403,
    message: "供应商代录身份无效",
  },
  SUPPLIER_MODULE_DISABLED: {
    statusCode: 409,
    message: "供应商模块未启用",
  },
  SUPPLIER_ORDER_NOT_ELIGIBLE: {
    statusCode: 409,
    message: "当前供应商关系不允许继续该操作",
  },
  SUPPLIER_CATALOG_REFERENCE_INVALID: {
    statusCode: 409,
    message: "供应标准目录引用无效",
  },
  SUPPLIER_CATALOG_REFERENCE_IN_USE: {
    statusCode: 409,
    message: "供应标准目录仍被业务数据引用",
  },
  SUPPLIER_PRODUCT_STATE_CONFLICT: {
    statusCode: 409,
    message: "供应商商品当前状态不允许该操作",
  },
  SUPPLIER_SKU_STATE_CONFLICT: {
    statusCode: 409,
    message: "供应商 SKU 当前状态不允许该操作",
  },
  SUPPLIER_PRICE_LIST_INVALID_ACTION: {
    statusCode: 409,
    message: "供应商价格簿当前状态不允许该操作",
  },
} as const;

type SupplierBusinessCode = keyof typeof BUSINESS_ERRORS;

export function mapSupplierCommandDatabaseError(error: unknown) {
  const code = (Object.keys(BUSINESS_ERRORS) as SupplierBusinessCode[])
    .find((candidate) => containsToken(error, candidate));
  if (!code) return null;
  const definition = BUSINESS_ERRORS[code];
  return Errors.business(
    definition.statusCode,
    definition.message,
    code,
  );
}

export function throwSupplierCommandDatabaseError(
  error: unknown,
  fallbackMessage: string,
): never {
  const businessError = mapSupplierCommandDatabaseError(error);
  throw businessError ?? Errors.dbError(fallbackMessage, error);
}

function containsToken(value: unknown, token: string): boolean {
  if (typeof value === "string") return value.includes(token);
  if (Array.isArray(value)) {
    return value.some((item) => containsToken(item, token));
  }
  if (typeof value !== "object" || value === null) return false;
  return Object.values(value).some((item) => containsToken(item, token));
}
