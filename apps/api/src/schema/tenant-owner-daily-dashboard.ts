import { z } from "zod";

import { PaginationQuerySchema } from "@/schema/request";

function optionalQueryValue<T extends z.ZodTypeAny>(schema: T) {
  return z.preprocess((value) => {
    if (value == null) return undefined;
    if (typeof value === "string") {
      const normalized = value.trim();
      if (
        normalized === "" ||
        normalized === "undefined" ||
        normalized === "null"
      ) {
        return undefined;
      }
      return normalized;
    }
    return value;
  }, schema.optional());
}

export const TenantOwnerDailyDashboardQuerySchema = z.object({
  date: optionalQueryValue(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  timezone: optionalQueryValue(z.string().trim().min(1).max(64))
    .default("Asia/Shanghai"),
});

export const TenantOwnerProjectGanttQuerySchema =
  PaginationQuerySchema.extend({
  });

export type TenantOwnerDailyDashboardQuery = z.infer<
  typeof TenantOwnerDailyDashboardQuerySchema
>;

export type TenantOwnerProjectGanttQuery = z.infer<
  typeof TenantOwnerProjectGanttQuerySchema
>;
