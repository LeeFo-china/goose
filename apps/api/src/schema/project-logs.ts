import { z } from "zod";
import {
  PROJECT_LOG_STAGE_CODE_VALUES,
  type ProjectLogStageCode,
} from "@gooes/domain";

const NullableProjectLogNodeNameSchema = z.preprocess(
  (value) => {
    if (typeof value !== "string") {
      return value;
    }

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  },
  z.string().trim().max(100, "节点补充不能超过 100 个字符").nullable().optional(),
);

const BooleanQueryValueSchema = z.preprocess((value) => {
  if (value == null || value === "") {
    return undefined;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes", "on"].includes(normalized)) {
      return true;
    }
    if (["false", "0", "no", "off"].includes(normalized)) {
      return false;
    }
  }

  return value;
}, z.boolean().default(false));

export const ProjectLogBaseSchema = z.object({
  id: z.string().uuid("无效的日志 ID").optional(),
  project_id: z.string().uuid("请选择有效的项目"),
  employee_id: z.string().uuid("请选择有效的员工"),
  stage_code: z.enum(PROJECT_LOG_STAGE_CODE_VALUES, {
    message: "无效的施工阶段",
  }),
  node_name: NullableProjectLogNodeNameSchema,
  content: z.string().trim().min(1, "日志内容不能为空"),
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

export const ProjectLogCreateQuerySchema = z.object({
  debug_timing: BooleanQueryValueSchema,
});

export type ProjectLogCreateQueryType = z.infer<
  typeof ProjectLogCreateQuerySchema
>;

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

export const isProjectLogStageCode = (
  value: string | null | undefined,
): value is ProjectLogStageCode =>
  typeof value === "string" &&
  PROJECT_LOG_STAGE_CODE_VALUES.includes(value as ProjectLogStageCode);
