import {
  DouyinRuntimeConfigSchema as DomainDouyinRuntimeConfigSchema,
} from "@gooes/domain";
import { PaginationQuerySchema } from "@/schema/request";
import { z } from "zod";

const SensitiveReleaseMetadataPattern = /token|secret|phone|openid/i;
const ReleaseSemverPattern = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-(?:0|[1-9][0-9]*|[0-9]*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9][0-9]*|[0-9]*[A-Za-z-][0-9A-Za-z-]*))*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

export const DouyinRuntimeConfigSchema = DomainDouyinRuntimeConfigSchema;

export const PlatformDouyinMiniappListQuerySchema = PaginationQuerySchema.extend({
  page: z.coerce.number().int().min(1, "页码必须大于 0")
    .max(10_000, "页码不能超过 10000").default(1),
  installation_kind: z.enum(["merchant", "template_development"]).optional(),
  authorization_status: z.enum([
    "authorized_unbound",
    "active",
    "disabled",
    "revoked",
  ]).optional(),
}).strict();

export const PlatformDouyinMiniappIdParamsSchema = z.strictObject({
  id: z.uuid("无效的抖音小程序安装 ID"),
});

export const PlatformDouyinMiniappReleaseParamsSchema = z.strictObject({
  id: z.uuid("无效的抖音小程序安装 ID"),
  releaseId: z.uuid("无效的抖音小程序发布记录 ID"),
});

export const PlatformDouyinMiniappReleaseEmptyObjectSchema = z.strictObject({});

export const PlatformDouyinMiniappReleaseListQuerySchema = z.strictObject({
  page: z.coerce.number().int("页码必须为整数").min(1, "页码必须大于 0")
    .max(10_000, "页码不能超过 10000").default(1),
  pageSize: z.coerce.number().int("每页数量必须为整数").min(1, "每页数量必须大于 0")
    .max(100, "每页数量不能超过 100").default(20),
});

export const UploadPlatformDouyinMiniappReleaseSchema = z.strictObject({
  template_id: z.string().regex(/^[1-9][0-9]{0,18}$/, "无效的抖音模板 ID"),
  template_version: z.string().max(64, "模板版本不能超过 64 个字符")
    .regex(ReleaseSemverPattern, "模板版本必须符合 SemVer 格式"),
  description: z.string().trim().min(1, "版本描述不能为空")
    .max(200, "版本描述不能超过 200 个字符"),
  channel: z.enum(["default", "1"], "无效的发布通道"),
});

export const PromoteLatestPlatformDouyinTemplateSchema = z.strictObject({
  channel: z.enum(["default", "1"], "无效的发布通道"),
});

export const SubmitPlatformDouyinMiniappReleaseAuditSchema = z.strictObject({
  host_names: z.array(
    z.string().min(1, "宿主名称不能为空").max(253, "宿主名称不能超过 253 个字符")
      .regex(/^[A-Za-z0-9.-]+$/, "宿主名称格式无效")
      .refine((value) => !SensitiveReleaseMetadataPattern.test(value), {
        error: "宿主名称不能包含敏感信息",
      }),
  ).min(1, "至少需要一个宿主名称").max(20, "宿主名称不能超过 20 个")
    .refine((values) => new Set(values).size === values.length, {
      error: "宿主名称不能重复",
    }),
  audit_note: z.string().trim().min(1, "审核说明不能为空")
    .max(1000, "审核说明不能超过 1000 个字符")
    .refine((value) => !SensitiveReleaseMetadataPattern.test(value), {
      error: "审核说明不能包含敏感信息",
    }),
});

export const BindPlatformDouyinMiniappSchema = z.strictObject({
  tenant_id: z.uuid("无效的租户 ID"),
  runtime_config: DouyinRuntimeConfigSchema,
});

export const CreateTemplateDevelopmentInstallationSchema =
  BindPlatformDouyinMiniappSchema;

export const UpdatePlatformDouyinMiniappConfigSchema = z.strictObject({
  runtime_config: DouyinRuntimeConfigSchema,
});

const NullableDateTimeSchema = z.iso.datetime({ offset: true }).nullable();
const PlatformTenantSummarySchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  slug: z.string(),
  status: z.enum(["active", "suspended", "archived"]),
});

export const PlatformDouyinMiniappSafeRecordSchema = z.object({
  id: z.string().uuid(),
  tenant_id: z.string().uuid().nullable(),
  component_appid: z.string().trim().min(1).max(128),
  authorizer_appid: z.string().trim().min(1).max(128),
  installation_kind: z.enum(["merchant", "template_development"]),
  authorization_status: z.enum([
    "authorized_unbound",
    "active",
    "disabled",
    "revoked",
  ]),
  permission_snapshot: z.array(z.unknown()),
  runtime_config: DouyinRuntimeConfigSchema,
  template_id: z.string().regex(/^[1-9][0-9]{0,18}$/).nullable(),
  template_version: z.string().min(1).nullable(),
  last_submitted_at: NullableDateTimeSchema,
  last_audited_at: NullableDateTimeSchema,
  last_released_at: NullableDateTimeSchema,
  revoked_at: NullableDateTimeSchema,
  created_at: z.iso.datetime({ offset: true }),
  updated_at: z.iso.datetime({ offset: true }),
  tenant: PlatformTenantSummarySchema.nullable(),
});

export type DouyinRuntimeConfigInput = z.input<
  typeof DouyinRuntimeConfigSchema
>;
export type DouyinRuntimeConfig = z.output<typeof DouyinRuntimeConfigSchema>;
export type PlatformDouyinMiniappListQuery = z.infer<
  typeof PlatformDouyinMiniappListQuerySchema
>;
export type BindPlatformDouyinMiniappInput = z.output<
  typeof BindPlatformDouyinMiniappSchema
>;
export type CreateTemplateDevelopmentInstallationInput = z.output<
  typeof CreateTemplateDevelopmentInstallationSchema
>;
export type UpdatePlatformDouyinMiniappConfigInput = z.output<
  typeof UpdatePlatformDouyinMiniappConfigSchema
>;
export type PlatformDouyinMiniappSafeRecord = z.infer<
  typeof PlatformDouyinMiniappSafeRecordSchema
>;
