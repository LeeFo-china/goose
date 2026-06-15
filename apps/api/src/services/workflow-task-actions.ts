import type {
  WorkflowTaskWithInstanceRow,
} from "@/repositories/workflow-tasks";
import { getPaymentCollectionCompletionBlock } from "@/services/workflow-runtime-guards";
import {
  buildWorkflowTaskActions,
  type WorkflowTaskActionMetadata,
} from "@/services/workflow-task-action-metadata";
import { buildWorkflowTaskAssigneeMetadata } from "@/services/workflow-task-assignee";
import type { WorkflowSubjectType } from "@gooes/domain";

export type WorkflowTaskActionPayload = WorkflowTaskActionMetadata & {
  task_id: string;
  node_key: string;
  node_type: string;
  disabled: boolean;
  disabled_reason?: string;
  blocked_reason?: string;
};

export async function buildWorkflowTaskActionPayloads(input: {
  tenantId: string;
  subjectType: WorkflowSubjectType;
  tasks: WorkflowTaskWithInstanceRow[];
}): Promise<WorkflowTaskActionPayload[]> {
  const actionGroups = await Promise.all(
    input.tasks.map((task) => buildWorkflowTaskActionsForTask({
      tenantId: input.tenantId,
      subjectType: input.subjectType,
      task,
    })),
  );

  return actionGroups.flat();
}

export async function buildWorkflowTaskActionsForTask(input: {
  tenantId: string;
  subjectType: WorkflowSubjectType;
  task: WorkflowTaskWithInstanceRow;
}): Promise<WorkflowTaskActionPayload[]> {
  const actions = buildWorkflowTaskActions({
    subjectType: input.subjectType,
    nodeKey: input.task.node_key,
    nodeType: input.task.node_type,
    taskTitle: input.task.title,
    currentNodeSnapshot: input.task.instance?.current_node_snapshot,
  });
  const basePayload = {
    task_id: input.task.id,
    node_key: input.task.node_key,
    node_type: input.task.node_type,
    ...buildWorkflowTaskAssigneeMetadata(input.task),
  };

  if (
    input.subjectType !== "project" ||
    !input.task.instance?.subject_id ||
    !actions.some((action) => action.business_domain === "payment_collection")
  ) {
    return actions.map((action) => ({
      ...action,
      ...basePayload,
      disabled: false,
    }));
  }

  const block = await getPaymentCollectionCompletionBlock({
    nodeSnapshot: input.task.instance.current_node_snapshot,
    projectId: input.task.instance.subject_id,
  });

  return actions.map((action) => {
    if (action.business_domain !== "payment_collection" || !block.blocked) {
      return {
        ...action,
        ...basePayload,
        disabled: false,
      };
    }

    const blockMessage = block.message || "请先确认收款后再推进流程";
    return {
      ...action,
      ...basePayload,
      disabled: true,
      disabled_reason: blockMessage,
      blocked_reason: blockMessage,
    };
  });
}
