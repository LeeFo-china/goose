import { workflowTaskRepository } from "@/repositories/workflow-tasks";
import { completeSupplierPurchaseBatchWorkflowTask } from
  "@/services/workflow-task-supplier-purchase-batch-completion";

export type WorkflowTaskServiceDependencies = {
  findTask: (input: { tenantId: string; taskId: string }) =>
    ReturnType<typeof workflowTaskRepository.findById>;
  completeSupplierPurchaseBatchWorkflowTask:
    typeof completeSupplierPurchaseBatchWorkflowTask;
};

export const workflowTaskServiceDependencies: WorkflowTaskServiceDependencies = {
  findTask: (input) => workflowTaskRepository.findById(input),
  completeSupplierPurchaseBatchWorkflowTask,
};
