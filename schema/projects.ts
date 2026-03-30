import { z } from "zod";

/**
 * 基础项目 Schema
 */
export const ProjectBaseSchema = z.object({
  // ID 由数据库生成
  id: z.string().uuid("无效的项目 ID").optional(),

  // 项目名称：不能为空
  name: z
    .string("项目名称不能为空")
    .trim()
    .min(1, "项目名称不能为空")
    .max(100, "项目名称太长了"),

  // 预算：必须是数字，且不能为负数
  // 使用 coerce 确保从表单传来的字符串 "100" 能自动转为数字 100
  budget: z.coerce
    .number("预算必须是数字")
    .min(0, "预算不能为负数")
    .nullable()
    .optional(),

  // 客户 ID：关联 customers 表，必须是 UUID
  customer_id: z.string().uuid("请选择有效的客户").nullable().optional(),

  // 项目地址
  address: z.string().trim().nullable().optional(),

  // 项目状态：建议使用枚举约束
  status: z
    .enum(["planning", "in_progress", "completed", "on_hold"], {
      message: "无效的项目状态",
    })
    .default("planning"),

  // 创建时间
  created_at: z.string().datetime("无效的时间格式").nullable().optional(),
});

/**
 * 创建项目校验 (POST)
 */
export const CreateProjectSchema = ProjectBaseSchema.omit({
  id: true,
  created_at: true,
});

/**
 * 更新项目校验 (PATCH)
 */
export const UpdateProjectSchema = CreateProjectSchema.partial();

// 导出类型
export type ProjectType = z.infer<typeof ProjectBaseSchema>;
export type CreateProjectInput = z.infer<typeof CreateProjectSchema>;
export type UpdateProjectInput = z.infer<typeof UpdateProjectSchema>;
