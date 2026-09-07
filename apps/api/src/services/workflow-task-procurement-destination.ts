import type { WorkflowTaskCardContextTask } from "./workflow-task-card-context-types";
import type { WorkflowTaskSupplierPurchaseBatchSummary } from "@/repositories/workflow-task-card-context";
import { parseFrozenProcurementDestination } from "./procurement-frozen-destination";

export function taskProcurementDestination(task: WorkflowTaskCardContextTask, batch: WorkflowTaskSupplierPurchaseBatchSummary | null) {
  if (!task.status || task.status === "pending") return batch;
  const context = task.instance?.context ?? {};
  const destination = parseFrozenProcurementDestination(context);
  return { ...destination, warehouse: destination.destination_type === "warehouse"
    ? { name: typeof context.warehouse_name === "string" ? context.warehouse_name : "仓库" } : null };
}

export function taskProcurementDisplayFacts(task: WorkflowTaskCardContextTask, batch: WorkflowTaskSupplierPurchaseBatchSummary | null) {
  if (!task.status || task.status === "pending") return batch;
  // Approval contexts freeze the applicant, but do not snapshot commercial
  // totals/counts or submitted_at. Never fill historical gaps from a new draft.
  const applicantId = task.instance?.context?.submitted_by_employee_id;
  return {
    total_amount: null, item_count: null, supplier_count: null, submitted_at: null,
    submitted_by_employee_id: typeof applicantId === "string" ? applicantId : null,
  };
}
