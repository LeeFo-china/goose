import { Errors } from "@/errors/error-factory";
import { SupabaseDB } from "@/utils/supabase";

export const PROJECT_LOG_SELECT = `
  *,
  employee:employees!project_logs_employee_id_fkey(id, name, avatar)
`;

export type ProjectLogProjectRecord = {
  id: string;
  tenant_id: string | null;
  status: string | null;
};

export type ProjectLogCalendarRow = {
  date: string;
  count: number | string;
  stage_code: string | null;
  node_name: string | null;
};

class ProjectLogRepository {
  async findProjectById(input: { projectId: string; tenantId: string }) {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("projects")
      .select("id, tenant_id, status")
      .eq("id", input.projectId)
      .eq("tenant_id", input.tenantId)
      .maybeSingle();

    if (error) {
      throw Errors.dbError("查询项目失败", error);
    }

    return (data as ProjectLogProjectRecord | null) ?? null;
  }

  async findById(input: { id: string; tenantId: string }) {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("project_logs")
      .select(PROJECT_LOG_SELECT)
      .eq("id", input.id)
      .eq("tenant_id", input.tenantId)
      .maybeSingle();

    if (error) {
      throw Errors.dbError("查询项目日志失败", error);
    }

    return (data as unknown as Record<string, unknown> | null) ?? null;
  }

  async create(payload: Record<string, unknown>) {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("project_logs")
      .insert(payload)
      .select(PROJECT_LOG_SELECT)
      .single();

    if (error) {
      throw Errors.dbError("创建项目日志失败", error);
    }

    return data as unknown as Record<string, unknown>;
  }

  async list(input: {
    tenantId: string;
    visibleProjectIds: string[] | null;
    from: number;
    to: number;
  }) {
    let query = SupabaseDB.getAdminClient()
      .from("project_logs")
      .select(PROJECT_LOG_SELECT, { count: "exact" })
      .eq("tenant_id", input.tenantId)
      .order("created_at", { ascending: false });

    if (Array.isArray(input.visibleProjectIds)) {
      query = query.in("project_id", input.visibleProjectIds);
    }

    const { data, error, count } = await query.range(input.from, input.to);

    if (error) {
      throw Errors.dbError("查询项目日志列表失败", error);
    }

    return {
      rows: (data || []) as unknown as Array<Record<string, unknown>>,
      total: count ?? 0,
    };
  }

  async update(input: {
    id: string;
    tenantId: string;
    payload: Record<string, unknown>;
  }) {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("project_logs")
      .update(input.payload)
      .eq("id", input.id)
      .eq("tenant_id", input.tenantId)
      .select(PROJECT_LOG_SELECT)
      .single();

    if (error) {
      throw Errors.dbError("更新项目日志失败", error);
    }

    return data as unknown as Record<string, unknown>;
  }

  async listByProject(input: {
    projectId: string;
    tenantId: string;
    from: number;
    to: number;
  }) {
    const { data, error, count } = await SupabaseDB.getAdminClient()
      .from("project_logs")
      .select(PROJECT_LOG_SELECT, { count: "exact" })
      .eq("project_id", input.projectId)
      .eq("tenant_id", input.tenantId)
      .order("created_at", { ascending: false })
      .range(input.from, input.to);

    if (error) {
      throw Errors.dbError("查询项目日志失败", error);
    }

    return {
      rows: (data || []) as unknown as Array<Record<string, unknown>>,
      total: count ?? 0,
    };
  }

  async listCalendarRows(projectId: string) {
    const { data, error } = await SupabaseDB.getAdminClient().rpc(
      "get_project_log_calendar",
      {
        project_uuid: projectId,
      },
    );

    if (error) {
      throw Errors.dbError("查询项目日志日历失败", error);
    }

    return (data || []) as ProjectLogCalendarRow[];
  }
}

export const projectLogRepository = new ProjectLogRepository();
