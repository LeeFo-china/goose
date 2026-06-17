import {
  workflowRepository,
  type JsonObject,
  type WorkflowDefinitionRow,
  type WorkflowInstanceRow,
} from "@/repositories/workflows";
import type { AuthContext } from "@/services/authorization";
import { assertRuntimeNodeCompletionAllowed } from "@/services/workflow-runtime-guards";
import type { CustomerStatus, CustomerStatusAction } from "@gooes/domain";

const CUSTOMER_WORKFLOW_KEYS = ["customer_main", "sales_main"] as const;
const CUSTOMER_ADVANCE_NODE_BY_ACTION: Partial<
  Record<CustomerStatusAction, CustomerStatus>
> = {
  start_following: "potential",
  mark_arrived: "following",
  start_design: "arrived",
  mark_signed: "designing",
};

export type CustomerWorkflowRuntimeMetadata = {
  status: "started" | "advanced" | "skipped" | "failed";
  workflow_key?: string;
  definition_id?: string;
  instance_id?: string;
  node_key?: string;
  current_node_key?: string | null;
  next_node_key?: string | null;
  reason?: string;
  error_message?: string;
};

type SyncCustomerStatusTransitionInput = {
  authContext: AuthContext;
  tenantId: string;
  customerId: string;
  fromStatus: CustomerStatus;
  toStatus: CustomerStatus;
  action: CustomerStatusAction;
  reason?: string | null;
  source?: string;
  extraContext?: Record<string, unknown>;
};

type SyncCustomerCreatedInput = {
  authContext: AuthContext;
  tenantId: string;
  customerId: string;
};

class CustomerWorkflowRuntimeService {
  async syncCustomerCreated(
    input: SyncCustomerCreatedInput,
  ): Promise<CustomerWorkflowRuntimeMetadata> {
    try {
      const definition = await this.findActiveCustomerWorkflow(input.tenantId);
      if (!definition) {
        return {
          status: "skipped",
          reason: "active_customer_workflow_not_found",
        };
      }

      const existing = await this.findRunningCustomerInstance(input, definition.id);
      if (existing) {
        return {
          status: "skipped",
          workflow_key: definition.workflow_key,
          definition_id: definition.id,
          instance_id: existing.id,
          current_node_key: existing.current_node_key,
          reason: "running_instance_exists",
        };
      }

      const result = await workflowRepository.startRuntimeInstance({
        tenantId: input.tenantId,
        definitionId: definition.id,
        subjectType: "customer",
        subjectId: input.customerId,
        startedBy: input.authContext.employeeId,
        context: this.buildCustomerCreatedContext(input),
      });

      if (!result.ok) {
        return {
          status: "failed",
          workflow_key: definition.workflow_key,
          definition_id: definition.id,
          reason: result.reason,
        };
      }

      return {
        status: "started",
        workflow_key: definition.workflow_key,
        definition_id: definition.id,
        instance_id: result.instance.id,
        current_node_key: result.instance.current_node_key,
      };
    } catch (error) {
      return {
        status: "failed",
        reason: "exception",
        error_message: this.getErrorMessage(error),
      };
    }
  }

  async syncStatusTransition(
    input: SyncCustomerStatusTransitionInput,
  ): Promise<CustomerWorkflowRuntimeMetadata> {
    try {
      return await this.syncStatusTransitionUnsafe(input);
    } catch (error) {
      return {
        status: "failed",
        reason: "exception",
        error_message: this.getErrorMessage(error),
      };
    }
  }

  private async syncStatusTransitionUnsafe(
    input: SyncCustomerStatusTransitionInput,
  ): Promise<CustomerWorkflowRuntimeMetadata> {
    const definition = await this.findActiveCustomerWorkflow(input.tenantId);
    if (!definition) {
      return {
        status: "skipped",
        reason: "active_customer_workflow_not_found",
      };
    }

    const nodeKey = CUSTOMER_ADVANCE_NODE_BY_ACTION[input.action];
    if (!nodeKey) {
      return {
        status: "skipped",
        workflow_key: definition.workflow_key,
        definition_id: definition.id,
        reason: "action_not_bound_to_runtime_node",
      };
    }

    return this.advanceCustomerWorkflow(input, definition, nodeKey);
  }

