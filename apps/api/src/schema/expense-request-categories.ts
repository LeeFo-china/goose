import { PaginationQuerySchema } from "@/schema/request";
import { z } from "zod";
import { EXPENSE_MODE_VALUES } from "@gooes/domain";

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
        normalized === "null"
      ) {
        return undefined;
      }

      return normalized;
    }

    return value;
  }, schema.optional());
}

function optionalQueryBoolean() {
  return z.preprocess((value) => {
    if (value == null) return undefined;
    if (typeof value === "boolean") return value;
    if (typeof value === "string") {
      const normalized = value.trim().toLowerCase();
      if (!normalized || normalized === "undefined" || normalized === "null") {
        return undefined;
      }
      if (["true", "1", "yes"].includes(normalized)) return true;
      if (["false", "0", "no"].includes(normalized)) return false;
    }

    return value;
  }, z.boolean().optional());
}

export const ExpenseRequestCategoryStatusSchema = z.enum(
  ["active", "disabled"],
  {
    message: "无效的费用分类状态",
  },
);

export const ExpenseRequestCategoryIdParamsSchema = z.object({
  id: z.uuid("无效的费用分类 ID"),
});

export const ExpenseRequestCategoryListQuerySchema = PaginationQuerySchema.extend({
  pageSize: z.coerce.number().int().min(1, "每页条数必须大于 0").max(
    200,
    "每页条数不能超过 200",
  ).default(20),
  status: optionalQueryValue(ExpenseRequestCategoryStatusSchema),
  keyword: optionalQueryValue(z.string().trim().max(100, "关键词过长")),
  mode: optionalQueryValue(z.enum(EXPENSE_MODE_VALUES, {
    message: "无效的费用申请模式",
  })),
  department_code: optionalQueryValue(
    z.string().trim().max(100, "部门编码过长"),
  ),
  project_id: optionalQueryValue(z.uuid("无效的项目 ID")),
  include_disabled: optionalQueryBoolean().default(false),
});

export const ExpenseRequestCategoryBaseSchema = z.object({
  code: z.string().trim().min(1, "分类编码不能为空").max(50, "分类编码过长")
    .regex(/^[a-z0-9_]+$/, "分类编码只能包含小写字母、数字和下划线"),
  name: z.string().trim().min(1, "分类名称不能为空").max(100, "分类名称过长"),
  status: ExpenseRequestCategoryStatusSchema.default("active"),
  sort: z.coerce.number("排序值必须是数字").int("排序值必须是整数").min(
    0,
    "排序值不能为负数",
  ).default(0),
  is_builtin: z.boolean().default(false),
  is_default: z.boolean().default(false),
  department_codes: z.array(
    z.string().trim().min(1, "部门编码不能为空").max(100, "部门编码过长"),
  ).default([]),
  mode_codes: z.array(z.enum(EXPENSE_MODE_VALUES, {
    message: "无效的费用申请模式",
  })).default([]),
  description: z.string().trim().max(500, "分类说明过长").nullable().optional(),
  remark: z.string().trim().max(500, "备注过长").nullable().optional(),
});

export const CreateExpenseRequestCategorySchema = ExpenseRequestCategoryBaseSchema;
export const UpdateExpenseRequestCategorySchema = ExpenseRequestCategoryBaseSchema
  .partial()
  .refine((input) => Object.keys(input).length > 0, {
    message: "至少需要提供一个待更新字段",
  });

export const ExpenseRequestCategoryStatusUpdateSchema = z.object({
  status: ExpenseRequestCategoryStatusSchema,
});

export type ExpenseRequestCategoryStatus = z.infer<
  typeof ExpenseRequestCategoryStatusSchema
>;
export type ExpenseRequestCategoryListQuery = z.infer<
  typeof ExpenseRequestCategoryListQuerySchema
>;
export type CreateExpenseRequestCategoryInput = z.infer<
  typeof CreateExpenseRequestCategorySchema
>;
export type UpdateExpenseRequestCategoryInput = z.infer<
  typeof UpdateExpenseRequestCategorySchema
>;
export type ExpenseRequestCategoryStatusUpdateInput = z.infer<
  typeof ExpenseRequestCategoryStatusUpdateSchema
>;
