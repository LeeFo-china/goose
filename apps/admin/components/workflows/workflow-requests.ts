import { requestBackendJson } from "@/lib/backend-client";
import type {
  WorkflowDefinition,
  WorkflowDefinitionCreateInput,
  WorkflowDefinitionDetail,
  WorkflowDefinitionListData,
  WorkflowDefinitionListQuery,
  WorkflowDefinitionUpdateInput,
  WorkflowGraph,
  WorkflowGraphSaveInput,
  WorkflowPublishResult,
} from "./workflow-types";

function buildWorkflowListQuery(query: WorkflowDefinitionListQuery = {}) {
  const params = new URLSearchParams();
  params.set("page", String(query.page ?? 1));
  params.set("pageSize", String(query.pageSize ?? 20));

  if (query.status) params.set("status", query.status);
  if (query.category) params.set("category", query.category);
  if (query.keyword?.trim()) params.set("keyword", query.keyword.trim());

  return params.toString();
}

export async function fetchWorkflowDefinitions(
  query: WorkflowDefinitionListQuery = {},
) {
  const params = buildWorkflowListQuery(query);
  return requestBackendJson<WorkflowDefinitionListData>(`/workflows?${params}`, {
    cache: "no-store",
    fallbackMessage: "流程列表加载失败",
  });
}

export async function fetchWorkflowDefinition(id: string) {
  return requestBackendJson<WorkflowDefinitionDetail>(
    `/workflows/${encodeURIComponent(id)}`,
    {
      cache: "no-store",
      fallbackMessage: "流程详情加载失败",
    },
  );
}

export async function createWorkflowDefinition(
  input: WorkflowDefinitionCreateInput,
) {
  return requestBackendJson<WorkflowDefinition>("/workflows", {
    method: "POST",
    body: JSON.stringify(input),
    fallbackMessage: "创建流程失败",
  });
}

export async function updateWorkflowDefinition(
  id: string,
  input: WorkflowDefinitionUpdateInput,
) {
  return requestBackendJson<WorkflowDefinition>(
    `/workflows/${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      body: JSON.stringify(input),
      fallbackMessage: "更新流程失败",
    },
  );
}

export async function fetchWorkflowGraph(id: string, versionId?: string | null) {
  const params = new URLSearchParams();
  if (versionId) params.set("version_id", versionId);
  const query = params.toString();

  return requestBackendJson<WorkflowGraph>(
    `/workflows/${encodeURIComponent(id)}/graph${query ? `?${query}` : ""}`,
    {
      cache: "no-store",
      fallbackMessage: "流程图加载失败",
    },
  );
}

export async function saveWorkflowGraph(
  id: string,
  input: WorkflowGraphSaveInput,
) {
  return requestBackendJson<{ nodes: WorkflowGraph["nodes"]; edges: WorkflowGraph["edges"] }>(
    `/workflows/${encodeURIComponent(id)}/graph`,
    {
      method: "PUT",
      body: JSON.stringify(input),
      fallbackMessage: "保存流程图失败",
    },
  );
}

export async function publishWorkflowDefinition(id: string) {
  return requestBackendJson<WorkflowPublishResult>(
    `/workflows/${encodeURIComponent(id)}/publish`,
    {
      method: "POST",
      fallbackMessage: "发布流程失败",
    },
  );
}

export async function archiveWorkflowDefinition(id: string) {
  return requestBackendJson<WorkflowDefinition>(
    `/workflows/${encodeURIComponent(id)}/archive`,
    {
      method: "POST",
      fallbackMessage: "归档流程失败",
    },
  );
}
