import { z } from "zod";
import { ADMIN_SESSION_STORAGE_PREFIX } from "@/components/layout/admin-session-scope";
import { resolveSupplierCommandAttempt } from "@/components/supplier-products/supplier-command-attempt";
import {
  beginFrozenCommand,
  type DeepReadonly,
  type FrozenCommand,
} from "@/components/supplier-purchase-orders/purchase-order-fulfillment-ui-state";
import { batchError, errorStatus, revisionDetails } from "./batch-rules";
import { parseBatchReceipt } from "./batch-receipt";
import type {
  BatchCommandKind,
  BatchCommandPayload,
  BatchDestination,
} from "./batch-types";
import {
  freezeBatchDestination,
  MISSING_BATCH_DESTINATION,
  originalBatchDestination,
} from "./batch-command-destination";

export type PendingBatchCommand = {
  kind: BatchCommandKind;
  destination?: Readonly<BatchDestination>;
  command: FrozenCommand<BatchCommandPayload>;
};
export type BatchCommandSender = (
  id: string,
  kind: BatchCommandKind,
  payload: DeepReadonly<BatchCommandPayload>,
  key: string,
) => Promise<unknown>;
export function createBatchCommand(
  kind: BatchCommandKind,
  id: string,
  payload: BatchCommandPayload,
  destination?: BatchDestination,
): PendingBatchCommand {
  const attempt = resolveSupplierCommandAttempt(null, {
    scope: `purchase-batch:${kind}`,
    resourcePath: id,
    payload,
    ...(id === "new" ? { allocateResourceId: true } : {}),
  });
  return {
    kind,
    destination: freezeBatchDestination(
      kind === "save-draft" ? payload : destination,
    ),
    command: beginFrozenCommand(attempt, payload, attempt.resourceId ?? id),
  };
}
export async function runBatchCommand(
  pending: PendingBatchCommand,
  send: BatchCommandSender,
) {
  if (!originalBatchDestination(pending)) {
    return { type: "uncertain" as const, message: MISSING_BATCH_DESTINATION };
  }
  try {
    const response = await send(
      pending.command.resourcePath,
      pending.kind,
      pending.command.payload,
      pending.command.attempt.idempotencyKey,
    );
    const result = parseBatchReceipt(response, pending);
    if (!result) {
      return {
        type: "uncertain" as const,
        message: "采购批次回执缺失或不一致，无法确认操作结果",
      };
    }
    return { type: "accepted" as const, result };
  } catch (error) {
    const status = errorStatus(error);
    const message = batchError(error);
    if (!status || status < 400 || status >= 500 || status === 408) {
      return { type: "uncertain" as const, message };
    }
    return {
      type: "rejected" as const,
      message,
      revision: revisionDetails(error),
    };
  }
}
const payloadSchema = z.union([
  z.object({
    destination_type: z.enum(["project", "warehouse"]),
    project_id: z.string().nullable(),
    warehouse_id: z.string().nullable(),
    expected_version: z.number().int().nonnegative(),
    reason: z.string(),
    remark: z.string().nullable(),
    expected_delivery_date: z.string().nullable(),
    items: z.array(
      z.object({
        supplier_sku_id: z.string(),
        quantity: z.string(),
        cost_category_id: z.string().optional(),
      }).strict(),
    ).min(1).max(100),
  }).strict(),
  z.object({
    expected_version: z.number().int().positive(),
    action: z.enum(["approve", "reject"]).optional(),
    reason: z.string().optional(),
    remark: z.string().nullable().optional(),
  }).strict(),
]);
const storedSchema = z.object({
  scope: z.string(),
  slot: z.string(),
  pending: z.object({
    kind: z.enum(["save-draft", "submit", "review", "withdraw", "cancel"]),
    destination: z.unknown().optional(),
    command: z.object({
      attempt: z.object({
        fingerprint: z.string(),
        idempotencyKey: z.string(),
        resourceId: z.string().optional(),
      }),
      payload: payloadSchema,
      phase: z.enum(["in_flight", "uncertain"]),
      resourcePath: z.string(),
    }),
  }),
});
export function commandStorageKey(scope: string, slot: string) {
  return `${ADMIN_SESSION_STORAGE_PREFIX}${scope}:purchase-batch:${slot}`;
}
export function restoreBatchCommand(
  raw: string | null,
  scope: string,
  slot: string,
): PendingBatchCommand | null {
  if (!raw) return null;
  try {
    const parsed = storedSchema.safeParse(JSON.parse(raw));
    if (
      !parsed.success || parsed.data.scope !== scope ||
      parsed.data.slot !== slot
    ) return null;
    const { kind, command } = parsed.data.pending;
    return {
      kind,
      destination: originalBatchDestination(parsed.data.pending),
      command: {
        ...beginFrozenCommand(
          command.attempt,
          command.payload,
          command.resourcePath,
        ),
        phase: "uncertain",
      },
    };
  } catch {
    return null;
  }
}
