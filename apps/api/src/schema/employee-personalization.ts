import { PaginationQuerySchema } from "@/schema/request";
import { z } from "zod";

function optionalQueryValue<T extends z.ZodTypeAny>(schema: T) {
  return z.preprocess((value) => {
    if (value == null) return undefined;
    if (typeof value === "string") {
      const normalized = value.trim();
      if (!normalized || normalized === "undefined" || normalized === "null") {
        return undefined;
      }
      return normalized;
    }
    return value;
  }, schema.optional());
}

export const EmployeePersonalizationRuleStatusSchema = z.enum([
  "draft",
  "active",
  "disabled",
] as const, {
  message: "无效的规则状态",
});

export const EmployeePersonalizationRuleScopeSchema = z.enum([
  "employee",
  "department_post",
  "post",
  "department",
  "role",
  "tenant_default",
] as const, {
  message: "无效的匹配层级",
});

const NullableUuidSchema = z.uuid("无效的 ID").nullable().optional();
const OptionalDateTimeSchema = z
  .string()
  .datetime("无效的时间格式")
  .nullable()
  .optional()
  .transform((value) => value || null);

export const EmployeePersonalizationRuleListQuerySchema =
  PaginationQuerySchema.extend({
    pageSize: z.coerce.number().int().min(1, "每页条数必须大于 0").max(
      100,
      "每页条数不能超过 100",
    ).default(20),
    scene: optionalQueryValue(z.string().trim().max(64, "场景编码过长")),
    status: optionalQueryValue(EmployeePersonalizationRuleStatusSchema),
    keyword: optionalQueryValue(z.string().trim().max(100, "关键词过长")),
  });

export const EmployeePersonalizationRuleParamsSchema = z.object({
  id: z.uuid("无效的规则 ID"),
});

export const EmployeePersonalizationRuleMutationSchema = z.object({
  scene: z.string().trim().min(1, "场景编码不能为空").max(64, "场景编码过长"),
  scope: EmployeePersonalizationRuleScopeSchema,
  employee_id: NullableUuidSchema,
  tenant_department_id: NullableUuidSchema,
  post_id: NullableUuidSchema,
  role_code: z.string().trim().max(64, "角色编码过长").nullable().optional(),
  priority: z.coerce.number().int().min(-10000).max(10000).default(0),
  content_json: z.record(z.string(), z.unknown()).default({}),
  status: EmployeePersonalizationRuleStatusSchema.default("draft"),
  starts_at: OptionalDateTimeSchema,
  ends_at: OptionalDateTimeSchema,
});

export const EmployeePersonalizationRuleStatusUpdateSchema = z.object({
  status: EmployeePersonalizationRuleStatusSchema,
});

export const EmployeePersonalizationPreviewSchema = z.object({
  scene: z.string().trim().min(1, "场景编码不能为空").max(64, "场景编码过长"),
  employee_id: z.uuid("无效的员工 ID").nullable().optional(),
  tenant_department_id: z.uuid("无效的部门 ID").nullable().optional(),
  post_id: z.uuid("无效的岗位 ID").nullable().optional(),
  role_codes: z.array(z.string().trim().min(1).max(64)).max(20).default([]),
});

export type EmployeePersonalizationRuleListQuery = z.infer<
  typeof EmployeePersonalizationRuleListQuerySchema
>;
export type EmployeePersonalizationRuleMutationInput = z.infer<
  typeof EmployeePersonalizationRuleMutationSchema
>;
export type EmployeePersonalizationPreviewInput = z.infer<
  typeof EmployeePersonalizationPreviewSchema
>;
