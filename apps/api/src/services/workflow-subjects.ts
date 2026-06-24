import { Errors } from "@/errors/error-factory";
import { workflowTaskRepository } from "@/repositories/workflow-tasks";
import type { WorkflowSubjectStateRow } from "@/repositories/workflow-subject-states";
import type {
  WorkflowSubjectStateParams,
  WorkflowSubjectTimelineQuery,
} from "@/schema/workflow-subjects";
import { accessPolicyService } from "@/services/access-policy";
import type { AuthContext } from "@/services/authorization";
import {
  buildFinanceConfirmationActorsForTenant,
  enrichWorkflowGraphWithFinanceReviewersForTenant,
} from "@/services/project-workflow-finance-reviewer";
import { projectProcedureAssignmentService } from "@/services/project-procedure-assignments";
import { buildWorkflowTimelineNodes } from "@/services/project-workflow-progress";
import { workflowSubjectStateService } from "@/services/workflow-subject-state";
import { workflowSubjectStateRepository } from "@/repositories/workflow-subject-states";
import { workflowRepository } from "@/repositories/workflows";
import type {
  ProjectWorkflowProgress,
  WorkflowTimelineNode,
} from "@/services/project-workflow-progress";
import {
  buildWorkflowTaskActionPayloads,
  type WorkflowTaskActionPayload,
} from "@/services/workflow-task-actions";
import { buildWorkflowTaskAssigneeMetadata } from "@/services/workflow-task-assignee";
import type { WorkflowRuntimeProjectionRow } from "@/repositories/workflow-subject-states";

type WorkflowSubjectStateView =
  Omit<WorkflowSubjectStateRow, "current_business_kind"> & {
    current_business_kind: string | null;
  };

type WorkflowSubjectStateOptions = {
  workflowProgress?: ProjectWorkflowProgress | null;
  actionsPromise?: Promise<WorkflowTaskActionPayload[]>;
};

export function attachWorkflowActionsToTimelineNodes(
  nodes: WorkflowTimelineNode[],
  actions: WorkflowTaskActionPayload[],
): WorkflowTimelineNode[] {
  if (actions.length === 0) return nodes;

  const actionsByNodeKey = new Map<string, WorkflowTaskActionPayload[]>();
  for (const action of actions) {
    const existingActions = actionsByNodeKey.get(action.node_key) ?? [];
    actionsByNodeKey.set(action.node_key, [...existingActions, action]);
  }

  return nodes.map((node) => {
    const nodeActions = actionsByNodeKey.get(node.node_key) ?? [];
    if (nodeActions.length === 0) return node;

    return {
      ...node,
      actions: [
        ...node.actions,
        ...nodeActions,
      ],
    };
  });
}

export function fillMissingWorkflowActionsToTimelineNodes(
  nodes: WorkflowTimelineNode[],
  actions: WorkflowTaskActionPayload[],
): WorkflowTimelineNode[] {
  const actionsByNodeKey = new Map<string, WorkflowTaskActionPayload[]>();
  for (const action of actions) {
    actionsByNodeKey.set(action.node_key, [
      ...(actionsByNodeKey.get(action.node_key) ?? []),
      action,
    ]);
  }

  return nodes.map((node) => {
    if (node.node_type === "procedure" && node.actions.length > 0) {
      return node;
    }
    const nodeActions = actionsByNodeKey.get(node.node_key) ?? [];
    return { ...node, actions: nodeActions };
  });
}

