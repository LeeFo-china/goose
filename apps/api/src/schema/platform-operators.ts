import { PaginationQuerySchema } from "@/schema/request";
import { EMPLOYEE_STATUS_VALUES } from "@gooes/domain";
import { z } from "zod";

const PhoneSchema = z
  .string()
  .trim()
  .regex(/^1[3-9]\d{9}$/, "手机号格式不正确");

const ExpectedVersionSchema = z.coerce
  .number()
  .int("版本号必须是整数")
  .positive("版本号必须大于 0");

const IdempotencyKeySchema = z.uuid("幂等键必须是合法 UUID");

function optionalQueryValue<T extends z.ZodTypeAny>(schema: T) {
  return z.preprocess((value) => {
    if (value == null) return undefined;
    if (typeof value !== "string") return value;

    const normalized = value.trim();
    if (
      normalized === ""
      || normalized === "undefined"
      || normalized === "null"
    ) {
      return undefined;
    }

    return normalized;
  }, schema.optional());
}

export const PlatformOperatorIdParamSchema = z.object({
  id: z.uuid("无效的平台运营人员 ID"),
});

export const PlatformOperatorListQuerySchema = PaginationQuerySchema.extend({
  keyword: optionalQueryValue(
    z.string().trim().max(80, "关键词不能超过 80 个字符"),
  ),
  status: optionalQueryValue(
    z.enum(EMPLOYEE_STATUS_VALUES, { message: "请选择有效的人员状态" }),
  ),
  roleId: optionalQueryValue(z.uuid("无效的平台角色 ID")),
});

export const CreatePlatformOperatorSchema = z.object({
  name: z.string().trim().min(2, "姓名至少需要 2 个字符").max(50, "姓名不能超过 50 个字符"),
  phone: PhoneSchema,
  role_ids: z.array(z.uuid("无效的平台角色 ID")).min(1, "至少选择一个角色").max(10, "角色数量不能超过 10 个"),
  status: z.enum(["pending", "active"]).default("pending"),
  idempotency_key: IdempotencyKeySchema,
});

export const UpdatePlatformOperatorSchema = z.object({
  name: z.string().trim().min(2, "姓名至少需要 2 个字符").max(50, "姓名不能超过 50 个字符").optional(),
  phone: PhoneSchema.optional(),
  status: z.enum(EMPLOYEE_STATUS_VALUES, { message: "请选择有效的人员状态" }).optional(),
  expected_version: ExpectedVersionSchema,
  idempotency_key: IdempotencyKeySchema,
}).refine(
  (value) =>
    value.name !== undefined
    || value.phone !== undefined
    || value.status !== undefined,
  {
    message: "至少需要提交一个可更新字段",
  },
);

export const ReplacePlatformOperatorRolesSchema = z.object({
  role_ids: z.array(z.uuid("无效的平台角色 ID")).min(1, "至少选择一个角色").max(10, "角色数量不能超过 10 个"),
  expected_version: ExpectedVersionSchema,
  idempotency_key: IdempotencyKeySchema,
});

export const PlatformOperatorActionSchema = z.object({
  expected_version: ExpectedVersionSchema,
  idempotency_key: IdempotencyKeySchema,
});

export type PlatformOperatorListQuery = z.infer<typeof PlatformOperatorListQuerySchema>;
export type CreatePlatformOperatorInput = z.infer<typeof CreatePlatformOperatorSchema>;
export type UpdatePlatformOperatorInput = z.infer<typeof UpdatePlatformOperatorSchema>;
export type ReplacePlatformOperatorRolesInput = z.infer<typeof ReplacePlatformOperatorRolesSchema>;
export type PlatformOperatorActionInput = z.infer<typeof PlatformOperatorActionSchema>;
