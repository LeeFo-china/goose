import { Errors } from "@/errors/error-factory";
import { SupabaseDB } from "@/utils/supabase/index";
import type {
  ProjectAcceptanceAction,
  ProjectAcceptanceItemResult,
  ProjectAcceptanceRejectSource,
  ProjectAcceptanceStatus,
  ProjectLogStageCode,
} from "@gooes/domain";

export type ProjectAcceptanceTemplateRow = {
  id: string;
  stage_code: string;
  name: string;
  description: string | null;
  version: number;
  status: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type ProjectAcceptanceTemplateItemRow = {
  id: string;
  template_id: string;
  category: string | null;
  title: string;
  standard: string;
  required: boolean;
  allow_not_applicable: boolean;
  photo_required: boolean;
  photo_min_count: number;
  photo_max_count: number;
  input_type: string;
  options: unknown;
  sort_order: number;
  status: string;
  created_at: string;
  updated_at: string;
};

export type ProjectAcceptanceRow = {
  id: string;
  tenant_id: string | null;
  project_id: string;
  stage_code: string;
  template_id: string | null;
  template_version: number;
  title: string;
  status: ProjectAcceptanceStatus;
  initiator_id: string;
  reviewer_id: string | null;
  customer_id: string | null;
  summary: string | null;
  submitted_at: string | null;
  reviewed_at: string | null;
  customer_confirmed_at: string | null;
  completed_at: string | null;
  rejected_at: string | null;
  reject_reason: string | null;
  reject_source: ProjectAcceptanceRejectSource | null;
  created_at: string;
  updated_at: string;
};

export type ProjectAcceptanceItemRow = {
  id: string;
  tenant_id: string | null;
  acceptance_id: string;
  template_item_id: string | null;
  category: string | null;
  title: string;
  standard: string;
  required: boolean;
  allow_not_applicable: boolean;
  photo_required: boolean;
  photo_min_count: number;
  photo_max_count: number;
  result: ProjectAcceptanceItemResult | null;
  remark: string | null;
  rectification_remark: string | null;
  rectification_images: unknown;
  images: unknown;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type ProjectAcceptanceActionRow = {
  id: string;
  tenant_id: string | null;
  acceptance_id: string;
  operator_type: "employee" | "customer" | "system";
  operator_id: string | null;
  action: ProjectAcceptanceAction;
  from_status: ProjectAcceptanceStatus | null;
  to_status: ProjectAcceptanceStatus;
  comment: string | null;
  metadata: unknown;
  created_at: string;
};

export type ProjectAcceptanceProjectRow = {
  id: string;
  tenant_id: string | null;
  name: string | null;
  customer_id: string | null;
  supervisor_id: string | null;
  status: string | null;
};

export type ProjectAcceptanceEmployeeRow = {
  id: string;
  tenant_id: string | null;
  name: string | null;
  avatar: string | null;
};

export type ProjectAcceptanceCustomerRow = {
  id: string;
  tenant_id: string | null;
  name: string | null;
  phone: string | null;
  user_id: string | null;
  tenant?: {
    id: string | null;
    status: string | null;
  } | Array<{
    id: string | null;
    status: string | null;
  }> | null;
};

type ListAcceptancesInput = {
  page: number;
  pageSize: number;
  project_id?: string;
  status?: ProjectAcceptanceStatus;
  stage_code?: ProjectLogStageCode;
  reviewer_id?: string;
  customer_id?: string;
  visibleProjectIds?: string[] | null;
  tenantId?: string | null;
};

class ProjectAcceptanceRepository {
  async listTemplates(input: {
    stage_code?: ProjectLogStageCode;
    status?: "active" | "inactive";
  }) {
    let query = SupabaseDB.getAdminClient()
      .from("project_acceptance_templates")
      .select("*")
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });

    if (input.stage_code) {
      query = query.eq("stage_code", input.stage_code);
    }

    if (input.status) {
      query = query.eq("status", input.status);
    }

    const { data, error } = await query;
    if (error) throw Errors.dbError("查询验收模板失败", error);
    return (data || []) as ProjectAcceptanceTemplateRow[];
  }

  async getTemplateById(id: string) {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("project_acceptance_templates")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (error) throw Errors.dbError("查询验收模板失败", error);
    return (data || null) as ProjectAcceptanceTemplateRow | null;
  }

  async getActiveTemplateByStage(stageCode: ProjectLogStageCode) {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("project_acceptance_templates")
      .select("*")
      .eq("stage_code", stageCode)
      .eq("status", "active")
      .order("version", { ascending: false })
      .order("sort_order", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (error) throw Errors.dbError("查询验收模板失败", error);
    return (data || null) as ProjectAcceptanceTemplateRow | null;
  }

  async listTemplateItems(templateId: string) {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("project_acceptance_template_items")
      .select("*")
      .eq("template_id", templateId)
      .eq("status", "active")
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });

    if (error) throw Errors.dbError("查询验收模板标准项失败", error);
    return (data || []) as ProjectAcceptanceTemplateItemRow[];
  }

  async getProject(projectId: string, tenantId?: string | null) {
    let query = SupabaseDB.getAdminClient()
      .from("projects")
      .select("id, tenant_id, name, customer_id, supervisor_id, status")
      .eq("id", projectId);

    if (tenantId) {
      query = query.eq("tenant_id", tenantId);
    }

    const { data, error } = await query.maybeSingle();

    if (error) throw Errors.dbError("查询项目失败", error);
    return (data || null) as ProjectAcceptanceProjectRow | null;
  }

  async listProjectsByIds(projectIds: string[], tenantId?: string | null) {
    if (projectIds.length === 0) return [] as ProjectAcceptanceProjectRow[];

    let query = SupabaseDB.getAdminClient()
      .from("projects")
      .select("id, tenant_id, name, customer_id, supervisor_id, status")
      .in("id", Array.from(new Set(projectIds)));

    if (tenantId) {
      query = query.eq("tenant_id", tenantId);
    }

    const { data, error } = await query;

    if (error) throw Errors.dbError("查询项目失败", error);
    return (data || []) as ProjectAcceptanceProjectRow[];
  }

  async findPrimaryConstructionManager(projectId: string) {
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

  async hasOpenAcceptance(
    projectId: string,
    stageCode: ProjectLogStageCode,
    tenantId?: string | null,
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

    const { data, error } = await query.maybeSingle();

    if (error) throw Errors.dbError("查询进行中验收单失败", error);
    return (data || null) as Pick<ProjectAcceptanceRow, "id" | "status"> | null;
  }

  async listLatestAcceptancesByStages(input: {
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

    const latest = new Map<string, ProjectAcceptanceRow>();
    for (const row of (data || []) as ProjectAcceptanceRow[]) {
      if (!latest.has(row.stage_code)) {
        latest.set(row.stage_code, row);
      }
    }

    return [...latest.values()];
  }

  async createAcceptance(input: Partial<ProjectAcceptanceRow>) {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("project_acceptances")
      .insert(input)
      .select("*")
      .single();

    if (error) throw Errors.dbError("创建项目验收单失败", error);
    return data as ProjectAcceptanceRow;
  }

  async createItems(items: Array<Partial<ProjectAcceptanceItemRow>>) {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("project_acceptance_items")
      .insert(items)
      .select("*")
      .order("sort_order", { ascending: true });

    if (error) throw Errors.dbError("创建项目验收项失败", error);
    return (data || []) as ProjectAcceptanceItemRow[];
  }

  async listAcceptances(input: ListAcceptancesInput) {
    const from = (input.page - 1) * input.pageSize;
    const to = from + input.pageSize - 1;

    let query = SupabaseDB.getAdminClient()
      .from("project_acceptances")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(from, to);

    if (input.tenantId) {
      query = query.eq("tenant_id", input.tenantId);
    }

    if (input.visibleProjectIds) {
      if (input.visibleProjectIds.length === 0) {
        return { list: [] as ProjectAcceptanceRow[], total: 0 };
      }
      query = query.in("project_id", input.visibleProjectIds);
    }

    if (input.project_id) query = query.eq("project_id", input.project_id);
    if (input.status) query = query.eq("status", input.status);
    if (input.stage_code) query = query.eq("stage_code", input.stage_code);
    if (input.reviewer_id) query = query.eq("reviewer_id", input.reviewer_id);
    if (input.customer_id) query = query.eq("customer_id", input.customer_id);

    const { data, error, count } = await query;
    if (error) throw Errors.dbError("查询项目验收列表失败", error);

    return {
      list: (data || []) as ProjectAcceptanceRow[],
      total: count || 0,
    };
  }

  async getAcceptanceById(id: string, tenantId?: string | null) {
    let query = SupabaseDB.getAdminClient()
      .from("project_acceptances")
      .select("*")
      .eq("id", id);

    if (tenantId) {
      query = query.eq("tenant_id", tenantId);
    }

    const { data, error } = await query.maybeSingle();

    if (error) throw Errors.dbError("查询项目验收单失败", error);
    return (data || null) as ProjectAcceptanceRow | null;
  }

  async listItems(acceptanceId: string, tenantId?: string | null) {
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

  async listItemsByAcceptanceIds(acceptanceIds: string[], tenantId?: string | null) {
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

  async listActions(acceptanceId: string, tenantId?: string | null) {
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

  async listActionsByAcceptanceIds(acceptanceIds: string[], tenantId?: string | null) {
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

  async updateAcceptance(
    id: string,
    input: Record<string, unknown>,
    tenantId?: string | null,
  ) {
    let query = SupabaseDB.getAdminClient()
      .from("project_acceptances")
      .update(input)
      .eq("id", id);

    if (tenantId) {
      query = query.eq("tenant_id", tenantId);
    }

    const { data, error } = await query.select("*").maybeSingle();

    if (error) throw Errors.dbError("更新项目验收单失败", error);
    if (!data) throw Errors.badRequest("项目验收单不存在");
    return data as ProjectAcceptanceRow;
  }

  async deleteAcceptance(id: string, tenantId?: string | null) {
    let query = SupabaseDB.getAdminClient()
      .from("project_acceptances")
      .delete()
      .eq("id", id);

    if (tenantId) {
      query = query.eq("tenant_id", tenantId);
    }

    const { error } = await query.select("id");

    if (error) throw Errors.dbError("删除项目验收草稿失败", error);
  }

  async updateItem(
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

  async createAction(input: {
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

  async listEmployees(ids: string[]) {
    if (ids.length === 0) return [] as ProjectAcceptanceEmployeeRow[];
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("employees")
      .select("id, tenant_id, name, avatar")
      .in("id", ids);

    if (error) throw Errors.dbError("查询员工失败", error);
    return (data || []) as ProjectAcceptanceEmployeeRow[];
  }

  async listCustomers(ids: string[]) {
    if (ids.length === 0) return [] as ProjectAcceptanceCustomerRow[];
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("customers")
      .select(`
        id,
        tenant_id,
        name,
        phone,
        user_id,
        tenant:tenants!customers_tenant_id_fkey(
          id,
          status
        )
      `)
      .in("id", ids);

    if (error) throw Errors.dbError("查询客户失败", error);
    return (data || []) as ProjectAcceptanceCustomerRow[];
  }

  async getTenantById(id: string) {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("tenants")
      .select("id,status")
      .eq("id", id)
      .maybeSingle();

    if (error) throw Errors.dbError("查询租户状态失败", error);
    return (data || null) as { id: string; status: string | null } | null;
  }
}

export const projectAcceptanceRepository = new ProjectAcceptanceRepository();
