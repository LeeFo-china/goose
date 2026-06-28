import {
  workflowSubjectStateRepository,
  type WorkflowRuntimeProjectionRow,
  type WorkflowSubjectStateRow,
} from "@/repositories/workflow-subject-states";
import {
  workflowTaskRepository,
  type WorkflowTaskWithInstanceRow,
} from "@/repositories/workflow-tasks";
import {
  workflowRepository,
  type WorkflowGraphResult,
  type WorkflowInstanceNodeRow,
} from "@/repositories/workflows";
import type { AuthContext } from "@/services/authorization";
import {
  buildProjectWorkflowProgressProjection,
  type ProjectWorkflowProgress,
} from "@/services/project-workflow-progress";
import {
  buildWorkflowTaskActionsForTask,
  type WorkflowTaskActionPayload,
} from "@/services/workflow-task-actions";

const MAX_ACCESSIBLE_TASKS_PER_PROJECT = 100;
const MAX_RUNTIME_NODES_PER_INSTANCE = 200;
const WORKFLOW_GRAPH_CACHE_TTL_MS = 5 * 60_000;
const WORKFLOW_GRAPH_CACHE_MAX_ENTRIES = 200;

type ProjectWorkflowSummaryMode = "full" | "compact";
type WorkflowGraphProjection = Pick<WorkflowGraphResult, "definition" | "nodes" | "edges">;
type WorkflowGraphCacheEntry = {
  expiresAt: number;
  value: WorkflowGraphProjection | null;
};

const workflowGraphCache = new Map<string, WorkflowGraphCacheEntry>();

type ProjectWorkflowStateSummary = {
  subject_type: "project";
  subject_id: string;
  instance_id: string | null;
  instance_status: ProjectWorkflowProgress["instance_status"];
  current_node_key: string | null;
  current_node_title: string | null;
  current_group_key: string | null;
  current_group_label: string | null;
  current_group_order: number | null;
  current_business_kind: ProjectWorkflowProgress["current_business_kind"];
  pending_task_count: number;
  actions: ProjectWorkflowProgress["actions"];
  timeline_nodes: ProjectWorkflowProgress["timeline_nodes"];
};

export async function attachProjectWorkflowSummaries(input: {
  rows: Array<Record<string, unknown>>;
  tenantId: string;
  authContext: AuthContext;
  workflowSummaryMode?: ProjectWorkflowSummaryMode;
}): Promise<Array<Record<string, unknown>>> {
  const projectIds = unique(
    input.rows
      .map((row) => readProjectId(row))
      .filter((id): id is string => Boolean(id)),
  );
  if (projectIds.length === 0) {
    return input.rows.map(stripLegacyStageFields);
  }

  const [subjectStates, runtimeInstances, accessibleTasks] = await Promise.all([
    workflowSubjectStateRepository.listBySubjectIds({
      tenantId: input.tenantId,
      subjectType: "project",
      subjectIds: projectIds,
    }),
    workflowSubjectStateRepository.listLatestRuntimeInstancesBySubjectIds({
      tenantId: input.tenantId,
      subjectType: "project",
      subjectIds: projectIds,
    }),
    workflowTaskRepository.listAccessiblePendingByProjectIds({
      tenantId: input.tenantId,
      employeeId: input.authContext.employeeId,
      roleCodes: input.authContext.roleCodes,
      permissionCodes: input.authContext.permissions.map((permission) =>
        permission.code
      ),
      projectIds,
      limit: Math.min(
        projectIds.length * MAX_ACCESSIBLE_TASKS_PER_PROJECT,
        10_000,
      ),
    }),
  ]);

  const subjectStateByProjectId = new Map(
    subjectStates.map((state) => [state.subject_id, state]),
  );
  const runtimeInstanceByProjectId = latestRuntimeByProjectId(runtimeInstances);
  const instanceIds = unique(runtimeInstances.map((instance) => instance.id));
  const [runtimeNodes, graphByRuntimeKey, actionsByInstanceId] =
    await Promise.all([
      workflowRepository.listRuntimeInstanceNodesByInstanceIds({
        tenantId: input.tenantId,
        instanceIds,
        limit: Math.min(
          instanceIds.length * MAX_RUNTIME_NODES_PER_INSTANCE,
          20_000,
        ),
      }),
      loadGraphsByRuntimeKey({
        tenantId: input.tenantId,
        runtimeInstances,
      }),
      buildAccessibleActionsByInstance({
        tenantId: input.tenantId,
        tasks: accessibleTasks,
      }),
    ]);
  const completedNodeKeysByInstanceId =
    completedNodeKeysByInstanceIdFrom(runtimeNodes);

  return input.rows.map((row) => {
    const projectId = readProjectId(row);
    if (!projectId) return stripLegacyStageFields(row);

    const runtimeInstance = runtimeInstanceByProjectId.get(projectId) ?? null;
    const subjectState = subjectStateByProjectId.get(projectId) ?? null;
    const progress = buildProjectWorkflowProgressProjection({
      subjectState,
      runtimeInstance,
      graph: runtimeInstance
        ? graphByRuntimeKey.get(runtimeKey(runtimeInstance)) ?? null
        : null,
      completedNodeKeys: runtimeInstance
        ? completedNodeKeysByInstanceId.get(runtimeInstance.id) ?? []
        : [],
      pendingActions: runtimeInstance
        ? actionsByInstanceId.get(runtimeInstance.id) ?? []
        : [],
    });
    const workflowProgress = input.workflowSummaryMode === "compact"
      ? compactProjectWorkflowProgress(progress)
      : progress;

    return {
      ...stripLegacyStageFields(row),
      workflow_progress: workflowProgress,
      workflow_state: buildWorkflowStateSummary({
        projectId,
        subjectState,
        progress: workflowProgress,
      }),
    };
  });
}

