import { z } from "zod";
import type { PendingBatchCommand } from "./batch-command";
import type { BatchCommandResult } from "./batch-types";
import { originalBatchDestination } from "./batch-command-destination";

const uuid = z.uuid();
const money = z.string().regex(/^\d{1,16}(?:\.\d{1,2})?$/);
const count = z.number().int();
const timestamp = z.iso.datetime({ offset: true });
// Validate the persisted facts consumed by this workspace. Additional backend
// audit fields are deliberately not copied into a second full database schema.
const batchSchema = z.object({
  id: uuid,
  destination_type: z.enum(["project", "warehouse"]).default("project"),
  project_id: uuid.nullable(),
  warehouse_id: uuid.nullable().default(null),
  batch_no: z.string().regex(/^PB-\d{8}-\d{8}$/),
  status: z.enum([
    "draft",
    "pending_approval",
    "rejected",
    "cancelled",
    "ordered",
  ]),
  version: count.positive(),
  reason: z.string().trim().min(1).max(500),
  remark: z.string().trim().min(1).max(500).nullable(),
  expected_delivery_date: z.iso.date().nullable(),
  currency: z.literal("CNY"),
  subtotal_amount: money,
  tax_amount: money,
  total_amount: money,
  budget_status: z.enum([
    "unchecked",
    "within_budget",
    "over_budget",
    "not_applicable",
  ]),
  supplier_count: count.min(1).max(20),
  item_count: count.min(1).max(100),
  split_generation: count.nonnegative(),
  priced_at: timestamp,
  updated_at: timestamp,
  submitted_at: timestamp.nullable(),
}).refine((batch) =>
  batch.destination_type === "warehouse"
    ? batch.project_id === null && batch.warehouse_id !== null
    : batch.project_id !== null && batch.warehouse_id === null
);
const previewSchema = z.object({
  tenant_supplier_id: uuid,
  supplier_id: uuid,
  supplier_name: z.string().min(1),
  item_count: count.min(1).max(100),
  subtotal_amount: money,
  tax_amount: money,
  total_amount: money,
});
const workflowSchema = z.object({
  definition_id: uuid,
  instance_id: uuid,
  instance_status: z.enum(["running", "completed", "canceled"]),
  current_node_key: z.string().min(1).nullable(),
  current_node_title: z.string().min(1).nullable(),
  current_business_kind: z.string().min(1).nullable(),
  pending_task_count: count.nonnegative(),
});
const receiptSchema = z.object({
  status: z.enum([
    "saved",
    "submitted",
    "pending_approval",
    "ordered",
    "rejected",
    "withdrawn",
    "cancelled",
  ]),
  idempotent: z.boolean(),
  batch: batchSchema,
  version: count.positive(),
  split_preview: z.array(previewSchema).min(1).max(20).optional(),
  requisition_ids: z.array(uuid).min(1).max(20).optional(),
  orders: z.array(z.object({
    id: uuid,
    order_no: z.string().regex(/^PO-\d{8}-\d{8}$/),
    tenant_supplier_id: uuid,
    supplier_id: uuid,
    supplier_name: z.string().min(1),
    status: z.literal("submitted"),
  })).min(1).max(20).optional(),
  workflow_state: workflowSchema.optional(),
  error_code: z.never().optional(),
  details: z.never().optional(),
  reason: z.never().optional(),
});
const batchStatus = {
  saved: "draft",
  submitted: "pending_approval",
  pending_approval: "pending_approval",
  ordered: "ordered",
  rejected: "rejected",
  withdrawn: "draft",
  cancelled: "cancelled",
} as const;
const sameId = (left: string | null, right: string | null) =>
  left?.toLowerCase() === right?.toLowerCase();
const unique = (ids: string[]) =>
  new Set(ids.map((id) => id.toLowerCase())).size === ids.length;
