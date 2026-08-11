import { z } from "zod";

import { Errors } from "../errors/error-factory";
import { matchesPostgresError } from "../errors/postgres-error-details";
import type {
  CreatePendingOrderInput,
  OrderRecord,
} from "./platform-service-order-records";

const SOURCE_INVALID = "SERVICE_TRIAL_ORDER_SOURCE_INVALID";

const pendingOrderTrialAttributionSchema = z.object({
  tenant_id: z.uuid(),
  source_trial_id: z.uuid().nullable(),
}).passthrough();

export function parsePendingOrderTrialAttribution(
  data: unknown,
  expected: Pick<CreatePendingOrderInput, "tenantId" | "sourceTrialId">,
): OrderRecord {
  const parsed = pendingOrderTrialAttributionSchema.safeParse(data);
  const expectedSourceTrialId = expected.sourceTrialId ?? null;
  if (
    !parsed.success ||
    parsed.data.tenant_id !== expected.tenantId ||
    parsed.data.source_trial_id !== expectedSourceTrialId
  ) {
    throw Errors.dbError("创建平台技术服务订单失败");
  }
  return parsed.data as OrderRecord;
}

export function throwPendingOrderCreationError(error: unknown): never {
  if (matchesPostgresError(error, "P0001", SOURCE_INVALID)) {
    throw Errors.business(
      409,
      "试用来源不可用于当前订单",
      SOURCE_INVALID,
    );
  }
  throw Errors.dbError("创建平台技术服务订单失败", error);
}
