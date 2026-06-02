import { Errors, getAsiaShanghaiTodayRange, SupabaseDB, PROJECT_LIST_SELECT } from "./shared";
import type { ProjectCoreListFilters } from "./shared";

export async function listTodayWorkProjectIds(this: any, tenantId: string) {
  const { startIso, endIso } = getAsiaShanghaiTodayRange();
  const ids = new Set<string>();

  const addProjectRows = (rows: Array<{ id?: string | null }> | null) => {
    (rows || []).forEach((item) => {
      if (item.id) ids.add(item.id);
    });
  };
  const addProjectIdRows = (
    rows: Array<{ project_id?: string | null }> | null,
  ) => {
    (rows || []).forEach((item) => {
      if (item.project_id) ids.add(item.project_id);
    });
  };

  const [
    createdProjects,
    updatedProjects,
    todayLogs,
    createdAcceptances,
    submittedAcceptances,
    reviewedAcceptances,
    customerConfirmedAcceptances,
  ] = await Promise.all([
    SupabaseDB.getAdminClient()
      .from("projects")
      .select("id")
      .eq("tenant_id", tenantId)
      .gte("created_at", startIso)
      .lt("created_at", endIso),
    SupabaseDB.getAdminClient()
      .from("projects")
      .select("id")
      .eq("tenant_id", tenantId)
      .gte("updated_at", startIso)
      .lt("updated_at", endIso),
    SupabaseDB.getAdminClient()
      .from("project_logs")
      .select("project_id")
      .eq("tenant_id", tenantId)
      .gte("created_at", startIso)
      .lt("created_at", endIso),
    SupabaseDB.getAdminClient()
      .from("project_acceptances")
      .select("project_id")
      .eq("tenant_id", tenantId)
      .gte("created_at", startIso)
      .lt("created_at", endIso),
    SupabaseDB.getAdminClient()
      .from("project_acceptances")
      .select("project_id")
      .eq("tenant_id", tenantId)
      .gte("submitted_at", startIso)
      .lt("submitted_at", endIso),
    SupabaseDB.getAdminClient()
      .from("project_acceptances")
      .select("project_id")
      .eq("tenant_id", tenantId)
      .gte("reviewed_at", startIso)
      .lt("reviewed_at", endIso),
    SupabaseDB.getAdminClient()
      .from("project_acceptances")
      .select("project_id")
      .eq("tenant_id", tenantId)
      .gte("customer_confirmed_at", startIso)
      .lt("customer_confirmed_at", endIso),
  ]);

  if (createdProjects.error) {
    throw Errors.dbError("查询今日新增项目失败", createdProjects.error);
  }
  if (updatedProjects.error) {
    throw Errors.dbError("查询今日更新项目失败", updatedProjects.error);
  }
  if (todayLogs.error) {
    throw Errors.dbError("查询今日项目日志失败", todayLogs.error);
  }
  if (createdAcceptances.error) {
    throw Errors.dbError("查询今日发起验收失败", createdAcceptances.error);
  }
  if (submittedAcceptances.error) {
    throw Errors.dbError("查询今日提交验收失败", submittedAcceptances.error);
  }
  if (reviewedAcceptances.error) {
    throw Errors.dbError("查询今日复核验收失败", reviewedAcceptances.error);
  }
  if (customerConfirmedAcceptances.error) {
    throw Errors.dbError("查询今日客户确认验收失败", customerConfirmedAcceptances.error);
  }

  addProjectRows(createdProjects.data as Array<{ id: string }> | null);
  addProjectRows(updatedProjects.data as Array<{ id: string }> | null);
  addProjectIdRows(todayLogs.data as Array<{ project_id: string | null }> | null);
  addProjectIdRows(
    createdAcceptances.data as Array<{ project_id: string | null }> | null,
  );
  addProjectIdRows(
    submittedAcceptances.data as Array<{ project_id: string | null }> | null,
  );
  addProjectIdRows(
    reviewedAcceptances.data as Array<{ project_id: string | null }> | null,
  );
  addProjectIdRows(
    customerConfirmedAcceptances.data as Array<{ project_id: string | null }> | null,
  );

  return Array.from(ids);
}

export async function count(this: any, filters: ProjectCoreListFilters) {
  const query = this.applyProjectListFilters(
    SupabaseDB.getAdminClient()
      .from("projects")
      .select("id", { count: "exact", head: true }),
    filters,
  );

  const { error, count } = await query;
  if (error) {
    throw Errors.dbError("列表查询失败", error);
  }

  return count ?? 0;
}

export async function listRows(this: any, input: {
  filters: ProjectCoreListFilters;
  from: number;
  to: number;
}) {
  const query = this.applyProjectListFilters(
    SupabaseDB.getAdminClient()
      .from("projects")
      .select(PROJECT_LIST_SELECT)
      .order("created_at", { ascending: false }),
    input.filters,
  );

  const { data, error } = await query.range(input.from, input.to);
  if (error) {
    throw Errors.dbError("列表查询失败", error);
  }

  return (data || []) as unknown as Array<Record<string, unknown>>;
}
