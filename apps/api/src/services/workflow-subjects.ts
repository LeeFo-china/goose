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
  buildWorkflowTaskActions,
  type WorkflowTaskActionMetadata,
} from "@/services/workflow-task-action-metadata";
import { workflowSubjectStateService } from "@/services/workflow-subject-state";

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
        workflow_state: this.serializeState(state, []),
      };
    }

    const tasks = await workflowTaskRepository.listAccessibleTasks({
      tenantId,
      employeeId: authContext.employeeId,
      roleCodes: authContext.roleCodes,
      permissionCodes: authContext.permissions.map((permission) => permission.code),
      status: "pending",
      subjectType: params.subjectType,
      subjectId: params.subjectId.trim(),
      page: 1,
      pageSize: 100,
    });

    return {
      workflow_state: this.serializeState(
        state,
        tasks.list.flatMap((task) =>
          buildWorkflowTaskActions({
            subjectType: params.subjectType,
            nodeKey: task.node_key,
            taskTitle: task.title,
          }).map((action) => ({
            ...action,
            task_id: task.id,
            node_key: task.node_key,
            node_type: task.node_type,
            disabled: false,
          }))
        ),
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
    actions: Array<WorkflowTaskActionMetadata & {
      task_id: string;
      node_key: string;
      node_type: string;
      disabled: boolean;
    }>,
  ) {
    if (!state) {
      return null;
    }

    return {
      subject_type: state.subject_type,
      subject_id: state.subject_id,
      instance_id: state.instance_id,
      instance_status: state.instance_status,
      current_node_key: state.current_node_key,
      current_node_title: state.current_node_title,
      current_business_kind: state.current_business_kind,
      pending_task_count: state.pending_task_count,
      actions,
    };
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
