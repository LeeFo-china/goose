import { z } from "zod";
import { DouyinReleaseReadinessSchema } from "@gooes/domain";

import {
  DouyinRuntimeConfigSchema,
  SubmitPlatformDouyinMiniappReleaseAuditSchema,
} from "@/schema/platform-douyin-miniapps";
import { TenantServiceProviderProfileStatusSchema } from "@/schema/tenant-onboarding";

const DateTimeSchema = z.iso.datetime({ offset: true });
const NullableDateTimeSchema = DateTimeSchema.nullable();
const NullableStringSchema = z.string().nullable();
const HttpsUrlSchema = z.string().url().max(2048).refine((value) => {
  try {
    const url = new URL(value);
    return url.protocol === "https:"
      && url.username === ""
      && url.password === "";
  } catch {
    return false;
  }
});

export const TenantDouyinAuthorizationLinkSchema = z.strictObject({});

export const TenantDouyinAuthorizationCallbackSchema = z.strictObject({
  intent: z.string().min(32).max(200),
  authorization_code: z.string().min(8).max(4096),
  expires_in: z.coerce.number().int().positive().max(7200),
});

export const TenantDouyinReleaseListQuerySchema = z.strictObject({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export const TenantDouyinReleaseParamsSchema = z.strictObject({
  releaseId: z.uuid("无效的抖音小程序发布记录 ID"),
});
export const TenantDouyinReleaseEmptyObjectSchema = z.strictObject({});
export const TenantDouyinSubmitReleaseAuditSchema =
  SubmitPlatformDouyinMiniappReleaseAuditSchema;
export const TenantDouyinReleaseReadinessResponseSchema =
  DouyinReleaseReadinessSchema;

export const TenantDouyinAuthorizationStateSchema = z.enum([
  "unbound",
  "active",
  "disabled",
  "revoked",
]);

export const TenantDouyinReleaseStateSchema = z.enum([
  "not_uploaded",
  "created",
  "uploaded",
  "testing",
  "audit_pending",
  "audit_rejected",
  "audit_approved",
  "released",
  "sync_error",
]);

export const TenantDouyinWorkspaceSchema = z.strictObject({
  tenant: z.strictObject({
    id: z.string().uuid(),
    name: z.string().min(1),
  }),
  authorization_state: TenantDouyinAuthorizationStateSchema,
  release_state: TenantDouyinReleaseStateSchema,
  installation: z.strictObject({
    id: z.string().uuid(),
    authorizer_appid: z.string().trim().min(1).max(128),
    installation_kind: z.literal("merchant"),
    authorization_status: z.enum(["active", "disabled", "revoked"]),
    permission_snapshot: z.array(z.unknown()),
    runtime_config: DouyinRuntimeConfigSchema,
    template_version: NullableStringSchema,
    template_release_id: z.string().uuid().nullable(),
    created_at: DateTimeSchema,
    updated_at: DateTimeSchema,
  }).nullable(),
  public_profile: z.strictObject({
    public_name: NullableStringSchema,
    introduction: NullableStringSchema,
    public_phone: NullableStringSchema,
    status: TenantServiceProviderProfileStatusSchema,
    version: z.number().int().positive(),
    submitted_at: NullableDateTimeSchema,
    reviewed_at: NullableDateTimeSchema,
    review_remark: NullableStringSchema,
    published_at: NullableDateTimeSchema,
    updated_at: DateTimeSchema,
  }).nullable(),
  public_content: z.strictObject({
    cases: z.number().int().nonnegative(),
    sites: z.number().int().nonnegative(),
    active_service_areas: z.number().int().nonnegative(),
  }),
  available_template: z.strictObject({
    template_id: z.string().regex(/^[1-9][0-9]{0,18}$/),
    version: z.string().trim().min(1).max(64),
    description: z.string().trim().min(1).max(200),
    confirmed_at: DateTimeSchema,
    state: z.enum([
      "new_available",
      "in_progress",
      "up_to_date",
      "stale_version",
    ]),
  }).nullable(),
  latest_release: z.strictObject({
    id: z.string().uuid(),
    installation_id: z.string().uuid(),
    template_id: z.string().regex(/^[1-9][0-9]{0,18}$/),
    template_version: z.string().trim().min(1).max(64),
    description: z.string().trim().min(1).max(200),
    status: z.enum([
      "created",
      "uploaded",
      "testing",
      "audit_pending",
      "audit_rejected",
      "audit_approved",
      "released",
      "failed",
    ]),
    test_qr_url: HttpsUrlSchema.nullable(),
    latest_test_qr_url: HttpsUrlSchema.nullable(),
    audit_qr_url: HttpsUrlSchema.nullable(),
    audit_note: NullableStringSchema,
    audit_result: z.strictObject({
      audit_id: z.string().regex(/^[A-Za-z0-9._:-]{1,128}$/).optional(),
      status: z.enum(["pending", "approved", "rejected", "failed"]).optional(),
      reason: z.string().trim().min(1).max(1000).optional(),
      error_code: z.string().regex(/^[A-Z0-9_:-]{1,128}$/).optional(),
    }).nullable(),
    submitted_at: NullableDateTimeSchema,
    audited_at: NullableDateTimeSchema,
    released_at: NullableDateTimeSchema,
    created_at: DateTimeSchema,
    updated_at: DateTimeSchema,
  }).nullable(),
});

export type TenantDouyinWorkspace = z.infer<
  typeof TenantDouyinWorkspaceSchema
>;
export type TenantDouyinAuthorizationCallbackInput = z.infer<
  typeof TenantDouyinAuthorizationCallbackSchema
>;
export type TenantDouyinAuthorizationState = z.infer<
  typeof TenantDouyinAuthorizationStateSchema
>;
export type TenantDouyinReleaseState = z.infer<
  typeof TenantDouyinReleaseStateSchema
>;
