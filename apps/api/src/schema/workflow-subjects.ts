import { WORKFLOW_SUBJECT_TYPE_VALUES } from "@gooes/domain";
import { z } from "zod";
import { PaginationQuerySchema } from "@/schema/request";

export const WorkflowSubjectTypeSchema = z.enum(WORKFLOW_SUBJECT_TYPE_VALUES, {
  message: "无效的流程对象类型",
});

export const WorkflowSubjectStateParamsSchema = z.object({
  subjectType: WorkflowSubjectTypeSchema,
  subjectId: z.string({ error: "流程对象 ID 不能为空" })
    .trim()
    .min(1, "流程对象 ID 不能为空")
    .max(200, "流程对象 ID 过长"),
});

export const WorkflowSubjectTimelineQuerySchema = PaginationQuerySchema;

export const WorkflowTaskIdParamsSchema = z.object({
  id: z.uuid("无效的流程待办 ID"),
});

export const WorkflowTaskListQuerySchema = PaginationQuerySchema.extend({
  status: z.enum(["pending", "completed", "canceled"], {
    message: "无效的流程待办状态",
  }).optional().default("pending"),
  subject_type: WorkflowSubjectTypeSchema.optional(),
  subject_id: z.string({ error: "流程对象 ID 格式无效" })
    .trim()
    .min(1, "流程对象 ID 不能为空")
    .max(200, "流程对象 ID 过长")
    .optional(),
});

export const WorkflowTaskCompleteSchema = z.object({
  action: z.string({ error: "动作不能为空" })
    .trim()
    .min(1, "动作不能为空")
    .max(100, "动作过长")
    .default("complete"),
  reason: z.string({ error: "原因格式无效" })
    .trim()
    .max(500, "原因过长")
    .nullable()
    .optional(),
  output: z.object({}, { error: "节点输出必须是对象" })
    .catchall(z.unknown())
    .default({}),
});

export type WorkflowSubjectStateParams =
  z.infer<typeof WorkflowSubjectStateParamsSchema>;
export type WorkflowSubjectTimelineQuery =
  z.infer<typeof WorkflowSubjectTimelineQuerySchema>;
export type WorkflowTaskListQuery = z.infer<typeof WorkflowTaskListQuerySchema>;
export type WorkflowTaskCompleteInput =
  z.infer<typeof WorkflowTaskCompleteSchema>;