class WorkflowSubjectsService {
  async getState(
    authContext: AuthContext,
    params: WorkflowSubjectStateParams,
    options: WorkflowSubjectStateOptions = {},
  ) {
    const tenantId = this.assertTenantId(authContext);
    const subjectId = params.subjectId.trim();
    const preloadedState = this.buildStateFromWorkflowProgress({
      tenantId,
      subjectType: params.subjectType,
      subjectId,
      workflowProgress: options.workflowProgress ?? null,
    });
    const stateResult = preloadedState
      ? { subjectState: preloadedState, runtimeInstance: null }
      : await workflowSubjectStateService.getSubjectStateWithRuntime({
        tenantId,
        subjectType: params.subjectType,
        subjectId,
      });
    const state = stateResult.subjectState;

    if (!state?.instance_id) {
      return {
        workflow_state: this.serializeState(state, [], []),
      };
    }

    const actions = await (options.actionsPromise ??
      this.loadAccessibleActions(authContext, {
        subjectType: params.subjectType,
        subjectId,
        instanceId: state.instance_id,
      }));
    const timelineNodes = preloadedState && options.workflowProgress
      ? fillMissingWorkflowActionsToTimelineNodes(
        options.workflowProgress.timeline_nodes,
        actions,
      )
      : await this.loadProjectTimelineNodes({
        tenantId,
        subjectType: params.subjectType,
        subjectId,
        actions,
        runtimeInstance: stateResult.runtimeInstance,
      });

    return {
      workflow_state: this.serializeState(
        state,
        actions,
        timelineNodes,
      ),
    };
  }

  async loadAccessibleActions(
    authContext: AuthContext,
    params: WorkflowSubjectStateParams & { instanceId?: string | null },
  ): Promise<WorkflowTaskActionPayload[]> {
    const tenantId = this.assertTenantId(authContext);
    const subjectId = params.subjectId.trim();
    const tasks = await workflowTaskRepository.listAccessibleTasks({
      tenantId,
      employeeId: authContext.employeeId,
      roleCodes: authContext.roleCodes,
      permissionCodes: authContext.permissions.map((permission) =>
        permission.code
      ),
      status: "pending",
      subjectType: params.subjectType,
      subjectId,
      ...(params.instanceId ? { instanceId: params.instanceId } : {}),
      page: 1,
      pageSize: 100,
    });

    return buildWorkflowTaskActionPayloads({
      tenantId,
      subjectType: params.subjectType,
      tasks: tasks.list,
    });
  }

  async listTimeline(
    authContext: AuthContext,
    params: WorkflowSubjectStateParams,
    query: WorkflowSubjectTimelineQuery,
  ) {
    const tenantId = this.assertTenantId(authContext);
    const state = await workflowSubjectStateService.getSubjectState({
      tenantId,
      subjectType: params.subjectType,
      subjectId: params.subjectId.trim(),
    });

    if (!state?.instance_id) {
      return {
        list: [],
        pagination: {
          page: query.page,
          pageSize: query.pageSize,
          total: 0,
          totalPages: 0,
        },
      };
    }

    return workflowTaskRepository.listTransitionLogs({
      tenantId,
      instanceId: state.instance_id,
      page: query.page,
      pageSize: query.pageSize,
    });
  }

  private serializeState(
    state: WorkflowSubjectStateView | null,
    actions: WorkflowTaskActionPayload[],
    timelineNodes: WorkflowTimelineNode[],
  ) {
    if (!state) {
      return null;
    }
    const currentTimelineNode = timelineNodes.find((node) =>
      node.node_key === state.current_node_key
    );

    return {
      subject_type: state.subject_type,
      subject_id: state.subject_id,
      instance_id: state.instance_id,
      instance_status: state.instance_status,
      current_node_key: state.current_node_key,
      current_node_title: currentTimelineNode?.display.label ??
        currentTimelineNode?.node_title ?? state.current_node_title,
      current_group_key: currentTimelineNode?.group.key ?? null,
      current_group_label: currentTimelineNode?.group.label ?? null,
      current_group_order: currentTimelineNode?.group.order ?? null,
      current_business_kind: state.current_business_kind,
      pending_task_count: state.pending_task_count,
      actions: currentTimelineNode?.actions ?? actions,
      timeline_nodes: timelineNodes,
    };
  }

