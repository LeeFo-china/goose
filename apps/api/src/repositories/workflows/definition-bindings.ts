import { Errors } from "@/errors/error-factory";
import { getWorkflowDefinitionBusinessTrack } from "@gooes/domain";
import { workflowTable } from "./client";
import {
  WORKFLOW_DEFINITION_SELECT,
  escapeSupabaseOrValue,
} from "./shared";
import type {
  ProjectConstructionWorkflowListInput,
  ProjectConstructionWorkflowListResult,
  ProjectConstructionWorkflowOptionRow,
  WorkflowDefinitionBindingRow,
  WorkflowDefinitionRow,
} from "./types";

const PROJECT_CONSTRUCTION_BINDING_SELECT = [
  "id",
  "tenant_id",
  "subject_type",
  "workflow_purpose",
  "definition_id",
  "selectable",
  "is_default",
  "created_at",
  "updated_at",
].join(", ");

const PROJECT_CONSTRUCTION_SUBJECT_TYPE = "project";
const PROJECT_CONSTRUCTION_PURPOSE = "construction";

export async function listProjectConstructionWorkflowOptions(
  input: ProjectConstructionWorkflowListInput,
): Promise<ProjectConstructionWorkflowListResult> {
  const page = input.page ?? 1;
  const pageSize = Math.min(input.pageSize ?? 20, 100);
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let request = workflowTable("workflow_definitions")
    .select(WORKFLOW_DEFINITION_SELECT, { count: "exact" })
    .eq("tenant_id", input.tenantId)
    .eq("status", "active")
    .eq("category", "construction")
    .not("active_version_id", "is", null)
    .or("workflow_key.eq.construction_main,workflow_key.ilike.construction_main_%");

  const keyword = input.keyword?.trim();
  if (keyword) {
    const escapedKeyword = escapeSupabaseOrValue(keyword);
    request = request.or([
      `workflow_key.ilike.%${escapedKeyword}%`,
      `name.ilike.%${escapedKeyword}%`,
      `description.ilike.%${escapedKeyword}%`,
    ].join(","));
  }

  const { data, error, count } = await request
    .order("updated_at", { ascending: false })
    .range(from, to);

  if (error) {
    throw Errors.dbError("查询项目施工流程选项失败", error);
  }

  const definitions = (data ?? []) as WorkflowDefinitionRow[];
  const constructionDefinitions = definitions.filter((definition) =>
    getWorkflowDefinitionBusinessTrack(definition.workflow_key) ===
      "construction"
  );
  const bindings = await listProjectConstructionBindingsByDefinitionIds({
    tenantId: input.tenantId,
    definitionIds: constructionDefinitions.map((item) => item.id),
  });
  const bindingMap = new Map(bindings.map((item) => [item.definition_id, item]));

  const list = constructionDefinitions
    .map((definition): ProjectConstructionWorkflowOptionRow => ({
      ...definition,
      project_construction_binding: bindingMap.get(definition.id) ?? null,
    }))
    .filter((definition) =>
      definition.project_construction_binding?.selectable !== false
    );

  const total = count ?? 0;
  return {
    list,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: total ? Math.ceil(total / pageSize) : 0,
    },
  };
}

export async function findDefaultProjectConstructionWorkflow(
  tenantId: string,
): Promise<WorkflowDefinitionRow | null> {
  const { data, error } = await workflowTable("workflow_definition_bindings")
    .select(PROJECT_CONSTRUCTION_BINDING_SELECT)
    .eq("tenant_id", tenantId)
    .eq("subject_type", PROJECT_CONSTRUCTION_SUBJECT_TYPE)
    .eq("workflow_purpose", PROJECT_CONSTRUCTION_PURPOSE)
    .eq("is_default", true)
    .eq("selectable", true)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw Errors.dbError("查询默认项目施工流程失败", error);
  }

  const binding = data as WorkflowDefinitionBindingRow | null;
  if (!binding) return null;

  const { data: definition, error: definitionError } = await workflowTable(
    "workflow_definitions",
  )
    .select(WORKFLOW_DEFINITION_SELECT)
    .eq("tenant_id", tenantId)
    .eq("id", binding.definition_id)
    .eq("status", "active")
    .eq("category", "construction")
    .not("active_version_id", "is", null)
    .maybeSingle();

  if (definitionError) {
    throw Errors.dbError("查询默认项目施工流程定义失败", definitionError);
  }

  return (definition ?? null) as WorkflowDefinitionRow | null;
}

export async function setDefaultProjectConstructionWorkflow(input: {
  tenantId: string;
  definitionId: string;
}): Promise<WorkflowDefinitionBindingRow> {
  const { error: clearError } = await workflowTable("workflow_definition_bindings")
    .update({ is_default: false })
    .eq("tenant_id", input.tenantId)
    .eq("subject_type", PROJECT_CONSTRUCTION_SUBJECT_TYPE)
    .eq("workflow_purpose", PROJECT_CONSTRUCTION_PURPOSE)
    .eq("is_default", true);

  if (clearError) {
    throw Errors.dbError("清理项目施工默认流程失败", clearError);
  }

  const { data, error } = await workflowTable("workflow_definition_bindings")
    .upsert({
      tenant_id: input.tenantId,
      subject_type: PROJECT_CONSTRUCTION_SUBJECT_TYPE,
      workflow_purpose: PROJECT_CONSTRUCTION_PURPOSE,
      definition_id: input.definitionId,
      selectable: true,
      is_default: true,
    }, {
      onConflict: "tenant_id,subject_type,workflow_purpose,definition_id",
    })
    .select(PROJECT_CONSTRUCTION_BINDING_SELECT)
    .single();

  if (error) {
    throw Errors.dbError("设置项目施工默认流程失败", error);
  }
  if (!data) {
    throw Errors.badRequest("设置项目施工默认流程失败");
  }

  return data as WorkflowDefinitionBindingRow;
}

export async function listProjectConstructionBindingsByDefinitionIds(input: {
  tenantId: string;
  definitionIds: string[];
}): Promise<WorkflowDefinitionBindingRow[]> {
  if (input.definitionIds.length === 0) return [];

  const { data, error } = await workflowTable("workflow_definition_bindings")
    .select(PROJECT_CONSTRUCTION_BINDING_SELECT)
    .eq("tenant_id", input.tenantId)
    .eq("subject_type", PROJECT_CONSTRUCTION_SUBJECT_TYPE)
    .eq("workflow_purpose", PROJECT_CONSTRUCTION_PURPOSE)
    .in("definition_id", input.definitionIds);

  if (error) {
    throw Errors.dbError("查询项目施工流程绑定失败", error);
  }

  return (data ?? []) as WorkflowDefinitionBindingRow[];
}
