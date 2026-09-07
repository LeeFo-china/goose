import { z } from "zod";
import type { BatchCommandKind, BatchDestination } from "./batch-types";

const destinationSchema = z.object({
  destination_type: z.enum(["project", "warehouse"]).default("project"),
  project_id: z.uuid().nullable(),
  warehouse_id: z.uuid().nullable().default(null),
}).refine((value) =>
  value.destination_type === "warehouse"
    ? value.project_id === null && value.warehouse_id !== null
    : value.project_id !== null && value.warehouse_id === null
);

export function freezeBatchDestination(
  value: unknown,
): Readonly<BatchDestination> | undefined {
  const parsed = destinationSchema.safeParse(value);
  return parsed.success ? Object.freeze(parsed.data) : undefined;
}
export function originalBatchDestination(pending: {
  kind: BatchCommandKind;
  destination?: unknown;
  command: { payload: unknown };
}): Readonly<BatchDestination> | undefined {
  // Legacy saves carry their original destination in the frozen HTTP payload.
  // Legacy actions do not: current detail data cannot prove their old scope.
  return freezeBatchDestination(
    pending.destination ??
      (pending.kind === "save-draft" ? pending.command.payload : undefined),
  );
}
export const MISSING_BATCH_DESTINATION =
  "旧请求缺少原目的地快照，已保留原请求，请联系管理员核查";
