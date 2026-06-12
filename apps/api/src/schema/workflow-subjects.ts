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

export type WorkflowSubjectStateParams =
  z.infer<typeof WorkflowSubjectStateParamsSchema>;
export type WorkflowSubjectTimelineQuery =
  z.infer<typeof WorkflowSubjectTimelineQuerySchema>;
