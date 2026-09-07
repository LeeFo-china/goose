// Business error contract for the new endpoint only. Validation/auth/database
// infrastructure errors continue to use the API's existing error-factory codes.
export const CUSTOMER_LEAD_ERROR_CONFIG = {
  CUSTOMER_LEAD_EMPLOYEE_REQUIRED: { statusCode: 403, message: '当前操作需要员工身份' },
  CUSTOMER_LEAD_NOT_FOUND: { statusCode: 404, message: '客户线索不存在' },
  CUSTOMER_LEAD_ASSIGNEE_NOT_FOUND: { statusCode: 404, message: '负责人不存在或不可用' },
  CUSTOMER_LEAD_APPOINTMENT_NOT_FOUND: { statusCode: 404, message: '量房预约不存在' },
  CUSTOMER_LEAD_VERSION_CONFLICT: { statusCode: 409, message: '线索已更新，请刷新后重试' },
  CUSTOMER_LEAD_IDEMPOTENCY_CONFLICT: { statusCode: 409, message: '幂等键已用于其他请求' },
  CUSTOMER_LEAD_ASSIGNEE_SCOPE_CONFLICT: { statusCode: 409, message: '负责人部门已变化，请刷新后重试' },
  CUSTOMER_LEAD_CUSTOMER_PREFLIGHT_CONFLICT: { statusCode: 409, message: '客户状态已变化，请刷新后重试' },
  CUSTOMER_LEAD_APPOINTMENT_CUSTOMER_CONFLICT: { statusCode: 409, message: '预约关联客户已变化，请刷新后重试' },
  CUSTOMER_LEAD_PHONE_CONFLICT: { statusCode: 409, message: '线索手机号已变化，请刷新后重试' },
  CUSTOMER_LEAD_PHONE_REQUIRED: { statusCode: 409, message: '转客户前需要有效手机号' },
  CUSTOMER_LEAD_INVALID_NOT_CONVERTIBLE: { statusCode: 409, message: '无效线索不能转为客户' },
  CUSTOMER_LEAD_CONVERTED_NOT_INVALIDATABLE: { statusCode: 409, message: '已转化线索不能标记为无效' },
  CUSTOMER_LEAD_NOT_ASSIGNABLE: { statusCode: 409, message: '当前线索不能分配' },
  CUSTOMER_LEAD_NOT_FOLLOWABLE: { statusCode: 409, message: '当前线索不能继续跟进' },
  CUSTOMER_LEAD_APPOINTMENT_TRANSITION_INVALID: { statusCode: 409, message: '量房预约状态不能这样变更' },
  CUSTOMER_LEAD_RESPONSE_INVALID: { statusCode: 500, message: '客户线索响应数据无效' },
} as const satisfies Readonly<Record<string, { readonly statusCode: number; readonly message: string }>>;

export type CustomerLeadErrorCode = keyof typeof CUSTOMER_LEAD_ERROR_CONFIG;
