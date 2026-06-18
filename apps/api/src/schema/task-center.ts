import { z } from "zod";
import { PaginationQuerySchema } from "@/schema/request";

function optionalQueryValue<T extends z.ZodTypeAny>(schema: T) {
  return z.preprocess((value) => {
    if (value == null) {
      return undefined;
    }

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

export const TaskCenterTodoTypeSchema = z.enum([
  "customer_followup",
  "project_log",
  "project_payment",
  "project_workflow",
  "expense_request",
  "project_acceptance",
  "customer_service_ticket",
], {
  message: "无效的待处理类型",
});

export const TaskCenterTodoStatusSchema = z.enum(["pending"], {
  message: "无效的待处理状态",
});

export const TaskCenterTodoListQuerySchema = PaginationQuerySchema.extend({
  type: optionalQueryValue(TaskCenterTodoTypeSchema),
  status: optionalQueryValue(TaskCenterTodoStatusSchema),
});

export type TaskCenterTodoType = z.infer<typeof TaskCenterTodoTypeSchema>;
export type TaskCenterTodoStatus = z.infer<typeof TaskCenterTodoStatusSchema>;
export type TaskCenterTodoListQuery = z.infer<typeof TaskCenterTodoListQuerySchema>;
