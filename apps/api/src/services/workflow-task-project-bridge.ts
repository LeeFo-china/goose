import { Errors } from "@/errors/error-factory";
import { ProjectStatusTransitionSchema } from "@/schema/projects";
import type { AuthContext } from "@/services/authorization";
import { projectSer } from "@/services/projects";
import { resolveProjectWorkflowTaskBusinessAction } from "@/services/workflow-task-action-metadata";
import { workflowSubjectsService } from "@/services/workflow-subjects";
import type { ProjectStatusAction } from "@gooes/domain";

type ProjectWorkflowTaskOperation = {
  action: ProjectStatusAction;
  payload: {
    action: ProjectStatusAction;
    reason?: string;
    signed_amount?: unknown;
    start_date?: unknown;
    construction_manager_employee_id?: unknown;
    metadata?: Record<string, unknown>;
  };
};

type ResolveProjectWorkflowTaskOperationInput = {
  nodeKey: string;
  action: string;
  reason: string | null;
  output: Record<string, unknown>;
};

type ProjectWorkflowTaskBridgeInput = {
  authContext: AuthContext;
  task: {
    node_key: string;
    instance: {
      subject_id: string;
    };
  };
  action: string;
  reason: string | null;
  output: Record<string, unknown>;
};

function optionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function resolveProjectWorkflowTaskOperation(
  input: ResolveProjectWorkflowTaskOperationInput,
): ProjectWorkflowTaskOperation | null {
  const action = resolveProjectWorkflowTaskBusinessAction({
    nodeKey: input.nodeKey,
    action: input.action,
  });
  if (!action) return null;

  return {
    action,
    payload: {
      action,
      reason: input.reason || optionalString(input.output.reason),
      signed_amount: input.output.signed_amount,
      start_date: input.output.start_date,
      construction_manager_employee_id: input.output.construction_manager_employee_id,
    },
  };
}

class WorkflowTaskProjectBridge {
  async complete(input: ProjectWorkflowTaskBridgeInput) {
    const operation = resolveProjectWorkflowTaskOperation({
      nodeKey: input.task.node_key,
      action: input.action.trim(),
      reason: input.reason,
      output: input.output,
    });
    if (!operation) return null;

    const parsed = ProjectStatusTransitionSchema.safeParse({
      ...operation.payload,
      metadata: {
        source: "workflow_task",
        workflow_node_key: input.task.node_key,
      },
    });
    if (!parsed.success) throw Errors.fromZod(parsed.error);

    const projectId = input.task.instance.subject_id;
    const project = await projectSer.transitionProjectStatusForTenant({
      authContext: input.authContext,
      projectId,
      payload: parsed.data,
    });
    const workflowState = await workflowSubjectsService.getState(input.authContext, {
      subjectType: "project",
      subjectId: projectId,
    });

    return {
      result: {
        ok: true,
        bridged: true,
        operation: operation.action,
      },
      project,
      ...workflowState,
    };
  }
}

export const workflowTaskProjectBridge = new WorkflowTaskProjectBridge();
