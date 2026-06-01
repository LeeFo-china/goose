import {
  Errors,
  SupabaseDB,
  authorizationService,
  isEmployeeOperableStatus,
  type CustomerContextRow,
  type DecorationQaAuthInput,
  type DecorationQaUsageContext,
  type DecorationQaUsageSource,
} from './shared';

export function normalizeRelation<T extends Record<string, unknown>>(
  value: unknown,
  fallback: T,
): T {
  if (Array.isArray(value)) {
    const first = value[0];
    if (first && typeof first === "object") {
      return { ...fallback, ...(first as T) };
    }

    return fallback;
  }

  if (value && typeof value === "object") {
    return { ...fallback, ...(value as T) };
  }

  return fallback;
}

export function normalizeStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [] as string[];
  }

  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
}

export async function getCustomerContextByAuthUserId(authUserId: string) {
  const customer = await findCustomerContextByAuthUserId(authUserId);

  if (!customer) {
    throw Errors.forbidden();
  }

  return customer;
}

export async function findCustomerContextByAuthUserId(authUserId: string) {
  const { data, error } = await SupabaseDB.getAdminClient()
    .from("customers")
    .select("id, name, user_id, tenant_id")
    .eq("user_id", authUserId)
    .limit(2);

  if (error) {
    throw Errors.dbError("查询客户身份失败", error);
  }

  const list = (data || []) as CustomerContextRow[];
  if (list.length > 1) {
    throw Errors.badRequest("当前账号绑定了多个客户档案，请联系管理员处理");
  }

  return list[0] ?? null;
}

export function getSourceFromAuth(
  input: DecorationQaAuthInput,
): DecorationQaUsageSource {
  if (input.roles?.includes("customer") || input.customerId) {
    return "customer_miniprogram";
  }

  if (input.roles?.includes("employee") || input.employeeId) {
    return "employee_miniprogram";
  }

  return "visitor";
}
