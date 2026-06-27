import { Errors, SupabaseDB, PROJECT_DETAIL_SELECT, EMPLOYEE_PROJECT_BOOTSTRAP_SELECT } from "./shared";
import type { EmployeeProjectBootstrapBundle } from "./shared";

export async function findById(this: any, id: string, tenantId?: string | null) {
  let query = SupabaseDB.getAdminClient()
    .from("projects")
    .select("*")
    .eq("id", id);

  if (tenantId) {
    query = query.eq("tenant_id", tenantId);
  }

  const { data, error } = await query.maybeSingle();

  if (error) {
    throw Errors.dbError("查询项目失败", error);
  }

  return data;
}

export async function findDetailById(this: any, id: string, tenantId: string) {
  const { data, error } = await SupabaseDB.getAdminClient()
    .from("projects")
    .select(PROJECT_DETAIL_SELECT)
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (error) {
    throw Errors.dbError("查询失败", error);
  }

  return (data as unknown as Record<string, unknown> | null) ?? null;
}

export async function findEmployeeBootstrapDetailById(this: any, id: string, tenantId: string) {
  const { data, error } = await SupabaseDB.getAdminClient()
    .from("projects")
    .select(EMPLOYEE_PROJECT_BOOTSTRAP_SELECT)
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (error) {
    throw Errors.dbError("查询项目首屏详情失败", error);
  }

  return (data as unknown as Record<string, unknown> | null) ?? null;
}

export async function getEmployeeBootstrapBundle(this: any, input: {
  projectId: string;
  tenantId: string;
  logLimit: number;
}) {
  const [bundleResult, logCountResult] = await Promise.all([
    this.rpc(
      "get_employee_project_detail_bootstrap_data",
      {
        p_project_id: input.projectId,
        p_tenant_id: input.tenantId,
        p_log_limit: input.logLimit,
      },
    ),
    SupabaseDB.getAdminClient()
      .from("project_logs")
      .select("id", { count: "exact", head: true })
      .eq("project_id", input.projectId)
      .eq("tenant_id", input.tenantId),
  ]);

  if (bundleResult.error) {
    throw Errors.dbError("查询员工项目首屏聚合数据失败", bundleResult.error);
  }

  if (logCountResult.error) {
    throw Errors.dbError("查询员工项目首屏日志总数失败", logCountResult.error);
  }

  const bundle = (bundleResult.data || {}) as Partial<EmployeeProjectBootstrapBundle>;
  return {
    project: bundle.project ?? null,
    members: Array.isArray(bundle.members) ? bundle.members : [],
    acceptance_rows: Array.isArray(bundle.acceptance_rows)
      ? bundle.acceptance_rows
      : [],
    log_stage_rows: Array.isArray(bundle.log_stage_rows)
      ? bundle.log_stage_rows
      : [],
    latest_log_rows: Array.isArray(bundle.latest_log_rows)
      ? bundle.latest_log_rows
      : [],
    logs: {
      rows: Array.isArray(bundle.logs?.rows) ? bundle.logs.rows : [],
      has_more: Boolean(bundle.logs?.has_more),
      total: typeof bundle.logs?.total === "number"
        ? bundle.logs.total
        : logCountResult.count ?? 0,
      comment_counts: Array.isArray(bundle.logs?.comment_counts)
        ? bundle.logs.comment_counts
        : [],
    },
  } satisfies EmployeeProjectBootstrapBundle;
}
