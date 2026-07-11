import {
  Errors,
  SupabaseDB,
  PUBLIC_PROJECT_DETAIL_SELECT,
  PUBLIC_PROJECT_LIST_SELECT,
  type PublicProjectListQuery,
  type PublicProjectListResult,
} from "./shared";

export type PublicProjectPageSegment = {
  tenantIds: string[];
  from: number;
  to: number;
};

export function applyPublicProjectVisibilityQuery(this: any, query: any) {
  return query
    .neq("visibility_status", "hidden")
    .or("status.in.(signed,design_finalized,pending_start,started,constructing,acceptance),visibility_status.eq.public");
}

export function buildPublicProjectPageSegments(input: {
  page: number;
  pageSize: number;
  preferredCount: number;
  preferredTenantId: string | null;
  otherTenantIds: string[];
}): PublicProjectPageSegment[] {
  const pageFrom = (input.page - 1) * input.pageSize;
  const pageTo = pageFrom + input.pageSize - 1;

  if (!input.preferredTenantId) {
    return input.otherTenantIds.length
      ? [{ tenantIds: input.otherTenantIds, from: pageFrom, to: pageTo }]
      : [];
  }

  const segments: PublicProjectPageSegment[] = [];
  const preferredFrom = pageFrom;
  const preferredTo = Math.min(pageTo, input.preferredCount - 1);

  if (preferredFrom <= preferredTo) {
    segments.push({
      tenantIds: [input.preferredTenantId],
      from: preferredFrom,
      to: preferredTo,
    });
  }

  const otherFrom = Math.max(pageFrom - input.preferredCount, 0);
  const otherTo = pageTo - input.preferredCount;

  if (
    input.otherTenantIds.length > 0
    && otherTo >= 0
    && otherFrom <= otherTo
  ) {
    segments.push({
      tenantIds: input.otherTenantIds,
      from: otherFrom,
      to: otherTo,
    });
  }

  return segments;
}

export async function listPublicProjects(
  this: any,
  input: PublicProjectListQuery,
): Promise<PublicProjectListResult> {
  const tenantIds = normalizeTenantIds(input.tenantIds);

  if (tenantIds.length === 0) {
    return createEmptyPublicProjectListResult(input);
  }

  const preferredTenantId = input.preferredTenantId
    && tenantIds.includes(input.preferredTenantId)
    ? input.preferredTenantId
    : null;

  if (!preferredTenantId) {
    const total = await countPublicProjectsByTenants.call(this, tenantIds);
    const rows = total > 0
      ? await listPublicProjectsByTenantSegment.call(this, {
        tenantIds,
        from: (input.page - 1) * input.pageSize,
        to: input.page * input.pageSize - 1,
      })
      : [];

    return createPublicProjectListResult(input, rows, total);
  }

  const otherTenantIds = tenantIds.filter(
    (tenantId) => tenantId !== preferredTenantId,
  );
  const [preferredCount, otherCount] = await Promise.all([
    countPublicProjectsByTenants.call(this, [preferredTenantId]),
    countPublicProjectsByTenants.call(this, otherTenantIds),
  ]);
  const segments = buildPublicProjectPageSegments({
    page: input.page,
    pageSize: input.pageSize,
    preferredCount,
    preferredTenantId,
    otherTenantIds,
  });
  const segmentRows = await Promise.all(
    segments.map((segment) =>
      listPublicProjectsByTenantSegment.call(this, segment)
    ),
  );
  const rows = segmentRows.flat();

  return createPublicProjectListResult(input, rows, preferredCount + otherCount);
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

export async function listPublicProjectLogsPage(this: any, input: {
  projectId: string;
  page: number;
  pageSize: number;
}) {
  const from = (input.page - 1) * input.pageSize;
  const to = from + input.pageSize - 1;

  const { data, error, count } = await SupabaseDB.getAdminClient()
    .from("project_logs")
    .select("id, project_id, stage_code, node_name, content, images, created_at", {
      count: "exact",
    })
    .eq("project_id", input.projectId)
    .order("created_at", { ascending: false })
    .range(from, to);

  if (error) {
    throw Errors.dbError("查询公开项目日志失败", error);
  }

  const total = count || 0;

  return {
    rows: (data || []) as unknown as Array<Record<string, unknown>>,
    pagination: {
      page: input.page,
      pageSize: input.pageSize,
      total,
      totalPages: total ? Math.ceil(total / input.pageSize) : 0,
    },
  };
}

function normalizeTenantIds(tenantIds: string[]): string[] {
  return [...new Set(tenantIds.filter(Boolean))].sort();
}

function createEmptyPublicProjectListResult(
  input: PublicProjectListQuery,
): PublicProjectListResult {
  return createPublicProjectListResult(input, [], 0);
}

function createPublicProjectListResult(
  input: PublicProjectListQuery,
  rows: Array<Record<string, unknown>>,
  total: number,
): PublicProjectListResult {
  return {
    rows,
    pagination: {
      page: input.page,
      pageSize: input.pageSize,
      total,
      totalPages: total ? Math.ceil(total / input.pageSize) : 0,
    },
  };
}

async function countPublicProjectsByTenants(
  this: any,
  tenantIds: string[],
): Promise<number> {
  if (tenantIds.length === 0) {
    return 0;
  }

  const query = this.applyPublicProjectVisibilityQuery(
    SupabaseDB.getAdminClient()
      .from("projects")
      .select("id", { count: "exact", head: true })
      .in("tenant_id", tenantIds),
  );

  const { count, error } = await query;
  if (error) {
    throw Errors.dbError("统计公开项目列表失败", error);
  }

  return count ?? 0;
}

async function listPublicProjectsByTenantSegment(
  this: any,
  segment: PublicProjectPageSegment,
): Promise<Array<Record<string, unknown>>> {
  if (segment.tenantIds.length === 0 || segment.from > segment.to) {
    return [];
  }

  const query = this.applyPublicProjectVisibilityQuery(
    SupabaseDB.getAdminClient()
      .from("projects")
      .select(PUBLIC_PROJECT_LIST_SELECT)
      .in("tenant_id", segment.tenantIds)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false }),
  );

  const { data, error } = await query.range(segment.from, segment.to);
  if (error) {
    throw Errors.dbError("查询公开项目列表失败", error);
  }

  return (data || []) as unknown as Array<Record<string, unknown>>;
}
