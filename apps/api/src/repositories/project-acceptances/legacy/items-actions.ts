import { Errors, SupabaseDB } from "./shared";
import type {
  ProjectAcceptanceAction,
  ProjectAcceptanceActionRow,
  ProjectAcceptanceItemRow,
  ProjectAcceptanceStatus,
} from "./shared";

export async function listItems(this: any, acceptanceId: string, tenantId?: string | null) {
  let query = SupabaseDB.getAdminClient()
    .from("project_acceptance_items")
    .select("*")
    .eq("acceptance_id", acceptanceId);

  if (tenantId) {
    query = query.eq("tenant_id", tenantId);
  }

  const { data, error } = await query
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) throw Errors.dbError("查询项目验收项失败", error);
  return (data || []) as ProjectAcceptanceItemRow[];
}

export async function listItemsByAcceptanceIds(this: any, acceptanceIds: string[], tenantId?: string | null) {
  if (acceptanceIds.length === 0) return [] as ProjectAcceptanceItemRow[];

  let query = SupabaseDB.getAdminClient()
    .from("project_acceptance_items")
    .select("*")
    .in("acceptance_id", Array.from(new Set(acceptanceIds)));

  if (tenantId) {
    query = query.eq("tenant_id", tenantId);
  }

  const { data, error } = await query
    .order("acceptance_id", { ascending: true })
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) throw Errors.dbError("查询项目验收项失败", error);
  return (data || []) as ProjectAcceptanceItemRow[];
}

export async function listActions(this: any, acceptanceId: string, tenantId?: string | null) {
  let query = SupabaseDB.getAdminClient()
    .from("project_acceptance_actions")
    .select("*")
    .eq("acceptance_id", acceptanceId);

  if (tenantId) {
    query = query.eq("tenant_id", tenantId);
  }

  const { data, error } = await query.order("created_at", { ascending: true });

  if (error) throw Errors.dbError("查询项目验收操作记录失败", error);
  return (data || []) as ProjectAcceptanceActionRow[];
}

export async function listActionsByAcceptanceIds(this: any, acceptanceIds: string[], tenantId?: string | null) {
  if (acceptanceIds.length === 0) return [] as ProjectAcceptanceActionRow[];

  let query = SupabaseDB.getAdminClient()
    .from("project_acceptance_actions")
    .select("*")
    .in("acceptance_id", Array.from(new Set(acceptanceIds)));

  if (tenantId) {
    query = query.eq("tenant_id", tenantId);
  }

  const { data, error } = await query
    .order("acceptance_id", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) throw Errors.dbError("查询项目验收操作记录失败", error);
  return (data || []) as ProjectAcceptanceActionRow[];
}

export async function updateItem(this: any, 
  acceptanceId: string,
  itemId: string,
  input: Record<string, unknown>,
  tenantId?: string | null,
) {
  let query = SupabaseDB.getAdminClient()
    .from("project_acceptance_items")
    .update(input)
    .eq("acceptance_id", acceptanceId)
    .eq("id", itemId);

  if (tenantId) {
    query = query.eq("tenant_id", tenantId);
  }

  const { data, error } = await query.select("*").maybeSingle();

  if (error) throw Errors.dbError("更新项目验收项失败", error);
  if (!data) throw Errors.badRequest("项目验收项不存在");
  return data as ProjectAcceptanceItemRow;
}

export async function createAction(this: any, input: {
  tenant_id?: string | null;
  acceptance_id: string;
  operator_type: "employee" | "customer" | "system";
  operator_id: string | null;
  action: ProjectAcceptanceAction;
  from_status: ProjectAcceptanceStatus | null;
  to_status: ProjectAcceptanceStatus;
  comment?: string | null;
  metadata?: Record<string, unknown> | null;
}) {
  const { data, error } = await SupabaseDB.getAdminClient()
    .from("project_acceptance_actions")
    .insert(input)
    .select("*")
    .single();

  if (error) throw Errors.dbError("创建项目验收操作记录失败", error);
  return data as ProjectAcceptanceActionRow;
}
