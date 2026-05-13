import { z } from "zod";
import {
  POST_STATUS_VALUES,
  SALARY_TYPE_VALUES,
} from "@gooes/domain";

export const POST_CODE_PATTERN = /^[A-Z][A-Z0-9_]{1,63}$/;

const PostCodeValueSchema = z
  .string()
  .trim()
  .min(2, "岗位编码至少 2 个字符")
  .max(64, "岗位编码最多 64 个字符")
  .regex(POST_CODE_PATTERN, "岗位编码只能使用大写字母、数字、下划线，且必须以大写字母开头");

/**
 * 职位基础校验 (Base Schema)
 * 对应数据库中的 post 表结构
 */
export const PostBaseSchema = z.object({
  id: z.uuid().describe("职位ID"),
  code: PostCodeValueSchema.describe("职位编码"),
  name: z.string().min(1, "职位名称不能为空").max(50, "名称过长"),
  base_salary: z.number().nullable().optional().describe("基础薪资/日薪"),
  salary_type: z.enum(SALARY_TYPE_VALUES, {
    message: "无效的薪资类型",
  }).nullable().optional().describe("薪资类型"),
  sort: z.number().int().default(0).nullable().optional().describe("排序"),
  status: z.union(POST_STATUS_VALUES.map((item) => z.literal(item)) as [
    z.ZodLiteral<0>,
    z.ZodLiteral<1>,
  ]).default(1).nullable().optional().describe("状态: 0禁用, 1启用"),
  description: z.string().nullable().optional().describe("描述信息"),
  created_at: z.iso.datetime().nullable().optional(),
  updated_at: z.iso.datetime().nullable().optional(),
});

/**
 * 创建职位校验 (POST)
 * 剔除由数据库自动生成的字段
 */
export const CreatePostSchema = PostBaseSchema.omit({
  id: true,
  created_at: true,
  updated_at: true,
});

export const CreateTenantPostSchema = CreatePostSchema.extend({
  department_id: z.uuid("无效的部门 ID").optional(),
  tenant_department_id: z.uuid("无效的租户部门 ID").optional(),
}).refine(
  (value) => Boolean(value.tenant_department_id || value.department_id),
  "请先选择部门",
);

/**
 * 更新职位校验 (PATCH)
 * 将所有字段设为可选，方便局部更新
 */
export const UpdatePostSchema = CreatePostSchema.partial();

// --- 导出类型定义 ---

/** 完整的职位对象类型 */
export type PostType = z.infer<typeof PostBaseSchema>;

/** 创建职位时的输入类型 */
export type CreatePostInput = z.infer<typeof CreatePostSchema>;
export type CreateTenantPostInput = z.infer<typeof CreateTenantPostSchema>;

/** 更新职位时的输入类型 */
export type UpdatePostInput = z.infer<typeof UpdatePostSchema>;
