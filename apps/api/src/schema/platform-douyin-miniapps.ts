import { PaginationQuerySchema } from "@/schema/request";
import { z } from "zod";

const HttpsUrlSchema = z.url({ protocol: /^https$/ });

export const DouyinRuntimeConfigSchema = z.strictObject({
  brand: z.strictObject({
    logo_url: HttpsUrlSchema.nullable(),
    qualifications: z.array(z.strictObject({
      title: z.string().trim().min(1).max(40),
      image_url: HttpsUrlSchema.nullable(),
    })).max(12),
  }),
  theme: z.strictObject({
    primary_color: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
    navigation_text_color: z.enum(["black", "white"]),
  }),
  features: z.strictObject({
    cases: z.boolean(),
    sites: z.boolean(),
    sms_lead: z.boolean(),
    douyin_phone: z.literal(false),
    phone_capture_mode: z.literal("sms"),
  }),
  home_banners: z.array(z.strictObject({
    image_url: HttpsUrlSchema,
    title: z.string().max(40),
    subtitle: z.string().max(80),
  })).max(5),
  trust_metrics: z.array(z.strictObject({
    label: z.string().max(16),
    value: z.string().max(16),
  })).max(4),
  privacy_policy_version: z.string().trim().min(1).max(40),
});

export const PlatformDouyinMiniappListQuerySchema = PaginationQuerySchema;

export const PlatformDouyinMiniappIdParamsSchema = z.strictObject({
  id: z.uuid("无效的抖音小程序安装 ID"),
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

export type DouyinRuntimeConfig = z.infer<typeof DouyinRuntimeConfigSchema>;
export type PlatformDouyinMiniappListQuery = z.infer<
  typeof PlatformDouyinMiniappListQuerySchema
>;
export type BindPlatformDouyinMiniappInput = z.infer<
  typeof BindPlatformDouyinMiniappSchema
>;
export type CreateTemplateDevelopmentInstallationInput = z.infer<
  typeof CreateTemplateDevelopmentInstallationSchema
>;
export type UpdatePlatformDouyinMiniappConfigInput = z.infer<
  typeof UpdatePlatformDouyinMiniappConfigSchema
>;
export type PlatformDouyinMiniappSafeRecord = z.infer<
  typeof PlatformDouyinMiniappSafeRecordSchema
>;
