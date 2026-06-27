import { Errors } from "@/errors/error-factory";
import { AppError } from "@/errors/app-error";
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

export type ProjectLogStageSummaryRow = {
  stage_code: string | null;
};

export type ProjectLogLatestStageRow = {
  id: string;
  stage_code: string | null;
  node_name: string | null;
  content: string | null;
  created_at: string | null;
};

type ProjectLogCreateFastResult = {
  data?: Record<string, unknown>;
  error?: {
    status_code?: number;
    code?: string;
    message?: string;
  };
};

type ProjectLogSqlClient = (
  strings: TemplateStringsArray,
  ...values: unknown[]
) => Promise<Array<Record<string, unknown>>>;

type ProjectLogSqlConnection = ProjectLogSqlClient & {
  close?: () => Promise<unknown>;
};

type ProjectLogSqlConstructor = new (url: string) => ProjectLogSqlConnection;

function getBunSqlConstructor() {
  const bunRuntime = (globalThis as {
    Bun?: { SQL?: ProjectLogSqlConstructor };
  }).Bun;
  return bunRuntime?.SQL ?? null;
}

function getProjectLogDatabaseUrl() {
  return process.env.SUPABASE_DB_URL ||
    process.env.SUPABASE_DB_DIRECT_URL;
}

function normalizeProjectLogRpcRow(row: Record<string, unknown>) {
  if (typeof row.images !== "string") {
    return row;
  }

  try {
    return {
      ...row,
      images: JSON.parse(row.images) as unknown,
    };
  } catch {
    return row;
  }
}

