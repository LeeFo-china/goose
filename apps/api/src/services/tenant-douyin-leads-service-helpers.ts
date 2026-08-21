import type { z } from "zod";

import { Errors } from "@/errors/error-factory";
import type {
  TenantDouyinLeadCommandError,
  TenantDouyinLeadCommandResult,
} from "@/repositories/tenant-douyin-leads-contract";
import { TenantDouyinLeadParamsSchema } from
  "@/schema/tenant-douyin-leads";

export function parseRequest<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) throw Errors.fromZod(result.error);
  return result.data;
}

export function parseLeadId(leadId: string): string {
  return parseRequest(TenantDouyinLeadParamsSchema, { id: leadId }).id;
}

export function pagination(page: number, pageSize: number, total: number) {
  return { page, pageSize, total,
    totalPages: total === 0 ? 0 : Math.ceil(total / pageSize) };
}

export function isVisibleAssignee(
  assignedEmployeeId: string | null,
  visibleAssigneeIds: readonly string[] | null,
): boolean {
  return visibleAssigneeIds === null
    || (assignedEmployeeId !== null
      && visibleAssigneeIds.includes(assignedEmployeeId));
}

export function assertTotal(total: number): void {
  if (!Number.isInteger(total) || total < 0) throwInvalidResponse();
}

export function unwrapCommand(result: TenantDouyinLeadCommandResult) {
  if (!result.ok) throwCommandError(result.error);
  return result.data;
}

function throwCommandError(error: TenantDouyinLeadCommandError): never {
  throw Errors.business(error.status_code, commandErrorMessage(error.code), error.code);
}

function commandErrorMessage(code: TenantDouyinLeadCommandError["code"]): string {
  if (code === "DOUYIN_LEAD_NOT_FOUND") return "抖音线索不存在";
  if (code === "DOUYIN_MEASUREMENT_APPOINTMENT_NOT_FOUND") return "量房预约不存在";
  if (code === "DOUYIN_LEAD_ASSIGNEE_NOT_FOUND") return "负责人不存在或不可用";
  if (code === "DOUYIN_LEAD_ASSIGNEE_SCOPE_CONFLICT") {
    return "负责人部门已变化，请刷新后重试";
  }
  if (code === "DOUYIN_LEAD_VERSION_CONFLICT") return "线索已更新，请刷新后重试";
  if (code === "DOUYIN_LEAD_IDEMPOTENCY_CONFLICT") return "幂等键已用于其他请求";
  if (code === "DOUYIN_LEAD_CUSTOMER_PREFLIGHT_CONFLICT") {
    return "客户状态已变化，请刷新后重试";
  }
  if (code === "DOUYIN_MEASUREMENT_APPOINTMENT_TRANSITION_INVALID") {
    return "量房预约状态不能这样变更";
  }
  if (code === "DOUYIN_LEAD_CONVERTED_NOT_INVALIDATABLE") {
    return "已转化线索不能标记为无效";
  }
  if (code === "DOUYIN_LEAD_INVALID_NOT_CONVERTIBLE") return "无效线索不能转为客户";
  if (code === "DOUYIN_LEAD_NOT_ASSIGNABLE") return "当前线索不能分配";
  if (code === "DOUYIN_LEAD_NOT_FOLLOWABLE") return "当前线索不能继续跟进";
  if (code === "DOUYIN_LEAD_ACTOR_NOT_FOUND") return "当前员工不可用";
  if (code.endsWith("_COMMAND_INVALID")) return "线索操作参数无效";
  return "抖音线索操作失败";
}

export function throwLeadNotFound(): never {
  throw Errors.business(404, "抖音线索不存在", "DOUYIN_LEAD_NOT_FOUND");
}

export function throwInvalidResponse(): never {
  throw Errors.business(500, "抖音线索响应数据无效",
    "DOUYIN_LEAD_RESPONSE_INVALID");
}
