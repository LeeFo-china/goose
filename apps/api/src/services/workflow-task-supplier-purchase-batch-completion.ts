import type { AuthContext } from "@/services/authorization";
import {
  workflowTaskSupplierPurchaseBatchBridge,
  type WorkflowTaskSupplierPurchaseBatchBridge,
} from "@/services/workflow-task-supplier-purchase-batch-bridge";

type SupplierTaskCompletionInput = {
  authContext: AuthContext;
  task: {
    id: string;
    tenant_id: string;
    node_key: string;
    instance: {
      subject_type: string;
      subject_id: string;
    };
  };
  action: string;
  reason: string | null;
  output: Record<string, unknown>;
  idempotencyKey: string | null;
};

export async function completeSupplierPurchaseBatchWorkflowTask(
  input: SupplierTaskCompletionInput,
  bridge: Pick<WorkflowTaskSupplierPurchaseBatchBridge, "complete"> =
    workflowTaskSupplierPurchaseBatchBridge,
) {
  if (input.task.instance.subject_type !== "supplier_purchase_batch") {
    return null;
  }

  return bridge.complete({
    authContext: input.authContext,
    task: {
      id: input.task.id,
      tenant_id: input.task.tenant_id,
      node_key: input.task.node_key,
      instance: { subject_id: input.task.instance.subject_id },
    },
    action: input.action,
    reason: input.reason,
    output: input.output,
    idempotencyKey: input.idempotencyKey,
  });
}
