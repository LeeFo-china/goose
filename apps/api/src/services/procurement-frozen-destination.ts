import { z } from "zod";
import { Errors } from "@/errors/error-factory";
import type { ProcurementDestination } from "./procurement-destination-access";

/** Legacy workflow snapshots omitted destination_type, but still froze project_id. */
export function parseFrozenProcurementDestination(context: Record<string, unknown>): ProcurementDestination {
  const type = context.destination_type ?? "project";
  if (type === "project" && z.uuid().safeParse(context.project_id).success && context.warehouse_id == null) {
    return { destination_type: "project", project_id: context.project_id as string, warehouse_id: null };
  }
  if (type === "warehouse" && context.project_id === null && z.uuid().safeParse(context.warehouse_id).success) {
    return { destination_type: "warehouse", project_id: null, warehouse_id: context.warehouse_id as string };
  }
  throw Errors.business(409, "采购审批目的地无效", "SUPPLIER_PURCHASE_BATCH_WORKFLOW_CONFLICT");
}
