import { Errors } from "@/errors/error-factory";
import { warehousesRepository } from "@/repositories/warehouses";
import { accessPolicyService } from "./access-policy";
import type { AuthContext } from "./authorization";
import { assertProcurementDestinationAccess, type ProcurementDestination } from "./procurement-destination-access";

/** Existing liabilities remain payable after replenishment is closed or a warehouse is inactive. */
export async function assertSupplierPaymentDestination(
  auth: AuthContext, destination: ProcurementDestination, mode: "read" | "manage",
  assertProject: (auth: AuthContext, projectId: string) => Promise<void>,
): Promise<void> {
  await assertProcurementDestinationAccess(auth, destination, mode, assertProject);
  if (destination.destination_type !== "warehouse") return;
  const tenantId = accessPolicyService.assertTenantContext(auth);
  const warehouse = destination.warehouse_id
    ? await warehousesRepository.findById(tenantId, destination.warehouse_id) : null;
  if (!warehouse || warehouse.tenant_id !== tenantId) {
    throw Errors.business(404, "仓库不存在", "WAREHOUSE_NOT_FOUND");
  }
}
