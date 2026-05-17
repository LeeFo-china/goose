import { z } from "zod";
import { PaginationQuerySchema } from "@/schema/request";

export const OpsScriptKeySchema = z.enum([
  "health_check",
  "system_metrics",
  "deploy_trace",
  "deploy_notify_test",
]);

export const OpsScriptKeyParamsSchema = z.object({
  scriptKey: OpsScriptKeySchema,
});

export const RunOpsScriptSchema = z.object({
  reason: z.string().trim().max(200, "执行原因过长").optional(),
});

export const OpsScriptRunListQuerySchema = PaginationQuerySchema.extend({
  script_key: OpsScriptKeySchema.optional(),
  status: z.enum(["running", "success", "failed", "timeout"]).optional(),
});

export type OpsScriptKey = z.infer<typeof OpsScriptKeySchema>;
export type RunOpsScriptInput = z.infer<typeof RunOpsScriptSchema>;
export type OpsScriptRunListQuery = z.infer<typeof OpsScriptRunListQuerySchema>;
