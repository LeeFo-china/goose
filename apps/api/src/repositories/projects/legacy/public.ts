import { Errors, SupabaseDB, PUBLIC_PROJECT_DETAIL_SELECT, PUBLIC_PROJECT_LIST_SELECT } from "./shared";

export function applyPublicProjectVisibilityQuery(this: any, query: any) {
  return query
    .neq("visibility_status", "hidden")
    .or("status.in.(signed,design_finalized,pending_start,started,constructing,acceptance),visibility_status.eq.public");
}

export async function listPublicProjects(this: any, ) {
  const query = this.applyPublicProjectVisibilityQuery(
    SupabaseDB.getAdminClient()
      .from("projects")
      .select(PUBLIC_PROJECT_LIST_SELECT)
      .order("created_at", { ascending: false }),
  );

  const { data, error } = await query;
  if (error) {
    throw Errors.dbError("查询公开项目列表失败", error);
  }

  return (data || []) as unknown as Array<Record<string, unknown>>;
}

export async function listPublicProjectsByIds(this: any, projectIds: string[]) {
  if (projectIds.length === 0) {
    return [] as Array<Record<string, unknown>>;
  }

  const query = this.applyPublicProjectVisibilityQuery(
    SupabaseDB.getAdminClient()
      .from("projects")
      .select(PUBLIC_PROJECT_LIST_SELECT)
      .in("id", projectIds),
  );

  const { data, error } = await query;
  if (error) {
    throw Errors.dbError("查询公开项目列表失败", error);
  }

  const order = new Map(projectIds.map((id, index) => [id, index]));
  return ((data || []) as unknown as Array<Record<string, unknown>>)
    .sort((left, right) => {
      const leftIndex = typeof left.id === "string" ? order.get(left.id) ?? 0 : 0;
      const rightIndex = typeof right.id === "string" ? order.get(right.id) ?? 0 : 0;
      return leftIndex - rightIndex;
    });
}

export async function findPublicVisibilityById(this: any, projectId: string) {
  const { data, error } = await SupabaseDB.getAdminClient()
    .from("projects")
    .select("id, status, visibility_status")
    .eq("id", projectId)
    .maybeSingle();

  if (error) {
    throw Errors.dbError("查询公开项目失败", error);
  }

  return (data as unknown as Record<string, unknown> | null) ?? null;
}

export async function findPublicDetailById(this: any, projectId: string) {
  const { data, error } = await SupabaseDB.getAdminClient()
    .from("projects")
    .select(PUBLIC_PROJECT_DETAIL_SELECT)
    .eq("id", projectId)
    .maybeSingle();

  if (error) {
    throw Errors.dbError("查询公开项目详情失败", error);
  }

  return (data as unknown as Record<string, unknown> | null) ?? null;
}

export async function listPublicProjectLogs(this: any, projectId: string) {
  const { data, error } = await SupabaseDB.getAdminClient()
    .from("project_logs")
    .select("id, project_id, stage_code, node_name, content, images, created_at")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });

  if (error) {
    throw Errors.dbError("查询公开项目日志失败", error);
  }

  return (data || []) as unknown as Array<Record<string, unknown>>;
}
