import { z } from "zod";
import { DEPARTMENT_CODE_VALUES } from "@gooes/domain";

/**
 * 基础部门 Schema
 */
export const DepartmentBaseSchema = z.object({
  // ID 通常是 UUID，由数据库自动生成
  id: z.string().uuid("无效的部门 ID").optional(),

  // name: 必填且不能为空字符串
  name: z
    .string()
    .trim()
    .min(1, "部门名称不能为空")
    .max(50, "部门名称最多 50 个字符"),

  // code: 部门代码，必须来自标准部门字典
  code: z.enum(DEPARTMENT_CODE_VALUES, {
    message: "无效的部门编码",
  }),

  // 创建时间
  created_at: z.string().datetime().nullable().optional(),
  enabled: z.boolean().optional(),
  sort: z.number().int().nullable().optional(),
});

/**
 * 创建部门校验 (POST)
 */
export const CreateDepartmentSchema = DepartmentBaseSchema.omit({
  id: true,
  created_at: true,
});

/**
 * 更新部门校验 (PATCH)
 */
export const UpdateDepartmentSchema = CreateDepartmentSchema
  .omit({ code: true })
  .extend({
    enabled: z.boolean().optional(),
    sort: z.number().int().nullable().optional(),
  })
  .partial();

// 导出类型
export type DepartmentType = z.infer<typeof DepartmentBaseSchema>;
export type CreateDepartmentInput = z.infer<typeof CreateDepartmentSchema>;
export type UpdateDepartmentInput = z.infer<typeof UpdateDepartmentSchema>;
