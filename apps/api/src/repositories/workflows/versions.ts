import { Errors } from "@/errors/error-factory";
import { workflowTable } from "./client";
import { WORKFLOW_VERSION_SELECT } from "./shared";
import type {
  WorkflowVersionCreateInput,
  WorkflowVersionRow,
} from "./types";

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
