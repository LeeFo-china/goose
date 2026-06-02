import { Errors, SupabaseDB } from "./shared";
import type {
  ProjectAcceptanceTemplateItemRow,
  ProjectAcceptanceTemplateItemWriteRow,
  ProjectAcceptanceTemplateRow,
  ProjectAcceptanceTemplateSectionRow,
  ProjectAcceptanceTemplateSectionWriteRow,
  ProjectAcceptanceType,
  ProjectLogStageCode,
} from "./shared";

export async function listTemplates(this: any, input: {
  acceptance_type?: ProjectAcceptanceType;
  stage_code?: ProjectLogStageCode;
  status?: "active" | "inactive";
}) {
  let query = SupabaseDB.getAdminClient()
    .from("project_acceptance_templates")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (input.acceptance_type) {
    query = query.eq("acceptance_type", input.acceptance_type);
  }

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

export async function getTemplateById(this: any, id: string) {
  const { data, error } = await SupabaseDB.getAdminClient()
    .from("project_acceptance_templates")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) throw Errors.dbError("查询验收模板失败", error);
  return (data || null) as ProjectAcceptanceTemplateRow | null;
}

export async function updateTemplate(this: any, 
  id: string,
  patch: Partial<Pick<
    ProjectAcceptanceTemplateRow,
    "name" | "description" | "status" | "version"
  >>,
) {
  const { data, error } = await SupabaseDB.getAdminClient()
    .from("project_acceptance_templates")
    .update(patch)
    .eq("id", id)
    .select("*")
    .maybeSingle();

  if (error) throw Errors.dbError("更新验收模板失败", error);
  return (data || null) as ProjectAcceptanceTemplateRow | null;
}

export async function getActiveTemplateByStage(this: any, stageCode: ProjectLogStageCode) {
  const { data, error } = await SupabaseDB.getAdminClient()
    .from("project_acceptance_templates")
    .select("*")
    .eq("stage_code", stageCode)
    .eq("acceptance_type", "stage")
    .eq("status", "active")
    .order("version", { ascending: false })
    .order("sort_order", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw Errors.dbError("查询验收模板失败", error);
  return (data || null) as ProjectAcceptanceTemplateRow | null;
}

export async function getActiveTemplate(this: any, input: {
  stageCode: ProjectLogStageCode;
  acceptanceType: ProjectAcceptanceType;
}) {
  const { data, error } = await SupabaseDB.getAdminClient()
    .from("project_acceptance_templates")
    .select("*")
    .eq("stage_code", input.stageCode)
    .eq("acceptance_type", input.acceptanceType)
    .eq("status", "active")
    .order("version", { ascending: false })
    .order("sort_order", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw Errors.dbError("查询验收模板失败", error);
  return (data || null) as ProjectAcceptanceTemplateRow | null;
}

export async function listTemplateSections(this: any, templateId: string) {
  const { data, error } = await SupabaseDB.getAdminClient()
    .from("project_acceptance_template_sections")
    .select("*")
    .eq("template_id", templateId)
    .eq("status", "active")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) throw Errors.dbError("查询验收模板分组失败", error);
  return (data || []) as ProjectAcceptanceTemplateSectionRow[];
}

export async function upsertTemplateSections(this: any, rows: ProjectAcceptanceTemplateSectionWriteRow[]) {
  if (rows.length === 0) return [] as ProjectAcceptanceTemplateSectionRow[];

  const { data, error } = await SupabaseDB.getAdminClient()
    .from("project_acceptance_template_sections")
    .upsert(rows, { onConflict: "id" })
    .select("*");

  if (error) throw Errors.dbError("保存验收模板分组失败", error);
  return (data || []) as ProjectAcceptanceTemplateSectionRow[];
}

export async function deactivateTemplateSections(this: any, templateId: string, sectionIds: string[]) {
  if (sectionIds.length === 0) return;

  const { error } = await SupabaseDB.getAdminClient()
    .from("project_acceptance_template_sections")
    .update({ status: "inactive" })
    .eq("template_id", templateId)
    .in("id", sectionIds);

  if (error) throw Errors.dbError("停用验收模板分组失败", error);
}

export async function listTemplateItems(this: any, templateId: string) {
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

export async function upsertTemplateItems(this: any, rows: ProjectAcceptanceTemplateItemWriteRow[]) {
  if (rows.length === 0) return [] as ProjectAcceptanceTemplateItemRow[];

  const { data, error } = await SupabaseDB.getAdminClient()
    .from("project_acceptance_template_items")
    .upsert(rows, { onConflict: "id" })
    .select("*");

  if (error) throw Errors.dbError("保存验收模板标准项失败", error);
  return (data || []) as ProjectAcceptanceTemplateItemRow[];
}

export async function deactivateTemplateItems(this: any, templateId: string, itemIds: string[]) {
  if (itemIds.length === 0) return;

  const { error } = await SupabaseDB.getAdminClient()
    .from("project_acceptance_template_items")
    .update({ status: "inactive" })
    .eq("template_id", templateId)
    .in("id", itemIds);

  if (error) throw Errors.dbError("停用验收模板标准项失败", error);
}