function stripLegacyStageFields(row: Record<string, unknown>): Record<string, unknown> {
  const {
    current_stage: _currentStage,
    current_stage_label: _currentStageLabel,
    stage_code: _stageCode,
    stage_label: _stageLabel,
    current_construction_stage: _currentConstructionStage,
    ...rest
  } = row;

  return rest;
}

async function loadGraphsByRuntimeKey(input: {
  tenantId: string;
  runtimeInstances: WorkflowRuntimeProjectionRow[];
}): Promise<Map<string, WorkflowGraphProjection | null>> {
  const runtimeByKey = new Map<string, WorkflowRuntimeProjectionRow>();
  for (const runtimeInstance of input.runtimeInstances) {
    runtimeByKey.set(runtimeKey(runtimeInstance), runtimeInstance);
  }

  const entries = await Promise.all(
    Array.from(runtimeByKey.entries()).map(async ([key, runtimeInstance]) => {
      const cacheKey = workflowGraphCacheKey({
        tenantId: input.tenantId,
        runtimeInstance,
      });
      const cachedGraph = getCachedWorkflowGraph(cacheKey);
      if (cachedGraph !== undefined) {
        return [key, cachedGraph] as const;
      }

      const graph = await workflowRepository.getGraph({
        tenantId: input.tenantId,
        definitionId: runtimeInstance.definition_id,
        versionId: runtimeInstance.version_id,
      });
      const graphProjection = graph
        ? { definition: graph.definition, nodes: graph.nodes, edges: graph.edges }
        : null;
      setCachedWorkflowGraph(cacheKey, graphProjection);

      return [
        key,
        graphProjection,
      ] as const;
    }),
  );

  return new Map(entries);
}

function compactProjectWorkflowProgress(
  progress: ProjectWorkflowProgress,
): ProjectWorkflowProgress {
  return {
    ...progress,
    timeline_nodes: [],
  };
}

function workflowGraphCacheKey(input: {
  tenantId: string;
  runtimeInstance: WorkflowRuntimeProjectionRow;
}): string {
  return [
    input.tenantId,
    input.runtimeInstance.definition_id,
    input.runtimeInstance.version_id,
  ].join(":");
}

