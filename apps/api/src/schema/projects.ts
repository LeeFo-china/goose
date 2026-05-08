import { z } from "zod";
// project.schema.ts
import { PaginationQuerySchema } from "./request";
import {
  PROJECT_MEMBER_ROLE_CODE_VALUES,
  PROJECT_STATUS_VALUES,
  PROJECT_REFERRAL_RATE_BPS_MAX,
  PROJECT_REFERRAL_RATE_BPS_MIN,
  PROJECT_VISIBILITY_STATUS_VALUES,
} from "@gooes/domain";

function optionalQueryValue<T extends z.ZodTypeAny>(schema: T) {
  return z.preprocess((value) => {
    if (value == null) {
      return undefined;
    }

    if (typeof value === "string") {
      const normalized = value.trim();
      if (
        normalized === "" ||
        normalized === "undefined" ||
        normalized === "null" ||
        normalized === "all"
      ) {
        return undefined;
      }

      return normalized;
    }

    return value;
  }, schema.optional());
}
/**
 * 基础项目 Schema
 */

// 2. 转换为 Zod Enum
export const ProjectStatusSchema = z.enum(PROJECT_STATUS_VALUES, {
  message: "无效的项目状态",
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
    .enum(PROJECT_VISIBILITY_STATUS_VALUES, {
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

  signed_amount: z.coerce
    .number("签约金额必须是数字")
    .min(0, "签约金额不能为负数")
    .nullable()
    .optional(),

  // 客户 ID：关联 customers 表，必须是 UUID
  customer_id: z.uuid("请选择有效的客户").nullable().optional(),
  property_id: z.uuid("请选择有效的房产").nullable().optional(),

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

export const ProjectOwnershipSchema = z.enum(["self", "all"], {
  message: "无效的归属筛选",
}).optional();

export const ProjectStatusFilterSchema = optionalQueryValue(
  z.enum(PROJECT_STATUS_VALUES, {
    message: "无效的项目状态",
  }),
);

export const ProjectOwnershipFilterSchema = optionalQueryValue(
  z.enum(["self", "all"], {
    message: "无效的归属筛选",
  }),
);

export const ProjectListQuerySchema = PaginationQuerySchema.extend({
  status: ProjectStatusFilterSchema, // 允许按状态过滤
  keyword: optionalQueryValue(z.string()), // 允许关键词搜索
  ownership: ProjectOwnershipFilterSchema,
  work_scope: optionalQueryValue(z.enum(["all", "today"], {
    message: "work_scope must be one of: all, today",
  })),
});

export type ProjectListQuery = z.infer<typeof ProjectListQuerySchema>;

export const ProjectResourceListQuerySchema = PaginationQuerySchema.extend({
  id: z.uuid("无效的项目 ID").optional(),
});

export type ProjectResourceListQuery = z.infer<typeof ProjectResourceListQuerySchema>;

export const ProjectReferralRateSchema = z.coerce
  .number("提成比例必须是数字")
  .int("提成比例必须是整数基点")
  .min(PROJECT_REFERRAL_RATE_BPS_MIN, `提成比例不能低于 ${PROJECT_REFERRAL_RATE_BPS_MIN}`)
  .max(PROJECT_REFERRAL_RATE_BPS_MAX, `提成比例不能高于 ${PROJECT_REFERRAL_RATE_BPS_MAX}`);

export const ProjectMemberBaseSchema = z.object({
  id: z.uuid("无效的项目成员 ID").optional(),
  project_id: z.uuid("无效的项目 ID"),
  employee_id: z.uuid("无效的员工 ID"),
  role_code: z.enum(PROJECT_MEMBER_ROLE_CODE_VALUES, {
    message: "无效的项目成员角色",
  }),
  role_name: z.string().trim().max(50, "角色名称过长").nullable().optional(),
  is_primary: z.boolean().optional().default(false),
  sort_order: z.coerce
    .number("排序值必须是数字")
    .int("排序值必须是整数")
    .min(0, "排序值不能为负数")
    .optional(),
});

export const CreateProjectMemberSchema = ProjectMemberBaseSchema.omit({
  id: true,
  project_id: true,
});

export const UpdateProjectMemberSchema = z.object({
  employee_id: z.uuid("无效的员工 ID").optional(),
  role_code: z.enum(PROJECT_MEMBER_ROLE_CODE_VALUES, {
    message: "无效的项目成员角色",
  }).optional(),
  role_name: z.string().trim().max(50, "角色名称过长").nullable().optional(),
  is_primary: z.boolean().optional(),
  sort_order: z.coerce
    .number("排序值必须是数字")
    .int("排序值必须是整数")
    .min(0, "排序值不能为负数")
    .optional(),
});

export const ProjectMemberParamsSchema = z.object({
  id: z.uuid("无效的项目 ID"),
  memberId: z.uuid("无效的项目成员 ID"),
});

export type CreateProjectMemberInput = z.infer<typeof CreateProjectMemberSchema>;
export type UpdateProjectMemberInput = z.infer<typeof UpdateProjectMemberSchema>;
