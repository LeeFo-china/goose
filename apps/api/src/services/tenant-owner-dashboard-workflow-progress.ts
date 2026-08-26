import { tenantOwnerDashboardWorkflowRepository } from "@/repositories/tenant-owner-dashboard-workflow";
import {
  workflowRepository,
  type WorkflowGraphResult,
} from "@/repositories/workflows";
import {
  workflowSubjectStateRepository,
  type WorkflowRuntimeProjectionRow,
} from "@/repositories/workflow-subject-states";
import {
  buildProjectWorkflowProgressProjection,
  type ProjectWorkflowProgress,
} from "@/services/project-workflow-progress";

export type TenantOwnerGanttWorkflowProgress = Pick<
  ProjectWorkflowProgress,
  | "source"
  | "instance_id"
  | "instance_status"
  | "current_node_key"
  | "current_node_title"
  | "timeline_nodes"
>;

type TenantOwnerDashboardWorkflowRepositoryPort = Pick<
  typeof tenantOwnerDashboardWorkflowRepository,
  "listProcedureAssignmentsForRuntimeIds"
>;

export type TenantOwnerDashboardWorkflowProgressReaderPort = {
  listProjectProgress(input: {
    tenantId: string;
    projectIds: string[];
    businessDate: string;
  }): Promise<Map<string, TenantOwnerGanttWorkflowProgress>>;
};

class TenantOwnerDashboardWorkflowProgressReader
  implements TenantOwnerDashboardWorkflowProgressReaderPort {
  constructor(
    private readonly repository: TenantOwnerDashboardWorkflowRepositoryPort =
      tenantOwnerDashboardWorkflowRepository,
  ) {}

  async listProjectProgress(input: {
    tenantId: string;
    projectIds: string[];
    businessDate: string;
  }): Promise<Map<string, TenantOwnerGanttWorkflowProgress>> {
    const projectIds = Array.from(new Set(input.projectIds));
    if (projectIds.length === 0) return new Map();

    const [subjectStates, runtimeInstances] = await Promise.all([
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
    ]);

    const runtimeIds = runtimeInstances.map((instance) => instance.id);
    const [runtimeNodes, procedureAssignments] = await Promise.all([
      workflowRepository.listRuntimeInstanceNodesByInstanceIds({
        tenantId: input.tenantId,
        instanceIds: runtimeIds,
        limit: Math.min(runtimeIds.length * 200, 20_000),
      }),
      this.repository.listProcedureAssignmentsForRuntimeIds({
        tenantId: input.tenantId,
        runtimeInstanceIds: runtimeIds,
      }),
    ]);

    const graphByRuntimeKey = await this.loadGraphs(input.tenantId, runtimeInstances);
    const subjectStateByProjectId = new Map(
      subjectStates.map((state) => [state.subject_id, state]),
    );
    const runtimeByProjectId = new Map(
      runtimeInstances.map((instance) => [instance.subject_id, instance]),
    );
    const nodesByInstanceId = groupBy(runtimeNodes, (node) => node.instance_id);
    const assignmentsByInstanceId = groupBy(
      procedureAssignments,
      (assignment) => assignment.workflow_instance_id,
    );

    return new Map(projectIds.map((projectId) => {
      const runtimeInstance = runtimeByProjectId.get(projectId) ?? null;
      const graph = runtimeInstance
        ? graphByRuntimeKey.get(runtimeGraphKey(runtimeInstance)) ?? null
        : null;
      const instanceNodes = runtimeInstance
        ? nodesByInstanceId.get(runtimeInstance.id) ?? []
        : [];
      const progress = buildProjectWorkflowProgressProjection({
        subjectState: subjectStateByProjectId.get(projectId) ?? null,
        runtimeInstance,
        graph,
        completedNodeKeys: instanceNodes
          .filter((node) => node.status === "completed")
          .map((node) => node.node_key),
        completedNodeActors: instanceNodes
          .filter((node) => node.status === "completed")
          .map((node) => ({
            node_key: node.node_key,
            completed_by_employee_id: node.completed_by,
            completed_at: node.completed_at,
          })),
        procedureAssignments: runtimeInstance
          ? assignmentsByInstanceId.get(runtimeInstance.id) ?? []
          : [],
        tenantToday: input.businessDate,
        pendingActions: [],
      });

      return [projectId, {
        source: progress.source,
        instance_id: progress.instance_id,
        instance_status: progress.instance_status,
        current_node_key: progress.current_node_key,
        current_node_title: progress.current_node_title,
        timeline_nodes: progress.timeline_nodes,
      }];
    }));
  }

  private async loadGraphs(
    tenantId: string,
    runtimeInstances: WorkflowRuntimeProjectionRow[],
  ): Promise<Map<string, WorkflowGraphResult | null>> {
    const pairs = Array.from(
      new Map(runtimeInstances.map((instance) => [
        runtimeGraphKey(instance),
        {
          definitionId: instance.definition_id,
          versionId: instance.version_id,
        },
      ])).entries(),
    );

    const graphs = await Promise.all(pairs.map(async ([key, pair]) => {
      const graph = await workflowRepository.getGraph({
        tenantId,
        definitionId: pair.definitionId,
        versionId: pair.versionId,
      });
      return [key, graph] as const;
    }));

    return new Map(graphs);
  }
}

function runtimeGraphKey(
  runtimeInstance: Pick<WorkflowRuntimeProjectionRow, "definition_id" | "version_id">,
) {
  return [runtimeInstance.definition_id, runtimeInstance.version_id].join(":");
}

function groupBy<T>(
  values: T[],
  getKey: (value: T) => string,
): Map<string, T[]> {
  const result = new Map<string, T[]>();
  for (const value of values) {
    const key = getKey(value);
    result.set(key, [...result.get(key) ?? [], value]);
  }
  return result;
}

export const tenantOwnerDashboardWorkflowProgressReader =
  new TenantOwnerDashboardWorkflowProgressReader();