function minor(value: string): bigint {
  const [integer = "0", fraction = ""] = value.split(".");
  return BigInt(integer) * BigInt(100) + BigInt(fraction.padEnd(2, "0"));
}
function validChildren(result: z.infer<typeof receiptSchema>) {
  const {
    batch,
    status,
    split_preview: preview,
    requisition_ids: ids,
    orders,
  } = result;
  if (
    (status === "saved") !== Boolean(preview) ||
    (["submitted", "ordered"].includes(status)) !== Boolean(ids) ||
    (status === "ordered") !== Boolean(orders)
  ) return false;
  if (ids && (ids.length !== batch.supplier_count || !unique(ids))) {
    return false;
  }
  if (
    orders &&
    (orders.length !== batch.supplier_count ||
      !unique(orders.map((row) => row.id)) ||
      !unique(orders.map((row) => row.tenant_supplier_id)))
  ) return false;
  if (!preview) return true;
  if (
    preview.length !== batch.supplier_count ||
    !unique(preview.map((row) => row.tenant_supplier_id)) ||
    preview.reduce((total, row) => total + row.item_count, 0) !==
      batch.item_count ||
    preview.some((row) =>
      minor(row.subtotal_amount) + minor(row.tax_amount) !==
        minor(row.total_amount)
    )
  ) return false;
  return (["subtotal_amount", "tax_amount", "total_amount"] as const).every((
    field,
  ) =>
    preview.reduce((total, row) => total + minor(row[field]), BigInt(0)) ===
      minor(batch[field])
  );
}
function validWorkflow(result: z.infer<typeof receiptSchema>) {
  const { status, batch, workflow_state: workflow } = result;
  // The HTTP review adapter removes workflow_state from terminal results.
  if (["ordered", "rejected", "cancelled", "saved"].includes(status)) {
    return workflow === undefined;
  }
  if (status === "withdrawn") {
    return Boolean(
      workflow && workflow.instance_status === "canceled" &&
        workflow.pending_task_count === 0,
    );
  }
  if (
    status === "pending_approval" ||
    (status === "submitted" &&
      (batch.destination_type === "warehouse" || workflow))
  ) {
    return Boolean(
      workflow && workflow.instance_status === "running" &&
        workflow.pending_task_count > 0 && workflow.current_node_key &&
        workflow.current_node_title,
    );
  }
  return true;
}
export function parseBatchReceipt(
  value: unknown,
  pending: PendingBatchCommand,
): BatchCommandResult | null {
  const parsed = receiptSchema.safeParse(value);
  if (!parsed.success) return null;
  const result = parsed.data, { batch, status } = result;
  const { kind, command } = pending, payload = command.payload;
  const destination = originalBatchDestination(pending);
  if (
    !destination || batch.destination_type !== destination.destination_type ||
    !sameId(batch.project_id, destination.project_id) ||
    !sameId(batch.warehouse_id, destination.warehouse_id)
  ) return null;
  const allowed = kind === "save-draft"
    ? ["saved"]
    : kind === "submit"
    ? ["submitted"]
    : kind === "withdraw"
    ? ["withdrawn"]
    : kind === "cancel"
    ? ["cancelled"]
    : "action" in payload && payload.action === "approve"
    ? ["ordered", "pending_approval"]
    : "action" in payload && payload.action === "reject"
    ? ["rejected"]
    : [];
  // Completing an intermediate workflow node preserves the batch version;
  // commands changing the batch advance it once, including frozen replays.
  const expectedVersion = payload.expected_version +
    (status === "pending_approval" ? 0 : 1);
  if (
    !allowed.includes(status) || !sameId(batch.id, command.resourcePath) ||
    result.version !== batch.version || result.version !== expectedVersion ||
    batch.status !== batchStatus[status] || !validChildren(result) ||
    !validWorkflow(result)
  ) return null;
  if (kind === "save-draft") {
    if (
      !("destination_type" in payload) ||
      batch.destination_type !== payload.destination_type ||
      !sameId(batch.project_id, payload.project_id) ||
      !sameId(batch.warehouse_id, payload.warehouse_id) ||
      batch.item_count !== payload.items.length ||
      batch.reason !== payload.reason ||
      batch.remark !== payload.remark ||
      batch.expected_delivery_date !== payload.expected_delivery_date
    ) return null;
  }
  return result;
}
