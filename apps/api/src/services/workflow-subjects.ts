import { Errors } from "@/errors/error-factory";
import { workflowTaskRepository } from "@/repositories/workflow-tasks";
import type { WorkflowSubjectStateRow } from "@/repositories/workflow-subject-states";
import type {
  WorkflowSubjectStateParams,
  WorkflowSubjectTimelineQuery,
} from "@/schema/workflow-subjects";
import { accessPolicyService } from "@/services/access-policy";
import type { AuthContext } from "@/services/authorization";
import { buildWorkflowTimelineNodes } from "@/services/project-workflow-progress";
import { workflowSubjectStateService } from "@/services/workflow-subject-state";
import { workflowSubjectStateRepository } from "@/repositories/workflow-subject-states";
import { workflowRepository } from "@/repositories/workflows";
import type { WorkflowTimelineNode } from "@/services/project-workflow-progress";
import {
  buildWorkflowTaskActionPayloads,
  type WorkflowTaskActionPayload,
} from "@/services/workflow-task-actions";
import { buildWorkflowTaskAssigneeMetadata } from "@/services/workflow-task-assignee";

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

class WorkflowSubjectsService {
  async getState(
    authContext: AuthContext,
    params: WorkflowSubjectStateParams,
  ) {
    const tenantId = this.assertTenantId(authContext);
    const state = await workflowSubjectStateService.getSubjectState({
      tenantId,
      subjectType: params.subjectType,
      subjectId: params.subjectId.trim(),
    });

    if (!state?.instance_id) {
      return {
        workflow_state: this.serializeState(state, [], []),
      };
    }

    const [tasks, timelineNodes] = await Promise.all([
      workflowTaskRepository.listAccessibleTasks({
        tenantId,
        employeeId: authContext.employeeId,
        roleCodes: authContext.roleCodes,
        permissionCodes: authContext.permissions.map((permission) =>
          permission.code
        ),
        status: "pending",
        subjectType: params.subjectType,
        subjectId: params.subjectId.trim(),
        instanceId: state.instance_id,
        page: 1,
        pageSize: 100,
      }),
      this.loadProjectTimelineNodes({
        tenantId,
        subjectType: params.subjectType,
        subjectId: params.subjectId.trim(),
      }),
    ]);
    const actions = await buildWorkflowTaskActionPayloads({
      tenantId,
      subjectType: params.subjectType,
      tasks: tasks.list,
    });

    return {
      workflow_state: this.serializeState(
        state,
        actions,
        attachWorkflowActionsToTimelineNodes(timelineNodes, actions),
      ),
    };
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
    state: WorkflowSubjectStateRow | null,
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
      current_business_kind: state.current_business_kind,
      pending_task_count: state.pending_task_count,
      actions,
      timeline_nodes: timelineNodes,
    };
  }

  private async loadProjectTimelineNodes(input: {
    tenantId: string;
    subjectType: string;
    subjectId: string;
  }): Promise<WorkflowTimelineNode[]> {
    if (input.subjectType !== "project") return [];

    const runtimeInstance = await workflowSubjectStateRepository
      .findLatestRuntimeInstance({
        tenantId: input.tenantId,
        subjectType: "project",
        subjectId: input.subjectId,
      });

    if (!runtimeInstance) return [];

    const [graph, runtimeNodes, pendingTasks] = await Promise.all([
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
    ]);

    return buildWorkflowTimelineNodes({
      graph: graph
        ? {
          nodes: graph.nodes,
          edges: graph.edges,
        }
        : null,
      currentNodeKey: runtimeInstance.current_node_key,
      completedNodeKeys: runtimeNodes
        .filter((node) => node.status === "completed")
        .map((node) => node.node_key),
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
