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
  WorkflowGraphSaveResult,
  WorkflowPublishResult,
  WorkflowRuntimeCompleteNodeResult,
  WorkflowRuntimeInstanceListData,
  WorkflowRuntimeInstanceListQuery,
  WorkflowRuntimeRebuildResult,
  WorkflowRuntimeStartResult,
  WorkflowTemplateCreateInput,
  WorkflowVersionListData,
  WorkflowVersionListQuery,
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

function buildWorkflowRuntimeListQuery(
  query: WorkflowRuntimeInstanceListQuery = {},
) {
  const params = new URLSearchParams();
  params.set("page", String(query.page ?? 1));
  params.set("pageSize", String(query.pageSize ?? 20));

  if (query.status) params.set("status", query.status);
  if (query.subject_type) params.set("subject_type", query.subject_type);
  if (query.subject_id?.trim()) params.set("subject_id", query.subject_id.trim());

  return params.toString();
}

function buildWorkflowVersionListQuery(
  query: WorkflowVersionListQuery = {},
) {
  const params = new URLSearchParams();
  params.set("page", String(query.page ?? 1));
  params.set("pageSize", String(query.pageSize ?? 20));

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

export async function createWorkflowFromTemplate(
  input: WorkflowTemplateCreateInput,
) {
  return requestBackendJson<WorkflowPublishResult>("/workflows/templates", {
    method: "POST",
    body: JSON.stringify(input),
    fallbackMessage: "创建流程模板失败",
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
  return requestBackendJson<WorkflowGraphSaveResult>(
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

export async function fetchWorkflowVersions(
  id: string,
  query: WorkflowVersionListQuery = {},
) {
  const params = buildWorkflowVersionListQuery(query);
  return requestBackendJson<WorkflowVersionListData>(
    `/workflows/${encodeURIComponent(id)}/versions?${params}`,
    {
      cache: "no-store",
      fallbackMessage: "流程版本列表加载失败",
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

export async function fetchWorkflowRuntimeInstances(
  id: string,
  query: WorkflowRuntimeInstanceListQuery = {},
) {
  const params = buildWorkflowRuntimeListQuery(query);
  return requestBackendJson<WorkflowRuntimeInstanceListData>(
    `/workflows/${encodeURIComponent(id)}/runtime/instances?${params}`,
    {
      cache: "no-store",
      fallbackMessage: "流程运行实例加载失败",
    },
  );
}

export async function startWorkflowRuntimeInstance(
  id: string,
  input: {
    subject_type?: string;
    subject_id: string;
    context?: Record<string, unknown>;
  },
) {
  return requestBackendJson<WorkflowRuntimeStartResult>(
    `/workflows/${encodeURIComponent(id)}/runtime/instances`,
    {
      method: "POST",
      body: JSON.stringify(input),
      fallbackMessage: "启动流程实例失败",
    },
  );
}

export async function completeWorkflowRuntimeNode(
  id: string,
  instanceId: string,
  input: {
    node_key: string;
    action?: string;
    output?: Record<string, unknown>;
  },
) {
  return requestBackendJson<WorkflowRuntimeCompleteNodeResult>(
    `/workflows/${encodeURIComponent(id)}/runtime/instances/${encodeURIComponent(instanceId)}/complete-node`,
    {
      method: "POST",
      body: JSON.stringify(input),
      fallbackMessage: "完成流程节点失败",
    },
  );
}

export async function rebuildWorkflowRuntimeInstance(
  id: string,
  input: {
    subject_type?: string;
    subject_id: string;
    reason: string;
    context?: Record<string, unknown>;
    project_status?: string | null;
    delete_completed_instances?: boolean;
    dry_run?: boolean;
  },
) {
  return requestBackendJson<WorkflowRuntimeRebuildResult>(
    `/workflows/${encodeURIComponent(id)}/runtime/rebuild`,
    {
      method: "POST",
      body: JSON.stringify(input),
      fallbackMessage: "重建流程实例失败",
    },
  );
}
