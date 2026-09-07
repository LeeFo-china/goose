import type { ProcurementListScope } from "./procurement-destination-scope";

/** Omit additions for legacy callers; SQL defaults keep their project-only scope. */
export function supplierPaymentDestinationParams(input: Pick<ProcurementListScope, "include_warehouse" | "destination_type" | "warehouse_id">): {
  p_include_warehouse?: true; p_destination_type?: "project" | "warehouse"; p_warehouse_id?: string;
} {
  return {
    ...(input.include_warehouse ? { p_include_warehouse: true } : {}),
    ...(input.destination_type ? { p_destination_type: input.destination_type } : {}),
    ...(input.warehouse_id ? { p_warehouse_id: input.warehouse_id } : {}),
  };
}
