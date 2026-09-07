import { supplierPurchaseBatchWorkflowReviewLookupRepository } from "@/repositories/supplier-purchase-batch-workflow-review-lookup";
import { isPureLegacyReviewEvent, reviewEventReference, workflowResolutionError } from "./workflow-task-supplier-purchase-batch-review-event";

type Lookup = Pick<typeof supplierPurchaseBatchWorkflowReviewLookupRepository, "listReviewEvents" | "listTasksById" | "listInstancesById">;

export async function resolveExactSupplierPurchaseReview(input: {
  tenantId: string; batchId: string; idempotencyKey: string | null; taskId?: string;
}, lookup: Lookup) {
  const key = input.idempotencyKey?.trim();
  if (!key || key.length > 120) return null;
  const events = await lookup.listReviewEvents({ tenantId: input.tenantId, batchId: input.batchId, idempotencyKey: key });
  if (events.length > 1) throw conflict();
  const event = events[0];
  if (!event || isPureLegacyReviewEvent(event.request)) return null;
  const reference = reviewEventReference(event.request);
  if (!reference || reference.tenantId !== input.tenantId || reference.batchId !== input.batchId ||
    (input.taskId !== undefined && reference.taskId !== input.taskId)) throw conflict();
  const tasks = await lookup.listTasksById({ tenantId: input.tenantId, taskId: reference.taskId });
  const task = tasks[0];
  if (tasks.length !== 1 || !task) throw conflict();
  const instances = await lookup.listInstancesById({ tenantId: input.tenantId, instanceId: task.instance_id });
  const instance = instances[0];
  if (instances.length !== 1 || !instance || task.id !== reference.taskId ||
    task.tenant_id !== input.tenantId || instance.tenant_id !== input.tenantId ||
    instance.id !== task.instance_id || instance.subject_type !== "supplier_purchase_batch" ||
    instance.subject_id !== input.batchId ||
    (task.node_key !== "purchase_review" && task.node_key !== "finance_review") ||
    instance.context.approval_round !== reference.approvalRound) throw conflict();
  return { task, instance };
}

function conflict() { return workflowResolutionError("SUPPLIER_PURCHASE_BATCH_WORKFLOW_CONFLICT"); }
