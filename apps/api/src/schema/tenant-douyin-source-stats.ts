import { z } from "zod";

const DAY_WINDOWS = [7, 30, 90] as const;

export const TenantDouyinSourceStatsQuerySchema = z.strictObject({
  days: z.coerce.number().int().refine(
    (days) => DAY_WINDOWS.includes(days as (typeof DAY_WINDOWS)[number]),
    "统计周期只能是近 7、30 或 90 天",
  ).default(7),
  groupBy: z.enum(["content", "account"]).default("content"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type TenantDouyinSourceStatsQuery = z.infer<
  typeof TenantDouyinSourceStatsQuerySchema
>;
