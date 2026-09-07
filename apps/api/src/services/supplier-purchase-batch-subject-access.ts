import { Errors } from "@/errors/error-factory";
import { supplierPurchaseBatchWorkflowReviewLookupRepository } from "@/repositories/supplier-purchase-batch-workflow-review-lookup";
import { parseFrozenProcurementDestination } from "./procurement-frozen-destination";
import { SupplierPurchaseBatchAccessRepository } from "@/repositories/supplier-purchase-batch-access";
import type { AuthContext } from "./authorization";
import { supplierPurchaseBatchAccessService } from "./supplier-purchase-batch-access";
import { assertProcurementDestinationAccess, type ProcurementDestination } from "./procurement-destination-access";

const repository = new SupplierPurchaseBatchAccessRepository();

export async function authorizeSupplierPurchaseBatchSubject(
  auth: AuthContext, params: { subjectType: string; subjectId: string },
): Promise<ProcurementDestination | null> {
  if (params.subjectType !== "supplier_purchase_batch") return null;
  const scope = await supplierPurchaseBatchAccessService.requireView(auth);
  const batch = await repository.findBatchAccessContext(scope.tenantId, params.subjectId.trim());
  if (!batch) throw Errors.business(404, "供应商采购批次不存在", "SUPPLIER_PURCHASE_BATCH_NOT_FOUND");
  await assertProcurementDestinationAccess(auth, batch, "read",
    supplierPurchaseBatchAccessService.assertProjectRead.bind(supplierPurchaseBatchAccessService));
  return batch;
}

export async function authorizeSupplierPurchaseBatchInstance(
  auth: AuthContext, params: { subjectType: string; subjectId: string }, instanceId: string,
): Promise<ProcurementDestination | null> {
  if (params.subjectType !== "supplier_purchase_batch") return null;
  const scope = await supplierPurchaseBatchAccessService.requireView(auth);
  const instances = await supplierPurchaseBatchWorkflowReviewLookupRepository.listInstancesById({
    tenantId: scope.tenantId, instanceId,
  });
  const instance = instances[0];
  if (instances.length !== 1 || !instance || instance.id !== instanceId ||
    instance.tenant_id !== scope.tenantId || instance.subject_type !== params.subjectType ||
    instance.subject_id !== params.subjectId.trim()) {
    throw Errors.business(409, "采购审批实例无效", "SUPPLIER_PURCHASE_BATCH_WORKFLOW_CONFLICT");
  }
  const destination = parseFrozenProcurementDestination(instance.context);
  await assertProcurementDestinationAccess(auth, destination, "read",
    supplierPurchaseBatchAccessService.assertProjectRead.bind(supplierPurchaseBatchAccessService));
  return destination;
}
