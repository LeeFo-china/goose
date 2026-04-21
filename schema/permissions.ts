import { PaginationQuerySchema } from "@/schema/request";
import { z } from "zod";
import {
  ACCESS_SCOPE_VALUES,
  PERMISSION_CODE_VALUES,
  PERMISSION_OVERRIDE_EFFECT_VALUES,
  PERMISSION_STATUS_VALUES,
  ROLE_STATUS_VALUES,
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
        normalized === "null"
      ) {
        return undefined;
      }

      return normalized;
    }

    return value;
  }, schema.optional());
}

export const RoleStatusSchema = z.enum(ROLE_STATUS_VALUES, {
  message: "无效的角色状态",
});

export const PermissionStatusSchema = z.enum(PERMISSION_STATUS_VALUES, {
  message: "无效的权限状态",
});

export const AccessScopeSchema = z.enum(ACCESS_SCOPE_VALUES, {
  message: "无效的数据范围",
});

export const PermissionOverrideEffectSchema = z.enum(
  PERMISSION_OVERRIDE_EFFECT_VALUES,
  {
    message: "无效的权限覆盖效果",
  },
);

export const PermissionCodeSchema = z.enum(PERMISSION_CODE_VALUES, {
  message: "无效的权限编码",
});

export const RoleBaseSchema = z.object({
  id: z.uuid("无效的角色 ID").optional(),
  code: z.string().trim().min(1, "角色编码不能为空").max(100, "角色编码过长"),
  name: z.string().trim().min(1, "角色名称不能为空").max(100, "角色名称过长"),
  description: z.string().trim().max(500, "角色说明过长").nullable().optional(),
  status: RoleStatusSchema.default("active"),
  created_at: z.string().datetime("无效的时间格式").optional(),
  updated_at: z.string().datetime("无效的时间格式").optional(),
});

export const CreateRoleSchema = RoleBaseSchema.omit({
  id: true,
  created_at: true,
  updated_at: true,
});

export const UpdateRoleSchema = CreateRoleSchema.partial();

export const PermissionBaseSchema = z.object({
  id: z.uuid("无效的权限 ID").optional(),
  code: PermissionCodeSchema,
  module: z.string().trim().min(1, "权限模块不能为空").max(100, "权限模块过长"),
  resource: z.string().trim().min(1, "权限资源不能为空").max(100, "权限资源过长"),
  action: z.string().trim().min(1, "权限动作不能为空").max(100, "权限动作过长"),
  description: z.string().trim().max(500, "权限说明过长").nullable().optional(),
  status: PermissionStatusSchema.default("active"),
  created_at: z.string().datetime("无效的时间格式").optional(),
  updated_at: z.string().datetime("无效的时间格式").optional(),
});

export const CreatePermissionSchema = PermissionBaseSchema.omit({
  id: true,
  created_at: true,
  updated_at: true,
});

export const UpdatePermissionSchema = CreatePermissionSchema.partial();

export const RoleListQuerySchema = PaginationQuerySchema.extend({
  status: optionalQueryValue(RoleStatusSchema),
  keyword: optionalQueryValue(z.string().trim().max(100, "关键词过长")),
});

export const PermissionListQuerySchema = PaginationQuerySchema.extend({
  pageSize: z.coerce.number().int().min(1, "每页条数必须大于 0").max(
    200,
    "每页条数不能超过 200",
  ).default(20),
  status: optionalQueryValue(PermissionStatusSchema),
  module: optionalQueryValue(z.string().trim().max(100, "模块名过长")),
  keyword: optionalQueryValue(z.string().trim().max(100, "关键词过长")),
});

export const EmployeeRoleParamSchema = z.object({
  id: z.uuid("无效的员工 ID"),
});

export const AssignEmployeeRolesSchema = z.object({
  role_ids: z.array(z.uuid("无效的角色 ID"))
    .max(20, "角色数量不能超过 20")
    .default([]),
});

export const EmployeePermissionOverrideSchema = z.object({
  permission_id: z.uuid("无效的权限 ID"),
  effect: PermissionOverrideEffectSchema,
  access_scope: AccessScopeSchema.nullable().optional(),
  reason: z.string().trim().max(500, "覆盖原因过长").nullable().optional(),
});

export const EmployeePermissionOverrideParamSchema = z.object({
  id: z.uuid("无效的员工 ID"),
  permission_id: z.uuid("无效的权限 ID"),
});

export const RolePermissionBindingSchema = z.object({
  permission_id: z.uuid("无效的权限 ID"),
  access_scope: AccessScopeSchema,
});

export const RolePermissionAssignSchema = z.object({
  permissions: z.array(RolePermissionBindingSchema)
    .max(200, "权限数量不能超过 200")
    .default([]),
});

export type RoleType = z.infer<typeof RoleBaseSchema>;
export type CreateRoleInput = z.infer<typeof CreateRoleSchema>;
export type UpdateRoleInput = z.infer<typeof UpdateRoleSchema>;
export type PermissionType = z.infer<typeof PermissionBaseSchema>;
export type CreatePermissionInput = z.infer<typeof CreatePermissionSchema>;
export type UpdatePermissionInput = z.infer<typeof UpdatePermissionSchema>;
export type RoleListQueryType = z.infer<typeof RoleListQuerySchema>;
export type PermissionListQueryType = z.infer<typeof PermissionListQuerySchema>;
export type AssignEmployeeRolesInput = z.infer<typeof AssignEmployeeRolesSchema>;
export type RolePermissionBindingInput =
  z.infer<typeof RolePermissionBindingSchema>;
export type RolePermissionAssignInput = z.infer<typeof RolePermissionAssignSchema>;
export type EmployeePermissionOverrideInput =
  z.infer<typeof EmployeePermissionOverrideSchema>;