function isPostgrestRangeNotSatisfiable(error: unknown) {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "PGRST103",
  );
}

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

  async createFast(input: {
    tenantId: string;
    employeeId: string;
    tenantDepartmentId?: string | null;
    projectLogScope?: string | null;
    payload: {
      project_id: string;
      stage_code: string;
      node_name?: string | null;
      content: string;
      images?: unknown;
    };
  }) {
    const SqlConstructor = getBunSqlConstructor();
    const databaseUrl = getProjectLogDatabaseUrl();
    if (SqlConstructor && databaseUrl) {
      return this.createFastViaSql(SqlConstructor, databaseUrl, input);
    }

    return this.createFastViaSupabaseRpc(input);
  }

  private handleCreateFastResult(result: ProjectLogCreateFastResult | null) {
    if (result?.error) {
      throw new AppError(
        result.error.status_code ?? 400,
        result.error.message ?? "创建项目日志失败",
        result.error.code ?? "PROJECT_LOG_CREATE_FAILED",
      );
    }

    if (!result?.data) {
      throw Errors.dbError("创建项目日志失败", { reason: "empty_rpc_result" });
    }

    return normalizeProjectLogRpcRow(result.data);
  }

  private async createFastViaSql(
    SqlConstructor: ProjectLogSqlConstructor,
    databaseUrl: string,
    input: Parameters<ProjectLogRepository["createFast"]>[0],
  ) {
    const sqlClient = new SqlConstructor(databaseUrl);
    try {
      const rows = await sqlClient`
        SELECT public.create_project_log_fast(
          ${input.tenantId}::uuid,
          ${input.employeeId}::uuid,
          ${input.payload.project_id}::uuid,
          ${input.payload.stage_code},
          ${input.payload.node_name ?? null},
          ${input.payload.content},
          (${JSON.stringify(input.payload.images ?? [])}::text)::jsonb,
          ${input.projectLogScope ?? null},
          ${input.tenantDepartmentId ?? null}::uuid
        ) AS result
      `;

      const firstRow = rows[0] as { result?: ProjectLogCreateFastResult } | undefined;
      return this.handleCreateFastResult(firstRow?.result ?? null);
    } finally {
      await sqlClient.close?.();
    }
  }

  private async createFastViaSupabaseRpc(
    input: Parameters<ProjectLogRepository["createFast"]>[0],
  ) {
    const { data, error } = await SupabaseDB.getAdminClient().rpc(
      "create_project_log_fast",
      {
        p_tenant_id: input.tenantId,
        p_employee_id: input.employeeId,
        p_project_id: input.payload.project_id,
        p_stage_code: input.payload.stage_code,
        p_node_name: input.payload.node_name ?? null,
        p_content: input.payload.content,
        p_images: input.payload.images ?? [],
        p_project_log_scope: input.projectLogScope ?? null,
        p_tenant_department_id: input.tenantDepartmentId ?? null,
      },
    );

    if (error) {
      throw Errors.dbError("创建项目日志失败", error);
    }

    return this.handleCreateFastResult(data as ProjectLogCreateFastResult | null);
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
    return this.listByProjectViaSupabase(input);
  }

  private async listByProjectViaSupabase(input: {
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
      if (isPostgrestRangeNotSatisfiable(error)) {
        const { error: countError, count } = await SupabaseDB.getAdminClient()
          .from("project_logs")
          .select("id", { count: "exact" })
          .eq("project_id", input.projectId)
          .eq("tenant_id", input.tenantId)
          .order("created_at", { ascending: false })
          .range(0, 0);

        if (countError) {
          throw Errors.dbError("查询项目日志总数失败", countError);
        }

        return {
          rows: [] as Array<Record<string, unknown>>,
          total: count ?? 0,
        };
      }

      throw Errors.dbError("查询项目日志失败", error);
    }

    return {
      rows: (data || []) as unknown as Array<Record<string, unknown>>,
      total: count ?? 0,
    };
  }

  async listBootstrapByProject(input: {
    projectId: string;
    tenantId: string;
    from: number;
    limit: number;
  }) {
    const to = input.from + input.limit - 1;
    const { data, error, count } = await SupabaseDB.getAdminClient()
      .from("project_logs")
      .select(`
        id,
        project_id,
        tenant_id,
        employee_id,
        stage_code,
        node_name,
        content,
        images,
        created_at,
        employee:employees!project_logs_employee_id_fkey(id, name, avatar)
      `, { count: "exact" })
      .eq("project_id", input.projectId)
      .eq("tenant_id", input.tenantId)
      .order("created_at", { ascending: false })
      .range(input.from, to);

    if (error) {
      throw Errors.dbError("查询项目日志首屏摘要失败", error);
    }

    const rows = (data || []) as unknown as Array<Record<string, unknown>>;
    const total = count ?? 0;
    return {
      rows,
      hasMore: total > input.from + rows.length,
      total,
    };
  }

  async listCalendarRows(input: {
    projectId: string;
    tenantId: string;
  }) {
    return this.listCalendarRowsViaSupabaseRpc(input.projectId);
  }

  private async listCalendarRowsViaSupabaseRpc(projectId: string) {
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

  async listStageCodesByProject(input: {
    projectId: string;
    tenantId?: string | null;
  }) {
    let query = SupabaseDB.getAdminClient()
      .from("project_logs")
      .select("stage_code")
      .eq("project_id", input.projectId);

    if (input.tenantId) {
      query = query.eq("tenant_id", input.tenantId);
    }

    const { data, error } = await query;

    if (error) {
      throw Errors.dbError("查询项目施工日志阶段失败", error);
    }

    return (data || []) as ProjectLogStageSummaryRow[];
  }

  async listLatestLogsByStages(input: {
    projectId: string;
    stageCodes: readonly string[];
    tenantId?: string | null;
  }) {
    if (input.stageCodes.length === 0) {
      return [] as ProjectLogLatestStageRow[];
    }

    let query = SupabaseDB.getAdminClient()
      .from("project_logs")
      .select("id, stage_code, node_name, content, created_at")
      .eq("project_id", input.projectId)
      .in("stage_code", [...input.stageCodes])
      .order("created_at", { ascending: false });

    if (input.tenantId) {
      query = query.eq("tenant_id", input.tenantId);
    }

    const { data, error } = await query;

    if (error) {
      throw Errors.dbError("查询项目施工阶段最近日志失败", error);
    }

    const latest = new Map<string, ProjectLogLatestStageRow>();
    for (const row of (data || []) as ProjectLogLatestStageRow[]) {
      if (row.stage_code && !latest.has(row.stage_code)) {
        latest.set(row.stage_code, row);
      }
    }

    return [...latest.values()];
  }
}

export const projectLogRepository = new ProjectLogRepository();
