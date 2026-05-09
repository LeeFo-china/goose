import { PaginationQuerySchema } from "@/schema/request";
import { z } from "zod";

export const PlatformTenantStatusSchema = z.enum(["active", "suspended", "archived"]);

export const PlatformTenantIdParamsSchema = z.object({
  id: z.uuid("无效的租户 ID"),
});

const TenantSlugSchema = z.string()
  .trim()
  .min(2, "租户标识不能少于 2 个字符")
  .max(64, "租户标识不能超过 64 个字符")
  .regex(
    /^[a-z0-9][a-z0-9_-]*[a-z0-9]$/,
    "租户标识只能包含小写字母、数字、下划线和中划线，且首尾必须是字母或数字",
  )
  .transform((value) => value.toLowerCase());

const optionalText = (max: number, message: string) =>
  z.preprocess(
    (value) => {
      if (value === undefined || value === null) return undefined;
      if (typeof value === "string" && value.trim() === "") return undefined;
      return value;
    },
    z.string().trim().max(max, message).optional(),
  );

export const PlatformTenantListQuerySchema = PaginationQuerySchema.extend({
  status: PlatformTenantStatusSchema.optional(),
  keyword: z.string().trim().max(80, "关键词不能超过 80 个字符").optional(),
});

export const CreatePlatformTenantSchema = z.object({
  name: z.string().trim().min(1, "请输入租户名称").max(100, "租户名称不能超过 100 个字符"),
  slug: TenantSlugSchema,
  status: z.enum(["active", "suspended"]).optional().default("active"),
  contact_name: optionalText(80, "联系人不能超过 80 个字符"),
  contact_phone: optionalText(30, "联系电话不能超过 30 个字符"),
});

export const UpdatePlatformTenantSchema = z.object({
  name: z.string().trim().min(1, "请输入租户名称").max(100, "租户名称不能超过 100 个字符").optional(),
  contact_name: optionalText(80, "联系人不能超过 80 个字符"),
  contact_phone: optionalText(30, "联系电话不能超过 30 个字符"),
}).refine((value) => Object.keys(value).length > 0, {
  message: "至少需要提交一个更新字段",
});

export type PlatformTenantStatus = z.infer<typeof PlatformTenantStatusSchema>;
export type PlatformTenantListQuery = z.infer<typeof PlatformTenantListQuerySchema>;
export type CreatePlatformTenantInput = z.infer<typeof CreatePlatformTenantSchema>;
export type UpdatePlatformTenantInput = z.infer<typeof UpdatePlatformTenantSchema>;
