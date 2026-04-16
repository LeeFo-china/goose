import { z } from "zod";
// project.schema.ts
import { PaginationQuerySchema } from "./request";
/**
 * 基础项目 Schema
 */

// 1. 先定义原始数组（加上 as const 是关键，让它变为字面量类型）
export const PROJECT_STATUS_VALUES = [
  "lead", // 线索
  "negotiating", // 谈单中
  "signed", // 已签约
  "designing", // 设计中
  "constructing", // 施工中
  "on_hold", // 暂停中
  "acceptance", // 验收中
  "completed", // 已完工
  "after_sale", // 售后中
  "invalid", // 无效客户
] as const;

// 2. 转换为 Zod Enum
export const ProjectStatusSchema = z.enum(PROJECT_STATUS_VALUES, {
  message: "无效的客户状态",
}).nullable().optional();

export const ProjectBaseSchema = z.object({
  // ID 由数据库生成
  id: z.uuid("无效的项目 ID").optional(),
  designer_id: z.string().trim().nullable().optional(),
  supervisor_id: z.string().trim().nullable().optional(),
  start_date: z.string().trim().nullable().optional(),
  style_tags: z
    .array(z.string().trim().min(1, "风格标签不能为空"))
    .max(20, "风格标签不能超过 20 个")
    .optional(),
  visibility_status: z
    .enum(["inherit", "public", "hidden"], {
      message: "无效的展示状态",
    })
    .default("inherit"),
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
  customer_id: z.uuid("请选择有效的客户").nullable().optional(),

  // 项目地址
  address: z.string().trim().nullable().optional(),

  // 项目状态：建议使用枚举约束
  status: ProjectStatusSchema,
  // 创建时间
  created_at: z.iso.datetime("无效的时间格式").nullable().optional(),
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

// 3. 从 Zod 自动推导出 TypeScript 类型 (这样你就不需要手动写 type ProjectStatus = ...)
export type ProjectStatus = z.infer<typeof ProjectStatusSchema>;

export const ProjectListQuerySchema = PaginationQuerySchema.extend({
  status: ProjectStatusSchema, // 允许按状态过滤
  keyword: z.string().optional(), // 允许关键词搜索
});

export type ProjectListQuery = z.infer<typeof ProjectListQuerySchema>;
