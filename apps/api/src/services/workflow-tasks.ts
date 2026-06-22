import { Errors } from "@/errors/error-factory";
import { workflowTaskRepository } from "@/repositories/workflow-tasks";
import {
  workflowRepository,
  type JsonObject,
  type WorkflowRuntimeCompleteNodeResult,
} from "@/repositories/workflows";
import type {
  WorkflowTaskCompleteInput,
  WorkflowTaskListQuery,
} from "@/schema/workflow-subjects";
import { accessPolicyService } from "@/services/access-policy";
import type { AuthContext } from "@/services/authorization";
import { workflowTaskCustomerBridge } from "@/services/workflow-task-customer-bridge";
import { workflowTaskExpenseBridge } from "@/services/workflow-task-expense-bridge";
import { workflowTaskPaymentBridge } from "@/services/workflow-task-payment-bridge";
import {
  shouldRequireProjectWorkflowRebuild,
  workflowTaskProjectBridge,
} from "@/services/workflow-task-project-bridge";
import { assertRuntimeNodeCompletionAllowed } from "@/services/workflow-runtime-guards";
import { workflowSubjectStateService } from "@/services/workflow-subject-state";
import { buildWorkflowTaskActionsForTask } from "@/services/workflow-task-actions";

class WorkflowTaskService {
  async listTasks(authContext: AuthContext, query: WorkflowTaskListQuery) {
    const tenantId = this.assertTenantId(authContext);
    const tasks = await workflowTaskRepository.listAccessibleTasks({
      tenantId,
      employeeId: authContext.employeeId,
      roleCodes: authContext.roleCodes,
      permissionCodes: authContext.permissions.map((permission) => permission.code),
      page: query.page,
      pageSize: query.pageSize,
      status: query.status,
      subjectType: query.subject_type,
      subjectId: query.subject_id?.trim() || undefined,
    });

    return {
      ...tasks,
      list: await Promise.all(tasks.list.map(async (task) => ({
        ...task,
        actions: task.instance
          ? await buildWorkflowTaskActionsForTask({
            tenantId,
            subjectType: task.instance.subject_type,
            task,
          })
          : [],
      }))),
    };
  }

