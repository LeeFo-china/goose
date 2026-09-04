import { z } from "zod";

const uuid = z.uuid();

export const SupplierPurchaseEmployeeSnapshotSchema = z.object({
  employee_id: uuid,
  name: z.string().trim().min(1),
  phone_masked: z.string().nullable().optional(),
  role_name: z.string().nullable().optional(),
}).strict();

export const NullableSupplierPurchaseEmployeeSnapshotSchema =
  SupplierPurchaseEmployeeSnapshotSchema.nullable();
