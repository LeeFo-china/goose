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
  employee_id: true,
});

export const UpdateProjectLogSchema = CreateProjectLogSchema.partial();

export type ProjectLogType = z.infer<typeof ProjectLogBaseSchema>;
export type CreateProjectLogInput = z.infer<typeof CreateProjectLogSchema>;
export type UpdateProjectLogInput = z.infer<typeof UpdateProjectLogSchema>;

export const ProjectLogQuerySchema = z.object({
  project_id: z.uuid("无效的项目ID"),

  // z.coerce 会自动执行 Number(val)，解决 string | number 的模糊定义
  page: z.coerce
    .number()
    .int()
    .min(1, "页码必须大于 0")
    .default(1),

  // 修正拼写并设置合理的默认值与上限
  pageSize: z.coerce
    .number()
    .int()
    .min(1, "每页条数必须大于 0")
    .max(100, "每页条数不能超过 100")
    .default(20),
});

export type ProjectLogQueryType = z.infer<typeof ProjectLogQuerySchema>;

export const ProjectLogCalendarQuerySchema = z.object({
  project_id: z.uuid("无效的项目ID"),
});

export type ProjectLogCalendarQueryType = z.infer<typeof ProjectLogCalendarQuerySchema>;
