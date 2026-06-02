import { Errors, SupabaseDB } from "./shared";
import type { ProjectAcceptanceProjectRow, ProjectAcceptanceRow, ProjectAcceptanceStatus, ProjectAcceptanceType, ProjectLogStageCode } from "./shared";

export async function getProject(this: any, projectId: string, tenantId?: string | null) {
  let query = SupabaseDB.getAdminClient()
    .from("projects")
    .select("id, tenant_id, name, customer_id, status")
    .eq("id", projectId);

  if (tenantId) {
    query = query.eq("tenant_id", tenantId);
  }

  const { data, error } = await query.maybeSingle();

  if (error) throw Errors.dbError("查询项目失败", error);
  return (data || null) as ProjectAcceptanceProjectRow | null;
}

export async function listProjectsByIds(this: any, projectIds: string[], tenantId?: string | null) {
  if (projectIds.length === 0) return [] as ProjectAcceptanceProjectRow[];

  let query = SupabaseDB.getAdminClient()
    .from("projects")
    .select("id, tenant_id, name, customer_id, status")
    .in("id", Array.from(new Set(projectIds)));

  if (tenantId) {
    query = query.eq("tenant_id", tenantId);
  }

  const { data, error } = await query;

  if (error) throw Errors.dbError("查询项目失败", error);
  return (data || []) as ProjectAcceptanceProjectRow[];
}

export async function findPrimaryConstructionManager(this: any, projectId: string) {
  const { data, error } = await SupabaseDB.getAdminClient()
    .from("project_members")
    .select("employee_id")
    .eq("project_id", projectId)
    .eq("role_code", "construction_manager")
    .eq("is_primary", true)
    .is("deleted_at", null)
    .limit(1)
    .maybeSingle();

  if (error) throw Errors.dbError("查询项目施工经理失败", error);
  return (data?.employee_id as string | undefined) || null;
}

export async function hasOpenAcceptance(this: any, 
  projectId: string,
  stageCode: ProjectLogStageCode,
  tenantId?: string | null,
  acceptanceType?: ProjectAcceptanceType,
) {
  let query = SupabaseDB.getAdminClient()
    .from("project_acceptances")
    .select("id, status")
    .eq("project_id", projectId)
    .eq("stage_code", stageCode)
    .in("status", ["draft", "submitted", "leader_approved", "rejected"])
    .limit(1);

  if (tenantId) {
    query = query.eq("tenant_id", tenantId);
  }
  if (acceptanceType) {
    query = query.eq("acceptance_type", acceptanceType);
  }

  const { data, error } = await query.maybeSingle();

  if (error) throw Errors.dbError("查询进行中验收单失败", error);
  return (data || null) as Pick<ProjectAcceptanceRow, "id" | "status"> | null;
}

export async function listLatestAcceptancesByStages(this: any, input: {
  projectId: string;
  stageCodes: readonly ProjectLogStageCode[];
  tenantId?: string | null;
}) {
  if (input.stageCodes.length === 0) {
    return [] as ProjectAcceptanceRow[];
  }

  let query = SupabaseDB.getAdminClient()
    .from("project_acceptances")
    .select("*")
    .eq("project_id", input.projectId)
    .in("stage_code", [...input.stageCodes])
    .neq("status", "cancelled")
    .order("created_at", { ascending: false });

  if (input.tenantId) {
    query = query.eq("tenant_id", input.tenantId);
  }

  const { data, error } = await query;
  if (error) throw Errors.dbError("查询项目工序验收状态失败", error);

  const statusPriority: Record<ProjectAcceptanceStatus, number> = {
    draft: 1,
    rejected: 1,
    submitted: 2,
    leader_approved: 2,
    customer_confirmed: 3,
    cancelled: 99,
  };
  const rows = ((data || []) as ProjectAcceptanceRow[])
    .sort((left, right) => {
      const priorityDiff =
        statusPriority[left.status] - statusPriority[right.status];
      if (priorityDiff !== 0) return priorityDiff;

      return new Date(right.updated_at || right.created_at).getTime() -
        new Date(left.updated_at || left.created_at).getTime();
    });
  const latest = new Map<string, ProjectAcceptanceRow>();
  for (const row of rows) {
    if (!latest.has(row.stage_code)) {
      latest.set(row.stage_code, row);
    }
  }

  return [...latest.values()];
}