  private buildStateFromWorkflowProgress(input: {
    tenantId: string;
    subjectType: string;
    subjectId: string;
    workflowProgress: ProjectWorkflowProgress | null;
  }): WorkflowSubjectStateView | null {
    const progress = input.workflowProgress;
    if (
      input.subjectType !== "project" ||
      !progress ||
      progress.source !== "workflow_runtime" ||
      !progress.instance_id
    ) {
      return null;
    }

    return {
      id: progress.instance_id,
      tenant_id: input.tenantId,
      subject_type: "project",
      subject_id: input.subjectId,
      definition_id: null,
      instance_id: progress.instance_id,
      instance_status: progress.instance_status,
      current_node_key: progress.current_node_key,
      current_node_title: progress.current_node_title,
      current_business_kind: progress.current_business_kind,
      pending_task_count: progress.pending_task_count,
      created_at: "",
      updated_at: "",
    };
  }

  private clearTimelineNodeActions(
    timelineNodes: WorkflowTimelineNode[],
  ): WorkflowTimelineNode[] {
    return timelineNodes.map((node) => ({
      ...node,
      actions: [],
    }));
  }

  private async loadProjectTimelineNodes(input: {
    tenantId: string;
    subjectType: string;
    subjectId: string;
    actions: WorkflowTaskActionPayload[];
    runtimeInstance?: WorkflowRuntimeProjectionRow | null;
  }): Promise<WorkflowTimelineNode[]> {
    if (input.subjectType !== "project") return [];

    const runtimeInstance = input.runtimeInstance ??
      await workflowSubjectStateRepository.findLatestRuntimeInstance({
        tenantId: input.tenantId,
        subjectType: "project",
        subjectId: input.subjectId,
      });

    if (!runtimeInstance) return [];

    const [graph, runtimeNodes, pendingTasks, procedureAssignments] = await Promise.all([
      workflowRepository.getGraph({
        tenantId: input.tenantId,
        definitionId: runtimeInstance.definition_id,
        versionId: runtimeInstance.version_id,
      }),
      workflowRepository.listRuntimeInstanceNodes({
        tenantId: input.tenantId,
        definitionId: runtimeInstance.definition_id,
        instanceId: runtimeInstance.id,
      }),
      workflowTaskRepository.listPendingByInstance({
        tenantId: input.tenantId,
        instanceId: runtimeInstance.id,
      }),
      projectProcedureAssignmentService.listProjectAssignmentsForRuntime({
        tenantId: input.tenantId,
        projectId: input.subjectId,
        workflowInstanceId: runtimeInstance.id,
      }),
    ]);

    const workflowGraph = graph
      ? {
        definition: graph.definition,
        nodes: graph.nodes,
        edges: graph.edges,
      }
      : null;
    const enrichedGraph = await enrichWorkflowGraphWithFinanceReviewersForTenant({
      tenantId: input.tenantId,
      graph: workflowGraph,
    });
    const completedNodeActors = await buildFinanceConfirmationActorsForTenant({
      tenantId: input.tenantId,
      runtimeNodes,
    });

    return buildWorkflowTimelineNodes({
      graph: enrichedGraph,
      currentNodeKey: runtimeInstance.current_node_key,
      completedNodeKeys: runtimeNodes
        .filter((node) => node.status === "completed")
        .map((node) => node.node_key),
      completedNodeActors,
      procedureAssignments,
      actions: input.actions,
      assignees: pendingTasks.map((task) => ({
        node_key: task.node_key,
        ...buildWorkflowTaskAssigneeMetadata(task),
      })),
    });
  }

  private assertTenantId(authContext: AuthContext): string {
    const tenantId = accessPolicyService.assertTenantId(authContext);
    if (!tenantId) {
      throw Errors.business(403, "缺少租户上下文", "TENANT_CONTEXT_REQUIRED");
    }

    return tenantId;
  }
}

export const workflowSubjectsService = new WorkflowSubjectsService();
