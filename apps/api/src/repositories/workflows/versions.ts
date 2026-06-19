import { Errors } from "@/errors/error-factory";
import { workflowRpc, workflowTable } from "./client";
import { WORKFLOW_VERSION_SELECT } from "./shared";
import type {
  WorkflowDefinitionPublishInput,
  WorkflowDefinitionPublishResult,
  WorkflowDefinitionRow,
  WorkflowVersionCreateInput,
  WorkflowVersionListInput,
  WorkflowVersionListResult,
  WorkflowVersionRow,
  WorkflowVersionStatusUpdateInput,
} from "./types";

export async function listVersions(
  input: WorkflowVersionListInput,
): Promise<WorkflowVersionListResult> {
  const page = input.page ?? 1;
  const pageSize = Math.min(input.pageSize ?? 20, 100);
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const { data, error, count } = await workflowTable("workflow_versions")
    .select(WORKFLOW_VERSION_SELECT, { count: "exact" })
    .eq("tenant_id", input.tenantId)
    .eq("definition_id", input.definitionId)
    .order("version_number", { ascending: false })
    .range(from, to);

  if (error) {
    throw Errors.dbError("查询流程版本列表失败", error);
  }

  const total = count ?? 0;
  return {
    list: (data ?? []) as WorkflowVersionRow[],
    pagination: {
      page,
      pageSize,
      total,
      totalPages: total ? Math.ceil(total / pageSize) : 0,
    },
  };
}

export async function getLatestVersion(
  definitionId: string,
  tenantId: string,
): Promise<WorkflowVersionRow | null> {
  const { data, error } = await workflowTable("workflow_versions")
    .select(WORKFLOW_VERSION_SELECT)
    .eq("definition_id", definitionId)
    .eq("tenant_id", tenantId)
    .order("version_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw Errors.dbError("查询流程最新版本失败", error);
  }

  return (data ?? null) as WorkflowVersionRow | null;
}

export async function getVersionById(
  id: string,
  definitionId: string,
  tenantId: string,
): Promise<WorkflowVersionRow | null> {
  const { data, error } = await workflowTable("workflow_versions")
    .select(WORKFLOW_VERSION_SELECT)
    .eq("id", id)
    .eq("definition_id", definitionId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (error) {
    throw Errors.dbError("查询流程版本失败", error);
  }

  return (data ?? null) as WorkflowVersionRow | null;
}

export async function getNextVersionNumber(
  definitionId: string,
  tenantId: string,
): Promise<number> {
  const latestVersion = await getLatestVersion(definitionId, tenantId);
  return latestVersion ? latestVersion.version_number + 1 : 1;
}

export async function createVersion(
  input: WorkflowVersionCreateInput,
): Promise<WorkflowVersionRow> {
  const { data, error } = await workflowTable("workflow_versions")
    .insert({
      tenant_id: input.tenantId,
      definition_id: input.definitionId,
      version_number: input.versionNumber,
      status: input.status ?? "published",
      snapshot: input.snapshot,
      validation_result: input.validationResult ?? {},
      published_by: input.publishedBy ?? null,
    })
    .select(WORKFLOW_VERSION_SELECT)
    .single();

  if (error) {
    throw Errors.dbError("创建流程版本失败", error);
  }
  if (!data) {
    throw Errors.badRequest("创建流程版本失败");
  }

  return data as WorkflowVersionRow;
}

export async function updateVersionStatus(
  input: WorkflowVersionStatusUpdateInput,
): Promise<WorkflowVersionRow> {
  const { data, error } = await workflowTable("workflow_versions")
    .update({ status: input.status })
    .eq("id", input.id)
    .eq("definition_id", input.definitionId)
    .eq("tenant_id", input.tenantId)
    .select(WORKFLOW_VERSION_SELECT)
    .single();

  if (error) {
    throw Errors.dbError("更新流程版本状态失败", error);
  }
  if (!data) {
    throw Errors.notFound("流程版本不存在");
  }

  return data as WorkflowVersionRow;
}

export async function publishDefinition(
  input: WorkflowDefinitionPublishInput,
): Promise<WorkflowDefinitionPublishResult> {
  const { data, error } = await workflowRpc("publish_workflow_definition", {
    p_tenant_id: input.tenantId,
    p_definition_id: input.definitionId,
    p_snapshot: input.snapshot,
    p_validation_result: input.validationResult,
    p_published_by: input.publishedBy ?? null,
    p_updated_by: input.updatedBy ?? input.publishedBy ?? null,
    p_expected_updated_at: input.expectedUpdatedAt,
  });

  if (error) {
    throw Errors.dbError("发布流程失败", error);
  }

  return normalizePublishResult(data);
}

function normalizePublishResult(data: unknown): WorkflowDefinitionPublishResult {
  if (!isRecord(data)) {
    throw Errors.badRequest("发布流程失败");
  }

  if (data.ok === false && data.reason === "definition_not_found") {
    return { ok: false, reason: "definition_not_found" };
  }
  if (data.ok === false && data.reason === "stale_draft") {
    return { ok: false, reason: "stale_draft" };
  }

  if (data.ok !== true || !isRecord(data.definition) || !isRecord(data.version)) {
    throw Errors.badRequest("发布流程失败");
  }

  return {
    ok: true,
    definition: data.definition as WorkflowDefinitionRow,
    version: data.version as WorkflowVersionRow,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