function getCachedWorkflowGraph(
  key: string,
): WorkflowGraphProjection | null | undefined {
  const cached = workflowGraphCache.get(key);
  if (!cached) return undefined;

  if (cached.expiresAt <= Date.now()) {
    workflowGraphCache.delete(key);
    return undefined;
  }

  return cached.value;
}

function setCachedWorkflowGraph(
  key: string,
  value: WorkflowGraphProjection | null,
) {
  const now = Date.now();
  if (workflowGraphCache.size >= WORKFLOW_GRAPH_CACHE_MAX_ENTRIES) {
    for (const [cacheKey, cached] of workflowGraphCache.entries()) {
      if (cached.expiresAt <= now) {
        workflowGraphCache.delete(cacheKey);
      }
    }

    if (workflowGraphCache.size >= WORKFLOW_GRAPH_CACHE_MAX_ENTRIES) {
      workflowGraphCache.clear();
    }
  }

  workflowGraphCache.set(key, {
    expiresAt: now + WORKFLOW_GRAPH_CACHE_TTL_MS,
    value,
  });
}

async function buildAccessibleActionsByInstance(input: {
  tenantId: string;
  tasks: WorkflowTaskWithInstanceRow[];
}): Promise<Map<string, WorkflowTaskActionPayload[]>> {
  const entries = await Promise.all(
    input.tasks.map(async (task) => ({
      instanceId: task.instance_id,
      actions: await buildWorkflowTaskActionsForTask({
        tenantId: input.tenantId,
        subjectType: "project",
        task,
      }),
    })),
  );
  const result = new Map<string, WorkflowTaskActionPayload[]>();

  for (const entry of entries) {
    result.set(entry.instanceId, [
      ...(result.get(entry.instanceId) ?? []),
      ...entry.actions,
    ]);
  }

  return result;
}

function latestRuntimeByProjectId(
  runtimeInstances: WorkflowRuntimeProjectionRow[],
): Map<string, WorkflowRuntimeProjectionRow> {
  const result = new Map<string, WorkflowRuntimeProjectionRow>();
  for (const runtimeInstance of runtimeInstances) {
    if (!result.has(runtimeInstance.subject_id)) {
      result.set(runtimeInstance.subject_id, runtimeInstance);
    }
  }

  return result;
}

function completedNodeKeysByInstanceIdFrom(
  runtimeNodes: WorkflowInstanceNodeRow[],
): Map<string, string[]> {
  const result = new Map<string, string[]>();
  for (const runtimeNode of runtimeNodes) {
    if (runtimeNode.status !== "completed") continue;

    result.set(runtimeNode.instance_id, [
      ...(result.get(runtimeNode.instance_id) ?? []),
      runtimeNode.node_key,
    ]);
  }

  return result;
}

function buildWorkflowStateSummary(input: {
  projectId: string;
  subjectState: WorkflowSubjectStateRow | null;
  progress: ProjectWorkflowProgress;
}): ProjectWorkflowStateSummary | null {
  if (!input.subjectState && input.progress.source === "missing_runtime") {
    return null;
  }

  return {
    subject_type: "project",
    subject_id: input.projectId,
    instance_id: input.progress.instance_id ?? input.subjectState?.instance_id ??
      null,
    instance_status: input.progress.instance_status ??
      input.subjectState?.instance_status ?? null,
    current_node_key: input.progress.current_node_key ??
      input.subjectState?.current_node_key ?? null,
    current_node_title: input.progress.current_node_title ??
      input.subjectState?.current_node_title ?? null,
    current_group_key: input.progress.current_group_key,
    current_group_label: input.progress.current_group_label,
    current_group_order: input.progress.current_group_order,
    current_business_kind: input.progress.current_business_kind ??
      input.subjectState?.current_business_kind ?? null,
    pending_task_count: input.subjectState?.pending_task_count ??
      input.progress.pending_task_count,
    actions: input.progress.actions,
    timeline_nodes: input.progress.timeline_nodes,
  };
}

function runtimeKey(runtimeInstance: WorkflowRuntimeProjectionRow): string {
  return `${runtimeInstance.definition_id}:${runtimeInstance.version_id}`;
}

function readProjectId(row: Record<string, unknown>): string | null {
  const value = row.id;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}
