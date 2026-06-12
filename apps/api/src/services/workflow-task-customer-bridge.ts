import { Errors } from "@/errors/error-factory";
import { CustomerStatusTransitionSchema } from "@/schema/customer";
import type { AuthContext } from "@/services/authorization";
import { customerCoreService } from "@/services/customer-core";
import { workflowSubjectsService } from "@/services/workflow-subjects";
import type { CustomerStatusAction } from "@gooes/domain";

type CustomerWorkflowTaskOperation = {
  action: CustomerStatusAction;
  payload: {
    action: CustomerStatusAction;
    reason?: string;
    metadata?: Record<string, unknown>;
  };
};

type ResolveCustomerWorkflowTaskOperationInput = {
  nodeKey: string;
  action: string;
  reason: string | null;
  output: Record<string, unknown>;
};

type CustomerWorkflowTaskBridgeInput = {
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

const LINEAR_ACTION_BY_NODE: Partial<Record<string, CustomerStatusAction>> = {
  following: "mark_arrived",
  arrived: "start_design",
};

const EXPLICIT_ACTIONS = new Set<CustomerStatusAction>(["mark_invalid"]);

function isCustomerStatusAction(value: string): value is CustomerStatusAction {
  return EXPLICIT_ACTIONS.has(value as CustomerStatusAction);
}

function optionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function resolveCustomerWorkflowTaskOperation(
  input: ResolveCustomerWorkflowTaskOperationInput,
): CustomerWorkflowTaskOperation | null {
  const action = isCustomerStatusAction(input.action)
    ? input.action
    : LINEAR_ACTION_BY_NODE[input.nodeKey];
  if (!action) return null;

  return {
    action,
    payload: {
      action,
      reason: input.reason || optionalString(input.output.reason),
    },
  };
}

class WorkflowTaskCustomerBridge {
  async complete(input: CustomerWorkflowTaskBridgeInput) {
    const operation = resolveCustomerWorkflowTaskOperation({
      nodeKey: input.task.node_key,
      action: input.action.trim(),
      reason: input.reason,
      output: input.output,
    });
    if (!operation) {
      throw Errors.badRequest("当前客户流程节点不能通过 workflow task 直接完成");
    }

    const parsed = CustomerStatusTransitionSchema.safeParse({
      ...operation.payload,
      metadata: {
        source: "workflow_task",
        workflow_node_key: input.task.node_key,
      },
    });
    if (!parsed.success) throw Errors.fromZod(parsed.error);

    const customerId = input.task.instance.subject_id;
    const customer = await customerCoreService.transitionCustomerStatus({
      authContext: input.authContext,
      customerId,
      payload: parsed.data,
    });
    const workflowState = await workflowSubjectsService.getState(input.authContext, {
      subjectType: "customer",
      subjectId: customerId,
    });

    return {
      result: {
        ok: true,
        bridged: true,
        operation: operation.action,
      },
      customer,
      ...workflowState,
    };
  }
}

export const workflowTaskCustomerBridge = new WorkflowTaskCustomerBridge();
