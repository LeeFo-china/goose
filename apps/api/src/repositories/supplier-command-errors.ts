import { Errors } from "@/errors/error-factory";
import { SUPPLIER_PURCHASE_BATCH_ERRORS } from "@/repositories/supplier-purchase-batch-errors";
const BUSINESS_ERRORS = {
  ...SUPPLIER_PURCHASE_BATCH_ERRORS,
  SUPPLIER_NOT_FOUND: {
    statusCode: 404,
    message: "供应商不存在",
  },
  SUPPLIER_STATE_CONFLICT: {
    statusCode: 409,
    message: "供应商当前状态不允许该操作",
  },
  SUPPLIER_VERSION_CONFLICT: {
    statusCode: 409,
    message: "供应商版本已变化，请刷新后重试",
  },
  SUPPLIER_IDEMPOTENCY_CONFLICT: {
    statusCode: 409,
    message: "幂等键已用于其他供应商操作",
  },
  SUPPLIER_CODE_ALLOCATION_CONFLICT: {
    statusCode: 409,
    message: "供应商内部编码分配冲突，请重新生成",
  },
  SUPPLIER_CODE_CONFLICT: {
    statusCode: 409,
    message: "供应商内部编码已存在",
  },
  SUPPLIER_OWNERSHIP_CONFLICT: {
    statusCode: 409,
    message: "供应商归属与当前操作不匹配",
  },
  SUPPLIER_IDENTITY_CONFLICT: {
    statusCode: 409,
    message: "供应商身份信息已存在",
  },
  TENANT_SUPPLIER_STATE_CONFLICT: {
    statusCode: 409,
    message: "租户供应商当前状态不允许该操作",
  },
  TENANT_SUPPLIER_NOT_FOUND: {
    statusCode: 404,
    message: "租户供应商合作关系不存在",
  },
  SUPPLIER_PRODUCT_NOT_FOUND: {
    statusCode: 404, message: "供应商商品不存在",
  },
  SUPPLIER_PRODUCT_CODE_CONFLICT: {
    statusCode: 409, message: "供应商商品编码已存在",
  },
  SUPPLIER_PRODUCT_ID_CONFLICT: {
    statusCode: 409,
    message: "商品编号已存在",
  },
  PRODUCT_OWNERSHIP_CONFLICT: {
    statusCode: 409,
    message: "供应商商品归属与当前操作不匹配",
  },
  SUPPLIER_SKU_NOT_FOUND: {
    statusCode: 404,
    message: "供应商 SKU 不存在",
  },
  SUPPLIER_SKU_CODE_CONFLICT: {
    statusCode: 409, message: "供应商 SKU 编码已存在",
  },
  SUPPLIER_SKU_ID_CONFLICT: {
    statusCode: 409, message: "供应商 SKU 编号已存在",
  },
  PLATFORM_PERMISSION_REQUIRED: {
    statusCode: 403,
    message: "缺少平台供应商商品管理权限",
  },
  SUPPLIER_PRICE_LIST_NOT_FOUND: {
    statusCode: 404, message: "供应商价格簿不存在",
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
  SUPPLIER_OWNERSHIP_READS_DISABLED: {
    statusCode: 403,
    message: "供应商所有权读取尚未启用",
  },
  PRIVATE_CATALOG_WRITES_DISABLED: {
    statusCode: 403,
    message: "租户私有目录维护尚未启用",
  },
  SHARED_RESOURCE_READ_ONLY: {
    statusCode: 403,
    message: "平台共享目录资源只读",
  },
  CATEGORY_OWNERSHIP_CONFLICT: {
    statusCode: 409,
    message: "目录分类归属与当前操作不匹配",
  },
  BRAND_OWNERSHIP_CONFLICT: {
    statusCode: 409,
    message: "目录品牌归属与当前操作不匹配",
  },
  SPEC_TEMPLATE_VALIDATION_ERROR: {
    statusCode: 409,
    message: "目录规格模板校验失败",
  },
  SUPPLIER_CATALOG_CONFLICT: {
    statusCode: 409,
    message: "供应商目录数据冲突",
  },
  UNIT_CONVERSION_INVALID: {
    statusCode: 400,
    message: "单位换算参数无效",
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
    statusCode: 409, message: "供应商商品当前状态不允许该操作",
  },
  SUPPLIER_PRODUCT_ACTIVE_SKU_REQUIRED: {
    statusCode: 409, message: "启用商品前至少需要启用一个 SKU",
  },
  SUPPLIER_PRODUCT_VERSION_CONFLICT: {
    statusCode: 409, message: "供应商商品版本已变化，请刷新后重试",
  },
  PRODUCT_CATEGORY_CHANGE_REQUIRES_SKU_MIGRATION: {
    statusCode: 409,
    message: "商品已有 SKU，变更分类前必须先迁移 SKU 规格",
  },
  SUPPLIER_SKU_STATE_CONFLICT: {
    statusCode: 409,
    message: "供应商 SKU 当前状态不允许该操作",
  },
  SUPPLIER_SKU_VERSION_CONFLICT: {
    statusCode: 409, message: "供应商 SKU 版本已变化，请刷新后重试",
  },
  SUPPLIER_PRICE_LIST_INVALID_ACTION: {
    statusCode: 409,
    message: "供应商价格簿当前状态不允许该操作",
  },
  SUPPLIER_PRICE_LIST_VERSION_CONFLICT: {
    statusCode: 409, message: "供应商价格簿版本已变化，请刷新后重试",
  },
  SUPPLIER_PRICE_ITEM_NOT_FOUND: {
    statusCode: 404, message: "供应商价格条目不存在",
  },
  SUPPLIER_PRICE_PERIOD_CONFLICT: {
    statusCode: 409, message: "供应商价格生效期存在重叠",
  },
  SUPPLIER_PURCHASABLE_PRODUCT_CREATE_FAILED: {
    statusCode: 409, message: "创建可采购商品失败",
  },
  SUPPLIER_PURCHASABLE_SKU_SAVE_FAILED: {
    statusCode: 409, message: "保存供应商 SKU 与供货价失败",
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
  SUPPLIER_PURCHASE_ORDER_VALIDATION_ERROR: {
    statusCode: 400,
    message: "采购单参数校验失败",
  },
  SUPPLIER_PURCHASE_ORDER_DUPLICATE_SKU: {
    statusCode: 400,
    message: "同一 SKU 不能重复添加",
  },
  SUPPLIER_PURCHASE_ORDER_AMOUNT_LIMIT_EXCEEDED: {
    statusCode: 400,
    message: "采购单金额超过数据库上限",
  },
  SUPPLIER_PURCHASE_ORDER_ID_CONFLICT: {
    statusCode: 409,
    message: "采购单编号已存在",
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
  SUPPLIER_PURCHASE_ORDER_FULFILLMENT_VERSION_CONFLICT: {
    statusCode: 409,
    message: "采购履约版本已变化，请刷新后重试",
  },
  SUPPLIER_PURCHASE_ORDER_OVER_SHIPPED: {
    statusCode: 409,
    message: "本次发货数量超过采购数量",
  },
  SUPPLIER_PURCHASE_ORDER_OVER_RECEIVED: {
    statusCode: 409,
    message: "本次收货数量超过累计发货数量",
  },
  SUPPLIER_PURCHASE_ORDER_VARIANCE_REASON_REQUIRED: {
    statusCode: 400,
    message: "存在拒收数量时必须填写差异原因",
  },
  SUPPLIER_PURCHASE_REQUISITION_VALIDATION_ERROR: {
    statusCode: 400,
    message: "采购申请参数校验失败",
  },
  SUPPLIER_PURCHASE_REQUISITION_DUPLICATE_SKU: {
    statusCode: 400,
    message: "同一 SKU 不能重复添加",
  },
  SUPPLIER_PURCHASE_REQUISITION_AMOUNT_LIMIT_EXCEEDED: {
    statusCode: 400,
    message: "采购申请金额超过数据库上限",
  },
  SUPPLIER_PURCHASE_REQUISITION_ID_CONFLICT: {
    statusCode: 409,
    message: "采购申请编号已存在",
  },
  SUPPLIER_PURCHASE_REQUISITION_NOT_FOUND: {
    statusCode: 404,
    message: "供应商采购申请不存在",
  },
  SUPPLIER_PURCHASE_REQUISITION_VERSION_CONFLICT: {
    statusCode: 409,
    message: "采购申请版本已变化，请刷新后重试",
  },
  SUPPLIER_PURCHASE_REQUISITION_STATE_CONFLICT: {
    statusCode: 409,
    message: "采购申请当前状态不允许该操作",
  },
  SUPPLIER_PURCHASE_REQUISITION_PROJECT_INVALID: {
    statusCode: 409,
    message: "项目不存在或不属于当前租户",
  },
  SUPPLIER_PURCHASE_REQUISITION_PRICE_CHANGED: {
    statusCode: 409,
    message: "采购申请价格已变化，请重新确认",
  },
  SUPPLIER_PURCHASE_REQUISITION_BUDGET_CHANGED: {
    statusCode: 409,
    message: "采购申请预算事实已变化，请重新提交",
  },
  SUPPLIER_PURCHASE_REQUISITION_SELF_REVIEW: {
    statusCode: 409,
    message: "申请人不能审批自己提交的采购申请",
  },
  SUPPLIER_PURCHASE_REQUISITION_ALREADY_CONVERTED: {
    statusCode: 409,
    message: "采购申请已转换为采购单",
  },
} as const;

type SupplierBusinessCode = keyof typeof BUSINESS_ERRORS;
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
