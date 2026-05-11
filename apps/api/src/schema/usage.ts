import { PaginationQuerySchema } from "@/schema/request";
import { z } from "zod";

const optionalText = (max = 120) =>
  z.preprocess((value) => {
    if (value === undefined || value === null) return undefined;
    if (typeof value !== "string") return value;
    const normalized = value.trim();
    if (!normalized || normalized === "undefined" || normalized === "null") {
      return undefined;
    }
    return normalized;
  }, z.string().trim().max(max).optional());

const DateStringSchema = z.string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "日期格式应为 YYYY-MM-DD");

export const UsageDateRangeQuerySchema = z.object({
  date_from: optionalText().pipe(DateStringSchema.optional()),
  date_to: optionalText().pipe(DateStringSchema.optional()),
});

export const PlatformTenantUsageQuerySchema = PaginationQuerySchema.extend({
  tenant_id: optionalText().pipe(z.uuid("无效的租户 ID").optional()),
  keyword: optionalText(80),
  date_from: optionalText().pipe(DateStringSchema.optional()),
  date_to: optionalText().pipe(DateStringSchema.optional()),
});

export const UsageAiLogsQuerySchema = PaginationQuerySchema.extend({
  tenant_id: optionalText().pipe(z.uuid("无效的租户 ID").optional()),
  scene_code: optionalText(120),
  status: z.enum(["success", "failure"]).optional(),
  provider_code: optionalText(80),
  model_code: optionalText(120),
  date_from: optionalText().pipe(DateStringSchema.optional()),
  date_to: optionalText().pipe(DateStringSchema.optional()),
});

export const UsageSmsLogsQuerySchema = PaginationQuerySchema.extend({
  tenant_id: optionalText().pipe(z.uuid("无效的租户 ID").optional()),
  status: z.enum(["success", "failure", "mock", "disabled"]).optional(),
  provider: optionalText(80),
  purpose: optionalText(120),
  date_from: optionalText().pipe(DateStringSchema.optional()),
  date_to: optionalText().pipe(DateStringSchema.optional()),
});

export type UsageDateRangeQuery = z.infer<typeof UsageDateRangeQuerySchema>;
export type PlatformTenantUsageQuery = z.infer<typeof PlatformTenantUsageQuerySchema>;
export type UsageAiLogsQuery = z.infer<typeof UsageAiLogsQuerySchema>;
export type UsageSmsLogsQuery = z.infer<typeof UsageSmsLogsQuerySchema>;