  async completeTask(
    authContext: AuthContext,
    taskId: string,
    input: WorkflowTaskCompleteInput,
  ) {
    const tenantId = this.assertTenantId(authContext);
    const task = await workflowTaskRepository.findById({ tenantId, taskId });
    if (!task) {
      throw Errors.notFound("流程待办不存在");
    }
    if (!this.isTaskAccessible(authContext, task)) {
      throw Errors.forbidden();
    }
    if (task.status !== "pending") {
      throw Errors.business(409, "流程待办已处理", "WORKFLOW_TASK_NOT_PENDING");
    }
    if (!task.instance) {
      throw Errors.badRequest("流程实例不存在");
    }
    if (task.instance.current_node_key !== task.node_key) {
      throw Errors.business(409, "节点不是当前待处理节点", "WORKFLOW_NODE_NOT_CURRENT", {
        current_node_key: task.instance.current_node_key ?? null,
      });
    }

    const output = {
      ...(input.output as JsonObject),
      reason: input.reason ?? null,
    };
    if (task.instance.subject_type === "expense_request") {
      const bridged = await workflowTaskExpenseBridge.complete({
        authContext,
        task: {
          node_key: task.node_key,
          instance: { subject_id: task.instance.subject_id },
        },
        action: input.action,
        reason: input.reason ?? null,
        output,
      });
      if (bridged) return bridged;
    }
    if (task.instance.subject_type === "customer") {
      const bridged = await workflowTaskCustomerBridge.complete({
        authContext,
        task: {
          node_key: task.node_key,
          instance: { subject_id: task.instance.subject_id },
        },
        action: input.action,
        reason: input.reason ?? null,
        output,
      });
      if (bridged) return bridged;
    }
    if (task.instance.subject_type === "project") {
      const paymentBridged = await workflowTaskPaymentBridge.complete({
        authContext,
        task: {
          id: task.id,
          tenant_id: task.tenant_id,
          definition_id: task.definition_id,
          instance_id: task.instance_id,
          node_key: task.node_key,
          instance: {
            subject_id: task.instance.subject_id,
            current_node_snapshot: task.instance.current_node_snapshot,
          },
        },
        action: input.action,
        output,
      });
      if (paymentBridged) return paymentBridged;

      const definition = await workflowRepository.getDefinitionById(
        task.definition_id,
        tenantId,
      );
      if (shouldRequireProjectWorkflowRebuild({
        workflowKey: definition?.workflow_key,
        nodeKey: task.node_key,
      })) {
        throw Errors.business(
          409,
          "旧项目流程实例需先受控重建到项目签约流程后再推进",
          "WORKFLOW_INSTANCE_REBUILD_REQUIRED",
          {
            definition_id: task.definition_id,
            workflow_key: definition?.workflow_key ?? null,
            node_key: task.node_key,
          },
        );
      }

      const bridged = await workflowTaskProjectBridge.complete({
        authContext,
        task: {
          node_key: task.node_key,
          instance: { subject_id: task.instance.subject_id },
        },
        action: input.action,
        reason: input.reason ?? null,
        output,
      });
      if (bridged) return bridged;
    }

    await assertRuntimeNodeCompletionAllowed({
      tenantId,
      definitionId: task.definition_id,
      instanceId: task.instance_id,
      nodeKey: task.node_key,
      action: input.action.trim(),
      output,
    });

    const result = await workflowRepository.completeRuntimeNode({
      tenantId,
      definitionId: task.definition_id,
      instanceId: task.instance_id,
      nodeKey: task.node_key,
      action: input.action.trim(),
      output,
      actorEmployeeId: authContext.employeeId,
    });

    if (!result.ok) {
      this.throwRuntimeCompleteError(result);
    }

    const workflowState = await workflowSubjectStateService.syncFromRuntimeInstance({
      tenantId,
      subjectType: task.instance.subject_type,
      subjectId: task.instance.subject_id,
      definitionId: task.definition_id,
      instanceId: task.instance_id,
    });

    return {
      result,
      workflow_state: workflowState,
    };
  }

  private assertTenantId(authContext: AuthContext): string {
    const tenantId = accessPolicyService.assertTenantId(authContext);
    if (!tenantId) {
      throw Errors.business(403, "缺少租户上下文", "TENANT_CONTEXT_REQUIRED");
    }

    return tenantId;
  }

  private isTaskAccessible(
    authContext: AuthContext,
    task: {
      assignee_employee_id: string | null;
      assignee_role_code: string | null;
      assignee_permission_code: string | null;
    },
  ) {
    if (task.assignee_employee_id) {
      return task.assignee_employee_id === authContext.employeeId;
    }

    if (task.assignee_permission_code) {
      return authContext.permissions.some((permission) =>
        permission.code === task.assignee_permission_code
      );
    }

    if (task.assignee_role_code) {
      return authContext.roleCodes.includes(task.assignee_role_code);
    }

    return !task.assignee_employee_id;
  }

  private throwRuntimeCompleteError(
    result: Exclude<WorkflowRuntimeCompleteNodeResult, { ok: true }>,
  ): never {
    switch (result.reason) {
      case "instance_not_found":
        throw Errors.notFound("流程实例不存在");
      case "instance_not_running":
        throw Errors.badRequest("流程实例不在运行中");
      case "node_not_current":
        throw Errors.business(409, "节点不是当前待处理节点", "WORKFLOW_NODE_NOT_CURRENT", {
          current_node_key: result.currentNodeKey ?? null,
        });
      case "node_run_not_found":
        throw Errors.badRequest("当前节点运行记录不存在");
      case "graph_invalid":
        throw Errors.badRequest("流程发布版本图结构无效");
      case "invalid_output":
        throw Errors.badRequest("节点输出必须是对象");
      case "no_matching_edge":
        throw Errors.badRequest("当前节点没有匹配的分支条件");
    }
  }
}

export const workflowTaskService = new WorkflowTaskService();
