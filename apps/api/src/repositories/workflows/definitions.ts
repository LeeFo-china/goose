import { Errors } from "@/errors/error-factory";
import { workflowTable } from "./client";
import {
  WORKFLOW_DEFINITION_SELECT,
  escapeSupabaseOrValue,
} from "./shared";
import type {
  WorkflowActiveVersionUpdateInput,
  WorkflowDefinitionCreateRepositoryInput,
  WorkflowDefinitionListInput,
  WorkflowDefinitionListResult,
  WorkflowDefinitionRow,
  WorkflowDefinitionUpdateRepositoryInput,
} from "./types";

export async function listDefinitions(
  input: WorkflowDefinitionListInput,
): Promise<WorkflowDefinitionListResult> {
  const page = input.page ?? 1;
  const pageSize = Math.min(input.pageSize ?? 20, 100);
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let request = workflowTable("workflow_definitions")
    .select(WORKFLOW_DEFINITION_SELECT, { count: "exact" })
    .eq("tenant_id", input.tenantId);

  if (input.status) request = request.eq("status", input.status);
  if (input.category) request = request.eq("category", input.category);

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
    throw Errors.dbError("查询流程定义列表失败", error);
  }

  const total = count ?? 0;
  return {
    list: (data ?? []) as WorkflowDefinitionRow[],
    pagination: {
      page,
      pageSize,
      total,
      totalPages: total ? Math.ceil(total / pageSize) : 0,
    },
  };
}

export async function getDefinitionById(
  id: string,
  tenantId: string,
): Promise<WorkflowDefinitionRow | null> {
  const { data, error } = await workflowTable("workflow_definitions")
    .select(WORKFLOW_DEFINITION_SELECT)
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (error) {
    throw Errors.dbError("查询流程定义失败", error);
  }

  return (data ?? null) as WorkflowDefinitionRow | null;
}

export const findDefinitionById = getDefinitionById;

export async function createDefinition(
  input: WorkflowDefinitionCreateRepositoryInput,
): Promise<WorkflowDefinitionRow> {
  const { data, error } = await workflowTable("workflow_definitions")
    .insert({
      tenant_id: input.tenantId,
      workflow_key: input.workflow_key,
      name: input.name,
      description: input.description ?? null,
      category: input.category,
      status: "draft",
      created_by: input.createdBy ?? null,
      updated_by: input.createdBy ?? null,
    })
    .select(WORKFLOW_DEFINITION_SELECT)
    .single();

  if (error) {
    throw Errors.dbError("创建流程定义失败", error);
  }
  if (!data) {
    throw Errors.badRequest("创建流程定义失败");
  }

  return data as WorkflowDefinitionRow;
}

export async function updateDefinition(
  id: string,
  tenantId: string,
  input: WorkflowDefinitionUpdateRepositoryInput,
): Promise<WorkflowDefinitionRow> {
  const updatePayload = {
    ...(input.name !== undefined ? { name: input.name } : {}),
    ...(input.description !== undefined
      ? { description: input.description }
      : {}),
    ...(input.status !== undefined ? { status: input.status } : {}),
    ...(input.updatedBy !== undefined ? { updated_by: input.updatedBy } : {}),
  };

  if (Object.keys(updatePayload).length === 0) {
    const current = await getDefinitionById(id, tenantId);
    if (!current) throw Errors.badRequest("流程定义不存在");
    return current;
  }

  const { data, error } = await workflowTable("workflow_definitions")
    .update(updatePayload)
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .select(WORKFLOW_DEFINITION_SELECT)
    .maybeSingle();

  if (error) {
    throw Errors.dbError("更新流程定义失败", error);
  }
  if (!data) {
    throw Errors.badRequest("流程定义不存在");
  }

  return data as WorkflowDefinitionRow;
}

export async function updateActiveVersion(
  input: WorkflowActiveVersionUpdateInput,
): Promise<WorkflowDefinitionRow> {
  const { data, error } = await workflowTable("workflow_definitions")
    .update({
      active_version_id: input.versionId,
      status: input.status ?? "active",
      updated_by: input.updatedBy ?? null,
    })
    .eq("id", input.definitionId)
    .eq("tenant_id", input.tenantId)
    .select(WORKFLOW_DEFINITION_SELECT)
    .maybeSingle();

  if (error) {
    throw Errors.dbError("更新流程启用版本失败", error);
  }
  if (!data) {
    throw Errors.badRequest("流程定义不存在");
  }

  return data as WorkflowDefinitionRow;
}
