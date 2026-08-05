import { PaginationQuerySchema } from "@/schema/request";
import { ROLE_STATUS_VALUES } from "@gooes/domain";
import { z } from "zod";

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

export const PlatformRoleIdParamSchema = z.object({
  id: z.uuid("无效的平台角色 ID"),
});

export const PlatformRoleListQuerySchema = PaginationQuerySchema.extend({
  keyword: optionalQueryValue(
    z.string().trim().max(80, "关键词不能超过 80 个字符"),
  ),
  status: optionalQueryValue(
    z.enum(ROLE_STATUS_VALUES, { message: "请选择有效的角色状态" }),
  ),
});

export const PlatformPermissionListQuerySchema = PaginationQuerySchema.extend({
  keyword: optionalQueryValue(
    z.string().trim().max(80, "关键词不能超过 80 个字符"),
  ),
  module: optionalQueryValue(
    z.string().trim().max(80, "权限模块不能超过 80 个字符"),
  ),
});

export const CreatePlatformRoleSchema = z.object({
  name: z.string().trim().min(2, "角色名称至少需要 2 个字符").max(50, "角色名称不能超过 50 个字符"),
  description: z.string().trim().max(500, "角色说明不能超过 500 个字符").nullable().optional(),
  permission_ids: z.array(z.uuid("无效的平台权限 ID")).max(100, "权限数量不能超过 100").default([]),
  idempotency_key: IdempotencyKeySchema,
});

export const UpdatePlatformRoleSchema = z.object({
  name: z.string().trim().min(2, "角色名称至少需要 2 个字符").max(50, "角色名称不能超过 50 个字符").optional(),
  description: z.string().trim().max(500, "角色说明不能超过 500 个字符").nullable().optional(),
  expected_version: ExpectedVersionSchema,
  idempotency_key: IdempotencyKeySchema,
}).refine(
  (value) => value.name !== undefined || value.description !== undefined,
  {
    message: "至少需要提交一个可更新字段",
  },
);

export const ReplacePlatformRolePermissionsSchema = z.object({
  permissions: z.array(z.object({
    permission_id: z.uuid("无效的平台权限 ID"),
    access_scope: z.literal("all", {
      message: "平台权限范围仅支持 all",
    }),
  })).max(100, "权限数量不能超过 100"),
  expected_version: ExpectedVersionSchema,
  idempotency_key: IdempotencyKeySchema,
});

export const PlatformRoleActionSchema = z.object({
  expected_version: ExpectedVersionSchema,
  idempotency_key: IdempotencyKeySchema,
});

export type PlatformRoleListQuery = z.infer<typeof PlatformRoleListQuerySchema>;
export type PlatformPermissionListQuery = z.infer<typeof PlatformPermissionListQuerySchema>;
export type CreatePlatformRoleInput = z.infer<typeof CreatePlatformRoleSchema>;
export type UpdatePlatformRoleInput = z.infer<typeof UpdatePlatformRoleSchema>;
export type ReplacePlatformRolePermissionsInput = z.infer<typeof ReplacePlatformRolePermissionsSchema>;
export type PlatformRoleActionInput = z.infer<typeof PlatformRoleActionSchema>;
