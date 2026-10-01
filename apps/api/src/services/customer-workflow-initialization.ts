import { customerOwnerAssignmentService } from "@/services/customer-owner-assignments";
import {
  customerWorkflowRuntimeService,
  type CustomerWorkflowRuntimeMetadata,
} from "@/services/customer-workflow-runtime";
import type { AuthContext } from "@/services/authorization";
import { workflowSubjectStateService } from "@/services/workflow-subject-state";

export type CustomerWorkflowInitializationResult =
  | { status: "ready"; attempts: number }
  | {
    status: "degraded";
    attempts: number;
    code:
      | "CUSTOMER_WORKFLOW_CONFIGURATION_MISSING"
      | "CUSTOMER_WORKFLOW_INITIALIZATION_FAILED";
    reason: string;
  };

type InitializeCustomerWorkflowInput = {
  authContext: AuthContext;
  tenantId: string;
  customerId: string;
  ownerId: string | null;
};

class CustomerWorkflowInitializationService {
  async initialize(
    input: InitializeCustomerWorkflowInput,
  ): Promise<CustomerWorkflowInitializationResult> {
    for (let attempts = 1; attempts <= 2; attempts += 1) {
      const runtime = await customerWorkflowRuntimeService.syncCustomerCreated({
        authContext: input.authContext,
        tenantId: input.tenantId,
        customerId: input.customerId,
      });

      if (this.isReady(runtime)) {
        try {
          const synchronized = await this.syncReadyRuntime(input, runtime);
          if (!synchronized) {
            return this.failed(attempts, "runtime_identifiers_missing");
          }
          return { status: "ready", attempts };
        } catch {
          return this.failed(attempts, "post_initialization_sync_failed");
        }
      }

      if (runtime.reason === "active_customer_workflow_not_found") {
        return {
          status: "degraded",
          attempts,
          code: "CUSTOMER_WORKFLOW_CONFIGURATION_MISSING",
          reason: runtime.reason,
        };
      }

      if (runtime.status !== "failed" || attempts === 2) {
        return this.failed(attempts, runtime.reason ?? "unknown_runtime_result");
      }
    }

    return this.failed(2, "unknown_runtime_result");
  }

  private isReady(runtime: CustomerWorkflowRuntimeMetadata) {
    return runtime.status === "started" ||
      (runtime.status === "skipped" && runtime.reason === "running_instance_exists");
  }

  private async syncReadyRuntime(
    input: InitializeCustomerWorkflowInput,
    runtime: CustomerWorkflowRuntimeMetadata,
  ) {
    if (input.ownerId) {
      await customerOwnerAssignmentService.syncWorkflowTasksAfterOwnerAssignment({
        tenantId: input.tenantId,
        customerId: input.customerId,
        ownerId: input.ownerId,
      });
      return true;
    }

    if (!runtime.definition_id || !runtime.instance_id) {
      return false;
    }

    await workflowSubjectStateService.syncFromRuntimeInstance({
      tenantId: input.tenantId,
      subjectType: "customer",
      subjectId: input.customerId,
      definitionId: runtime.definition_id,
      instanceId: runtime.instance_id,
    });
    return true;
  }

  private failed(attempts: number, reason: string): CustomerWorkflowInitializationResult {
    return {
      status: "degraded",
      attempts,
      code: "CUSTOMER_WORKFLOW_INITIALIZATION_FAILED",
      reason,
    };
  }
}

export const customerWorkflowInitializationService =
  new CustomerWorkflowInitializationService();
