import { z } from "zod";

/** Optional new fields are retained only for legacy project responses. */
export type PayableDestinationFields = {
  destination_type?: "project" | "warehouse";
  project_id: string | null;
  warehouse_id?: string | null;
  project_name?: string | null;
  warehouse_name?: string | null;
};

export type PayableDestination =
  | { destination_type: "project"; project_id: string; warehouse_id: null }
  | { destination_type: "warehouse"; project_id: null; warehouse_id: string };

const uuid = z.uuid();

export function payableDestination(value: PayableDestinationFields): PayableDestination | null {
  if (value.destination_type === "warehouse") {
    const warehouseId = uuid.safeParse(value.warehouse_id);
    return value.project_id === null && warehouseId.success
      ? { destination_type: "warehouse", project_id: null, warehouse_id: warehouseId.data.toLowerCase() }
      : null;
  }
  const projectId = uuid.safeParse(value.project_id);
  if ((value.destination_type === undefined || value.destination_type === "project") &&
      value.warehouse_id == null && projectId.success) {
    return { destination_type: "project", project_id: projectId.data.toLowerCase(), warehouse_id: null };
  }
  return null;
}

export function samePayableDestination(left: PayableDestinationFields, right: PayableDestinationFields): boolean {
  const a = payableDestination(left);
  const b = payableDestination(right);
  return a !== null && b !== null && a.destination_type === b.destination_type &&
    a.project_id === b.project_id && a.warehouse_id === b.warehouse_id;
}

export function payableDestinationLabel(value: PayableDestinationFields): string {
  const destination = payableDestination(value);
  if (!destination) return "采购去向不可用";
  return destination.destination_type === "warehouse"
    ? value.warehouse_name?.trim() || "仓库补货"
    : value.project_name?.trim() || "项目采购";
}

export function canManagePayableDestination(value: PayableDestinationFields, canManage: boolean, canManageWarehouses: boolean): boolean {
  const destination = payableDestination(value);
  return canManage && destination !== null &&
    (destination.destination_type === "project" || canManageWarehouses);
}
