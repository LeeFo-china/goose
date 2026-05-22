import { Errors } from "@/errors/error-factory";
import type { ProjectStatus, ProjectStatusAction } from "@gooes/domain";
import { SupabaseDB } from "@/utils/supabase";

export type ProjectStatusTransitionCreateInput = {
  tenantId: string;
  projectId: string;
  fromStatus: ProjectStatus | null;
  toStatus: ProjectStatus;
  action: ProjectStatusAction;
  operatorEmployeeId?: string | null;
  operatorAuthUserId?: string | null;
  reason?: string | null;
  metadata?: Record<string, unknown>;
};

export type ProjectStatusTransitionRecord = {
  id: string;
  tenant_id: string;
  project_id: string;
  from_status: ProjectStatus | null;
  to_status: ProjectStatus;
  action: ProjectStatusAction;
  operator_employee_id: string | null;
  operator_auth_user_id: string | null;
  reason: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

class ProjectStatusTransitionRepository {
  async create(input: ProjectStatusTransitionCreateInput) {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("project_status_transition_logs")
      .insert({
        tenant_id: input.tenantId,
        project_id: input.projectId,
        from_status: input.fromStatus,
        to_status: input.toStatus,
        action: input.action,
        operator_employee_id: input.operatorEmployeeId ?? null,
        operator_auth_user_id: input.operatorAuthUserId ?? null,
        reason: input.reason ?? null,
        metadata: input.metadata ?? {},
      })
      .select("*")
      .single();

    if (error) {
      throw Errors.dbError("写入项目状态流转日志失败", error);
    }

    return data as ProjectStatusTransitionRecord;
  }

  async findLatestPause(projectId: string, tenantId: string) {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("project_status_transition_logs")
      .select("*")
      .eq("project_id", projectId)
      .eq("tenant_id", tenantId)
      .eq("action", "pause_project")
      .eq("to_status", "on_hold")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      throw Errors.dbError("查询项目暂停状态失败", error);
    }

    return (data as ProjectStatusTransitionRecord | null) ?? null;
  }

  async listByProject(input: {
    projectId: string;
    tenantId: string;
    page: number;
    pageSize: number;
    includeCount?: boolean;
  }) {
    const from = (input.page - 1) * input.pageSize;
    const to = from + input.pageSize - 1;
    const query = SupabaseDB.getAdminClient()
      .from("project_status_transition_logs")
      .select("*", input.includeCount ? { count: "exact" } : undefined)
      .eq("project_id", input.projectId)
      .eq("tenant_id", input.tenantId)
      .order("created_at", { ascending: false })
      .range(from, to);
    const { data, error, count } = await query;

    if (error) {
      throw Errors.dbError("查询项目状态流转日志失败", error);
    }

    return {
      rows: (data || []) as ProjectStatusTransitionRecord[],
      total: input.includeCount ? count ?? 0 : null,
    };
  }
}

export const projectStatusTransitionRepository = new ProjectStatusTransitionRepository();
