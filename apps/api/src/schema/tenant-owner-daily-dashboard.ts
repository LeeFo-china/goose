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
    keyword: optionalQueryValue(z.string().trim().min(1).max(100)),
    window_start: optionalQueryValue(
      z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(isValidDateOnly, {
        message: "无效的排期开始日期",
      }),
    ),
    window_end: optionalQueryValue(
      z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(isValidDateOnly, {
        message: "无效的排期结束日期",
      }),
    ),
    timezone: optionalQueryValue(
      z.string().trim().min(1).max(64).refine(isValidTimezone, {
        message: "无效的时区",
      }),
    ).default("Asia/Shanghai"),
    risk: optionalQueryValue(z.enum(["delayed", "blocked", "unscheduled"])),
  }).superRefine((query, context) => {
    if (Boolean(query.window_start) !== Boolean(query.window_end)) {
      context.addIssue({
        code: "custom",
        message: "排期开始和结束日期必须同时提供",
        path: [query.window_start ? "window_end" : "window_start"],
      });
      return;
    }

    if (
      query.window_start && query.window_end &&
      query.window_start > query.window_end
    ) {
      context.addIssue({
        code: "custom",
        message: "排期开始日期不能晚于结束日期",
        path: ["window_start"],
      });
    }
  });

export type TenantOwnerDailyDashboardQuery = z.infer<
  typeof TenantOwnerDailyDashboardQuerySchema
>;

export type TenantOwnerProjectGanttQuery = z.infer<
  typeof TenantOwnerProjectGanttQuerySchema
>;

function isValidDateOnly(value: string) {
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function isValidTimezone(value: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}
