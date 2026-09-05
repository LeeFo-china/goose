import { PROCUREMENT_DESTINATION_TYPE_VALUES } from "@gooes/domain";
import { z } from "zod";

import { Errors } from "@/errors/error-factory";

const uuid = z.uuid();

export const ProcurementDestinationRecordSchema = z.object({
  destination_type: z.enum(PROCUREMENT_DESTINATION_TYPE_VALUES)
    .default("project"),
  project_id: uuid.nullable(),
  warehouse_id: uuid.nullable().default(null),
}).strict().superRefine((value, context) => {
  const isProject = value.destination_type === "project" &&
    value.project_id !== null &&
    value.warehouse_id === null;
  const isWarehouse = value.destination_type === "warehouse" &&
    value.project_id === null &&
    value.warehouse_id !== null;
  if (!isProject && !isWarehouse) {
    context.addIssue({
      code: "custom",
      path: ["destination_type"],
      message: "采购目的地数据不一致",
    });
  }
});

export const ProcurementDestinationRelationSchema = z.object({
  id: uuid,
  name: z.string().min(1),
  status: z.string(),
}).strict();

export type ProcurementDestinationRecord =
  z.infer<typeof ProcurementDestinationRecordSchema>;

export type ProjectProcurementDestinationRecord =
  ProcurementDestinationRecord & {
    destination_type: "project";
    project_id: string;
    warehouse_id: null;
  };

export function assertProjectProcurementDestination<
  T extends ProcurementDestinationRecord,
>(record: T): asserts record is T & ProjectProcurementDestinationRecord {
  if (record.destination_type !== "warehouse") return;
  throw Errors.business(
    409,
    "仓库采购尚未开放",
    "WAREHOUSE_PROCUREMENT_NOT_ENABLED",
  );
}

export function toProjectProcurementDestination<
  T extends ProcurementDestinationRecord,
>(record: T): T & ProjectProcurementDestinationRecord {
  assertProjectProcurementDestination(record);
  return record;
}
