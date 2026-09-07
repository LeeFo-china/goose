import { Errors } from "@/errors/error-factory";
import { tenantSuppliersRepository } from "@/repositories/tenant-suppliers";
import { warehousesRepository } from "@/repositories/warehouses";
import type { AuthContext } from "./authorization";
import { accessPolicyService } from "./access-policy";
import { z } from "zod";

export type ProcurementDestination = {
  destination_type?: "project" | "warehouse";
  project_id: string | null;
  warehouse_id?: string | null;
};
export type ProcurementDestinationPort = {
  getSettings(tenantId: string): Promise<{ warehouse_procurement_enabled?: boolean } | null>;
  findWarehouse(tenantId: string, warehouseId: string): Promise<{ id: string; tenant_id: string; status: string } | null>;
};
export const procurementDestinationRepository: ProcurementDestinationPort = {
  getSettings: (tenantId) => tenantSuppliersRepository.getSettings(tenantId),
  findWarehouse: (tenantId, warehouseId) => warehousesRepository.findById(tenantId, warehouseId),
};

export function canReadWarehouseProcurement(auth: AuthContext): boolean {
  return auth.permissions.some(({ code }) => code === "inventory.warehouse.view");
}

export function hasWarehouseOnlyProjectScope(auth: AuthContext, permission: "project.read" | "project.update"): boolean {
  const permissions = auth.permissions.map(({ code }) => code);
  return !permissions.includes(permission) && permissions.includes(
    permission === "project.read" ? "inventory.warehouse.view" : "inventory.warehouse.manage");
}

export function filterWarehouseProcurementActions<T>(auth: AuthContext, destinationType: unknown, actions: T[]): T[] {
  return destinationType === "warehouse" && !auth.permissions.some(({ code }) => code === "inventory.warehouse.manage") ? [] : actions;
}

export function assertWarehouseProcurementPermission(auth: AuthContext, mode: "read" | "manage"): void {
  accessPolicyService.assertPermission(auth, mode === "read" ? "inventory.warehouse.view" : "inventory.warehouse.manage");
}

export async function assertProcurementDestinationAccess(
  auth: AuthContext, destination: ProcurementDestination, mode: "read" | "manage",
  assertProject: (auth: AuthContext, projectId: string) => Promise<void>,
): Promise<void> {
  if (destination.destination_type === "warehouse") {
    assertWarehouseProcurementPermission(auth, mode);
    return;
  }
  if (!destination.project_id) throw Errors.badRequest("采购项目不能为空");
  await assertProject(auth, destination.project_id);
}

export async function assertWarehouseProcurementEnabled(
  repository: ProcurementDestinationPort, tenantId: string, warehouseId: string | null | undefined,
): Promise<void> {
  if (!(await repository.getSettings(tenantId))?.warehouse_procurement_enabled) {
    throw Errors.business(409, "仓库采购尚未开放", "WAREHOUSE_PROCUREMENT_NOT_ENABLED");
  }
  const warehouse = warehouseId ? await repository.findWarehouse(tenantId, warehouseId) : null;
  if (!warehouse || warehouse.tenant_id !== tenantId) {
    throw Errors.business(404, "仓库不存在", "WAREHOUSE_NOT_FOUND");
  }
  if (warehouse.status !== "active") {
    throw Errors.business(409, "仓库已停用", "WAREHOUSE_INACTIVE");
  }
}

export async function assertProcurementReviewAccess(
  auth: AuthContext, destination: ProcurementDestination, permissionCode: string,
  accessPolicy: Pick<typeof accessPolicyService, "canAccessProject">,
): Promise<void> {
  if (destination.destination_type === "warehouse") {
    if (!z.uuid().safeParse(destination.warehouse_id).success || destination.project_id !== null) {
      throw Errors.business(409, "采购审批目的地无效", "SUPPLIER_PURCHASE_BATCH_WORKFLOW_CONFLICT");
    }
    assertWarehouseProcurementPermission(auth, "read");
    assertWarehouseProcurementPermission(auth, "manage");
    return;
  }
  if (!destination.project_id) {
    throw Errors.business(409, "采购审批目的地无效", "SUPPLIER_PURCHASE_BATCH_WORKFLOW_CONFLICT");
  }
  const readable = await accessPolicy.canAccessProject(auth, destination.project_id, "project.read");
  if (!readable || !await accessPolicy.canAccessProject(auth, destination.project_id, permissionCode)) throw Errors.forbidden();
}
