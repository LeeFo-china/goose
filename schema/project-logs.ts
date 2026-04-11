import { z } from "zod";

export const ProjectLogBaseSchema = z.object({
  id: z.string().uuid("无效的日志 ID").optional(),
  project_id: z.string().uuid("请选择有效的项目"),
  employee_id: z.string().uuid("请选择有效的员工"),
  node_name: z.string("节点名称不能为空").trim().min(1, "节点名称不能为空"),
  content: z.string().trim().nullable().optional(),
  images: z.any().nullable().optional(),
  created_at: z.string().datetime("无效的时间格式").optional(),
});

export const CreateProjectLogSchema = ProjectLogBaseSchema.omit({
  id: true,
  created_at: true,
});

export const UpdateProjectLogSchema = CreateProjectLogSchema.partial();

export type ProjectLogType = z.infer<typeof ProjectLogBaseSchema>;
export type CreateProjectLogInput = z.infer<typeof CreateProjectLogSchema>;
export type UpdateProjectLogInput = z.infer<typeof UpdateProjectLogSchema>;