  private async startCustomerWorkflow(
    input: SyncCustomerStatusTransitionInput,
    definition: WorkflowDefinitionRow,
  ): Promise<CustomerWorkflowRuntimeMetadata> {
    const existing = await this.findRunningCustomerInstance(input, definition.id);
    if (existing) {
      return {
        status: "skipped",
        workflow_key: definition.workflow_key,
        definition_id: definition.id,
        instance_id: existing.id,
        current_node_key: existing.current_node_key,
        reason: "running_instance_exists",
      };
    }

    const result = await workflowRepository.startRuntimeInstance({
      tenantId: input.tenantId,
      definitionId: definition.id,
      subjectType: "customer",
      subjectId: input.customerId,
      startedBy: input.authContext.employeeId,
      context: this.buildRuntimeContext(input),
    });

    if (!result.ok) {
      return {
        status: "failed",
        workflow_key: definition.workflow_key,
        definition_id: definition.id,
        reason: result.reason,
      };
    }

    return {
      status: "started",
      workflow_key: definition.workflow_key,
      definition_id: definition.id,
      instance_id: result.instance.id,
      current_node_key: result.instance.current_node_key,
    };
  }

  private async advanceCustomerWorkflow(
    input: SyncCustomerStatusTransitionInput,
    definition: WorkflowDefinitionRow,
    nodeKey: CustomerStatus,
  ): Promise<CustomerWorkflowRuntimeMetadata> {
    const instance = await this.findRunningCustomerInstance(input, definition.id);
    if (!instance) {
      return {
        status: "skipped",
        workflow_key: definition.workflow_key,
        definition_id: definition.id,
        node_key: nodeKey,
        reason: "running_instance_not_found",
      };
    }

    const output = this.buildRuntimeContext(input);

    await assertRuntimeNodeCompletionAllowed({
      tenantId: input.tenantId,
      definitionId: definition.id,
      instanceId: instance.id,
      nodeKey,
      output,
    });

    const result = await workflowRepository.completeRuntimeNode({
      tenantId: input.tenantId,
      definitionId: definition.id,
      instanceId: instance.id,
      nodeKey,
      action: input.action,
      actorEmployeeId: input.authContext.employeeId,
      output,
    });

    if (!result.ok) {
      return {
        status: "failed",
        workflow_key: definition.workflow_key,
        definition_id: definition.id,
        instance_id: instance.id,
        node_key: nodeKey,
        current_node_key: result.currentNodeKey ?? instance.current_node_key,
        reason: result.reason,
      };
    }

    return {
      status: "advanced",
      workflow_key: definition.workflow_key,
      definition_id: definition.id,
      instance_id: result.instance.id,
      node_key: nodeKey,
      current_node_key: result.instance.current_node_key,
      next_node_key: this.getNodeKey(result.nextNode),
    };
  }

  private async findActiveCustomerWorkflow(
    tenantId: string,
  ): Promise<WorkflowDefinitionRow | null> {
    for (const workflowKey of CUSTOMER_WORKFLOW_KEYS) {
      const definition = await workflowRepository.findDefinitionByKey(
        tenantId,
        workflowKey,
      );
      if (definition?.status === "active" && definition.active_version_id) {
        return definition;
      }
    }

    return null;
  }

  private async findRunningCustomerInstance(
    input: Pick<SyncCustomerStatusTransitionInput, "tenantId" | "customerId">,
    definitionId: string,
  ): Promise<WorkflowInstanceRow | null> {
    const result = await workflowRepository.listRuntimeInstances({
      tenantId: input.tenantId,
      definitionId,
      subjectType: "customer",
      subjectId: input.customerId,
      status: "running",
      page: 1,
      pageSize: 1,
    });

    return result.list[0] ?? null;
  }

  private buildCustomerCreatedContext(input: SyncCustomerCreatedInput): JsonObject {
    return {
      source: "customer_create",
      customer_id: input.customerId,
      operator_employee_id: input.authContext.employeeId ?? null,
      operator_auth_user_id: input.authContext.authUserId ?? null,
    };
  }

  private buildRuntimeContext(input: SyncCustomerStatusTransitionInput): JsonObject {
    return {
      source: input.source ?? "customer_status",
      customer_id: input.customerId,
      customer_status_action: input.action,
      from_status: input.fromStatus,
      to_status: input.toStatus,
      reason: input.reason ?? null,
      operator_employee_id: input.authContext.employeeId ?? null,
      operator_auth_user_id: input.authContext.authUserId ?? null,
      ...(input.extraContext ?? {}),
    };
  }

  private getNodeKey(node: JsonObject | null): string | null {
    const nodeKey = node?.node_key;
    return typeof nodeKey === "string" ? nodeKey : null;
  }

  private getErrorMessage(error: unknown) {
    return error instanceof Error ? error.message : "客户流程运行同步失败";
  }
}

export const customerWorkflowRuntimeService = new CustomerWorkflowRuntimeService();
