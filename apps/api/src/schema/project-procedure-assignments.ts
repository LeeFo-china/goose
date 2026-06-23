import { z } from "zod";
import { PaginationQuerySchema } from "@/schema/request";

export const ProjectProcedureCandidatesParamsSchema = z.object({
  projectId: z.uuid("无效的项目 ID"),
});

export const ProjectProcedureCandidatesQuerySchema = PaginationQuerySchema.extend({
  task_id: z.uuid("无效的待办 ID"),
  node_key: z.string().trim().min(1, "节点编码不能为空").max(100).optional(),
  stage_code: z.string().trim().min(1, "工序编码不能为空").max(100).optional(),
  planned_start_date: z.string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "开工日期格式必须为 YYYY-MM-DD"),
  planned_duration_days: z.coerce.number().int().min(1).max(365),
  keyword: z.string().trim().max(50).optional(),
});

export type ProjectProcedureCandidatesQuery =
  z.infer<typeof ProjectProcedureCandidatesQuerySchema>;
