import { z } from "zod";

import { Errors } from "@/errors/error-factory";
import type { TenantDouyinAppointmentRow } from
  "@/repositories/tenant-douyin-leads-contract";
import { chunkValues, RELATED_IDS_PER_BATCH } from
  "@/repositories/tenant-douyin-leads-hydration";

type DatabaseResult = { data: unknown; error: unknown };
interface BudgetQuery extends PromiseLike<DatabaseResult> {
  select(...args: unknown[]): BudgetQuery;
  eq(...args: unknown[]): BudgetQuery;
  in(...args: unknown[]): BudgetQuery;
  limit(...args: unknown[]): BudgetQuery;
}
interface BudgetClient { from(table: string): BudgetQuery }
export type TenantDouyinBudgetRange = {
  readonly minimum_total: number;
  readonly maximum_total: number;
};

const BudgetRowSchema = z.strictObject({
  id: z.uuid(), tenant_id: z.uuid(), payload_id: z.uuid(),
  minimum_total: z.int().nonnegative(),
  maximum_total: z.int().nonnegative(),
}).refine((row) => row.minimum_total <= row.maximum_total);
const BUDGET_RANGE_FIELDS = [
  "id", "tenant_id", "payload_id:result_payload->>id",
  "minimum_total:result_payload->minimum_total",
  "maximum_total:result_payload->maximum_total",
].join(",");
const ERROR_MESSAGE = "查询抖音线索预算范围失败";

export async function loadTenantDouyinLeadBudgetRanges(
  client: BudgetClient,
  input: { tenantId: string; appointments: readonly TenantDouyinAppointmentRow[] },
): Promise<ReadonlyMap<string, TenantDouyinBudgetRange>> {
  try {
    const ids = [...new Set(input.appointments.flatMap((appointment) =>
      appointment.budget_estimate_id ? [appointment.budget_estimate_id] : []))];
    const ranges = new Map<string, TenantDouyinBudgetRange>();
    for (const batchIds of chunkValues(ids, RELATED_IDS_PER_BATCH)) {
      const result = await client.from("douyin_budget_estimates")
        .select(BUDGET_RANGE_FIELDS).eq("tenant_id", input.tenantId)
        .in("id", batchIds).limit(batchIds.length);
      if (result.error) throw Errors.dbError(ERROR_MESSAGE);
      const rows = BudgetRowSchema.array().safeParse(result.data ?? []);
      if (!rows.success) throw Errors.dbError(ERROR_MESSAGE);
      const requested = new Set(batchIds);
      for (const row of rows.data) {
        if (row.tenant_id !== input.tenantId || !requested.has(row.id)
          || ranges.has(row.id) || row.payload_id !== row.id) {
          throw Errors.dbError(ERROR_MESSAGE);
        }
        ranges.set(row.id, { minimum_total: row.minimum_total,
          maximum_total: row.maximum_total });
      }
    }
    if (ids.some((id) => !ranges.has(id))) throw Errors.dbError(ERROR_MESSAGE);
    return ranges;
  } catch {
    throw Errors.dbError(ERROR_MESSAGE);
  }
}
