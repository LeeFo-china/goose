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
  SUPPLIER_PURCHASE_ORDER_NOT_FOUND: {
    statusCode: 404,
    message: "供应商采购单不存在",
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
  SUPPLIER_PURCHASE_ORDER_PROJECT_INVALID: {
    statusCode: 409,
    message: "项目不存在或不属于当前租户",
  },
  SUPPLIER_PURCHASE_ORDER_VERSION_CONFLICT: {
    statusCode: 409,
    message: "采购单版本已变化，请刷新后重试",
  },
  SUPPLIER_PURCHASE_ORDER_STATE_CONFLICT: {
    statusCode: 409,
    message: "采购单当前状态不允许该操作",
  },
  SUPPLIER_PURCHASE_ORDER_PRICE_MISSING: {
    statusCode: 409,
    message: "部分采购商品缺少当前有效价格",
  },
  SUPPLIER_PURCHASE_ORDER_PRICE_CHANGED: {
    statusCode: 409,
    message: "采购价格已变化，请重新确认采购单",
  },
  SUPPLIER_PURCHASE_ORDER_FULFILLMENT_DIRECT_WRITE_FORBIDDEN: {
    statusCode: 409,
    message: "采购履约数据只能通过履约命令变更",
  },
  SUPPLIER_PURCHASE_ORDER_FULFILLMENT_EVENT_IMMUTABLE: {
    statusCode: 409,
    message: "采购履约事件不可修改或删除",
  },
  SUPPLIER_PURCHASE_ORDER_FULFILLMENT_NOT_CONFIRMED: {
    statusCode: 409,
    message: "供应商采购单尚未确认履约",
  },
  SUPPLIER_PURCHASE_ORDER_FULFILLMENT_VALIDATION_ERROR: {
    statusCode: 400,
    message: "采购履约确认参数校验失败",
  },
  SUPPLIER_PURCHASE_ORDER_FULFILLMENT_ALREADY_CONFIRMED: {
    statusCode: 409,
    message: "供应商采购单已确认履约",
  },
  SUPPLIER_PURCHASE_ORDER_FULFILLMENT_STATE_CONFLICT: {
    statusCode: 409,
    message: "采购履约当前状态不允许该操作",
  },
  SUPPLIER_PURCHASE_ORDER_SHIPMENT_VALIDATION_ERROR: {
    statusCode: 400,
    message: "采购发货参数校验失败",
  },
  SUPPLIER_PURCHASE_ORDER_SHIPMENT_ID_CONFLICT: {
    statusCode: 409,
    message: "采购发货记录编号已存在",
  },
  SUPPLIER_PURCHASE_ORDER_RECEIPT_VALIDATION_ERROR: {
    statusCode: 400,
    message: "采购收货参数校验失败",
  },
  SUPPLIER_PURCHASE_ORDER_RECEIPT_ID_CONFLICT: {
    statusCode: 409,
    message: "采购收货记录编号已存在",
  },
  SUPPLIER_PURCHASE_ORDER_ITEM_NOT_FOUND: {
    statusCode: 404,
    message: "供应商采购单明细不存在",
  },
  SUPPLIER_PURCHASE_ORDER_FULFILLMENT_STARTED: {
    statusCode: 409,
    message: "采购履约已开始，不能取消采购单",
  },
  FULFILLMENT_NOT_CONFIRMED: {
    statusCode: 409,
    message: "供应商采购单尚未确认履约",
  },
  FULFILLMENT_VERSION_CONFLICT: {
    statusCode: 409,
    message: "采购履约版本已变化，请刷新后重试",
  },
  OVER_SHIPPED: {
    statusCode: 409,
    message: "本次发货数量超过采购数量",
  },
  OVER_RECEIVED: {
    statusCode: 409,
    message: "本次收货数量超过累计发货数量",
  },
  VARIANCE_REASON_REQUIRED: {
    statusCode: 400,
    message: "存在拒收数量时必须填写差异原因",
  },
} as const;

type SupplierBusinessCode = keyof typeof BUSINESS_ERRORS;

export function mapSupplierCommandDatabaseError(error: unknown) {
  const code = (Object.keys(BUSINESS_ERRORS) as SupplierBusinessCode[])
    .sort((left, right) => right.length - left.length)
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
