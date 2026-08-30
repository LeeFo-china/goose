export const SUPPLIER_PURCHASE_BATCH_ERRORS = {
  SUPPLIER_PURCHASE_BATCH_VALIDATION_ERROR: {
    statusCode: 400, message: "采购批次参数校验失败",
  },
  SUPPLIER_PURCHASE_BATCH_DUPLICATE_SKU: {
    statusCode: 400, message: "同一 SKU 不能重复加入采购批次",
  },
  SUPPLIER_PURCHASE_BATCH_LIMIT_EXCEEDED: {
    statusCode: 400, message: "采购批次商品数量超过上限",
  },
  SUPPLIER_PURCHASE_BATCH_ID_CONFLICT: {
    statusCode: 409, message: "采购批次编号已存在",
  },
  SUPPLIER_PURCHASE_BATCH_NOT_FOUND: {
    statusCode: 404, message: "供应商采购批次不存在",
  },
  SUPPLIER_PURCHASE_BATCH_VERSION_CONFLICT: {
    statusCode: 409, message: "采购批次版本已变化，请刷新后重试",
  },
  SUPPLIER_PURCHASE_BATCH_STATE_CONFLICT: {
    statusCode: 409, message: "采购批次当前状态不允许该操作",
  },
  SUPPLIER_PURCHASE_BATCH_PRICE_CHANGED: {
    statusCode: 409, message: "采购批次价格事实已变化，请重新确认",
  },
  SUPPLIER_PURCHASE_BATCH_BUDGET_CHANGED: {
    statusCode: 409, message: "采购批次预算事实已变化，请重新确认",
  },
  SUPPLIER_PURCHASE_BATCH_ITEM_UNAVAILABLE: {
    statusCode: 409, message: "采购批次包含不可采购的商品",
  },
  SUPPLIER_PURCHASE_BATCH_SUPPLIER_INELIGIBLE: {
    statusCode: 409, message: "采购批次包含当前不可下单的供应商",
  },
  SUPPLIER_PURCHASE_BATCH_SELF_REVIEW: {
    statusCode: 409, message: "申请人不能审批自己创建的采购批次",
  },
  SUPPLIER_PURCHASE_BATCH_MANAGED_REQUISITION: {
    statusCode: 409, message: "批次管理的采购申请不能单独操作",
  },
  SUPPLIER_PURCHASE_BATCH_PROJECT_INVALID: {
    statusCode: 409, message: "项目不存在或不属于当前租户",
  },
  SUPPLIER_PURCHASE_BATCH_OWNERSHIP_IMMUTABLE: {
    statusCode: 409, message: "采购批次归属不可变更",
  },
  SUPPLIER_PURCHASE_BATCH_BUDGET_OVERRIDE_REQUIRED: {
    statusCode: 409, message: "超预算审批需要预算管理权限",
  },
  SUPPLIER_PURCHASE_BATCH_WORKFLOW_MISSING: {
    statusCode: 409, message: "采购批次审批流程未配置或未发布",
  },
  SUPPLIER_PURCHASE_BATCH_WORKFLOW_CONFLICT: {
    statusCode: 409, message: "采购批次审批流程状态冲突，请刷新后重试",
  },
  SUPPLIER_PURCHASE_BATCH_WORKFLOW_NO_APPROVER: {
    statusCode: 409, message: "采购批次审批流程缺少可用审批人",
  },
} as const;
