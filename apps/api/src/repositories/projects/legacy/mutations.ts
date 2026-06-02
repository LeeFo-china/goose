import { Errors, ErrorCodes, getRpcErrorText, normalizeRpcError, SupabaseDB } from "./shared";
import type { CreateProjectInput, UpdateProjectInput } from "./shared";

export async function update(this: any, id: string, input: UpdateProjectInput, tenantId?: string | null) {
  let query = SupabaseDB.getAdminClient()
    .from("projects")
    .update(input)
    .eq("id", id);

  if (tenantId) {
    query = query.eq("tenant_id", tenantId);
  }

  const { data, error } = await query.select("*").maybeSingle();

  if (error) {
    throw Errors.dbError("更新项目失败", error);
  }

  if (!data) {
    throw Errors.badRequest("项目不存在或更新失败");
  }

  return data;
}

export async function updateIfStatus(this: any, input: {
  id: string;
  tenantId: string;
  expectedStatus: string;
  payload: UpdateProjectInput;
}) {
  const { data, error } = await SupabaseDB.getAdminClient()
    .from("projects")
    .update(input.payload)
    .eq("id", input.id)
    .eq("tenant_id", input.tenantId)
    .eq("status", input.expectedStatus)
    .select("*")
    .maybeSingle();

  if (error) {
    throw Errors.dbError("更新项目状态失败", error);
  }

  return data;
}

export async function scheduleConstructionTransition(this: any, input: {
  projectId: string;
  tenantId: string;
  expectedStatus: string;
  toStatus: string;
  startDate: string;
  constructionManagerEmployeeId: string;
  operatorEmployeeId?: string | null;
  operatorAuthUserId?: string | null;
  reason?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const { data, error } = await this.rpc(
    "schedule_project_construction_transition",
    {
      p_project_id: input.projectId,
      p_tenant_id: input.tenantId,
      p_expected_status: input.expectedStatus,
      p_to_status: input.toStatus,
      p_start_date: input.startDate,
      p_construction_manager_employee_id: input.constructionManagerEmployeeId,
      p_operator_employee_id: input.operatorEmployeeId ?? null,
      p_operator_auth_user_id: input.operatorAuthUserId ?? null,
      p_reason: input.reason ?? null,
      p_metadata: input.metadata ?? {},
    },
  );

  if (error) {
    const rpcError = normalizeRpcError(error);
    const message = getRpcErrorText(rpcError);
    const diagnostic = {
      project_id: input.projectId,
      tenant_id: input.tenantId,
      expected_status: input.expectedStatus,
      to_status: input.toStatus,
      start_date: input.startDate,
      construction_manager_employee_id: input.constructionManagerEmployeeId,
      rpc_error: rpcError,
    };

    if (message.includes("PROJECT_STATUS_CONFLICT")) {
      throw Errors.business(
        409,
        "项目状态已变化，请刷新后重试",
        ErrorCodes.PROJECT_STATUS_CONFLICT,
        diagnostic,
      );
    }
    if (message.includes("INVALID_CONSTRUCTION_MANAGER")) {
      throw Errors.business(
        400,
        "所选员工不能作为工程负责人",
        ErrorCodes.INVALID_CONSTRUCTION_MANAGER,
        diagnostic,
      );
    }
    if (message.includes("PROJECT_NOT_FOUND")) {
      throw Errors.badRequest("项目不存在");
    }
    if (
      rpcError.code === "23514" ||
      message.includes("violates check constraint")
    ) {
      throw Errors.business(
        500,
        "排期开工状态流转约束不匹配，请联系管理员",
        ErrorCodes.PROJECT_SCHEDULE_TRANSITION_CONSTRAINT_FAILED,
        diagnostic,
      );
    }
    if (
      rpcError.code === "23503" ||
      message.includes("violates foreign key constraint")
    ) {
      throw Errors.business(
        500,
        "排期开工关联数据不完整，请联系管理员",
        ErrorCodes.PROJECT_SCHEDULE_TRANSITION_FAILED,
        diagnostic,
      );
    }
    if (
      rpcError.code === "23505" ||
      message.includes("duplicate key value")
    ) {
      throw Errors.business(
        409,
        "工程负责人已存在，请刷新项目后重试",
        ErrorCodes.PROJECT_SCHEDULE_TRANSITION_FAILED,
        diagnostic,
      );
    }
    throw Errors.business(
      500,
      "排期开工状态流转失败",
      ErrorCodes.PROJECT_SCHEDULE_TRANSITION_FAILED,
      diagnostic,
    );
  }

  if (!data) {
    throw Errors.business(
      500,
      "排期开工状态流转失败",
      ErrorCodes.PROJECT_SCHEDULE_TRANSITION_FAILED,
      {
        project_id: input.projectId,
        tenant_id: input.tenantId,
        expected_status: input.expectedStatus,
        to_status: input.toStatus,
        start_date: input.startDate,
        construction_manager_employee_id: input.constructionManagerEmployeeId,
        rpc_error: null,
      },
    );
  }

  return data as Record<string, unknown>;
}
