import { Errors } from "@/errors/error-factory";
import type {
  TenantOnboardingApplicationReviewRecord,
  TenantOnboardingLicenseAccessRecord,
  TenantOnboardingPlatformApplicationListRecord,
  TenantOnboardingPlatformApplicationRecord,
  TenantOnboardingPlatformReviewMutationRpcResult,
} from "@/repositories/tenant-onboarding-types";
import {
  TenantOnboardingApplicationStatusSchema,
  TenantOnboardingPartnerAssistStatusSchema,
  TenantOnboardingSourceChannelSchema,
} from "@/schema/tenant-onboarding";
import { z } from "zod";

const NullableStringSchema = z.string().nullable();
const PartnerBriefSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  status: z.enum(["pending", "active", "suspended", "terminated"]),
  region_codes: z.array(z.string()),
}).strict();
const ListRecordSchema = z.object({
  id: z.uuid(),
  application_no: z.string(),
  company_name: z.string(),
  admin_name: z.string(),
  address_city: z.string(),
  address_district: NullableStringSchema,
  address_region_code: z.string(),
  service_region_codes: z.array(z.string()),
  source_channel: TenantOnboardingSourceChannelSchema,
  candidate_partner_id: z.uuid().nullable(),
  candidate_match_reason: NullableStringSchema,
  status: TenantOnboardingApplicationStatusSchema,
  partner_assist_status: TenantOnboardingPartnerAssistStatusSchema,
  partner_assist_due_at: NullableStringSchema,
  version: z.number().int().positive(),
  created_at: z.string(),
  updated_at: z.string(),
  candidate_partner: PartnerBriefSchema.nullable(),
  final_partner: PartnerBriefSchema.nullable(),
}).strict();

const DetailRecordSchema = ListRecordSchema.extend({
  unified_social_credit_code: z.string(),
  business_license_file_id: z.uuid(),
  admin_phone: z.string(),
  address_province: NullableStringSchema,
  address: z.string(),
  address_latitude: z.number().nullable(),
  address_longitude: z.number().nullable(),
  invite_code_id: z.uuid().nullable(),
  candidate_snapshot: z.json(),
  final_partner_id: z.uuid().nullable(),
  attribution_source_type: NullableStringSchema,
  partner_assist_requested_at: NullableStringSchema,
  converted_tenant_id: z.uuid().nullable(),
  reviewed_by_employee_id: z.uuid().nullable(),
  reviewed_at: NullableStringSchema,
  review_remark: NullableStringSchema,
  privacy_policy_version: z.string(),
  onboarding_terms_version: z.string(),
  consented_at: z.string(),
  withdrawn_at: NullableStringSchema,
}).strict();
const MutationApplicationSchema = DetailRecordSchema.omit({
  candidate_partner: true,
  final_partner: true,
});

const ReviewSchema = z.object({
  id: z.uuid(),
  application_id: z.uuid(),
  review_stage: z.enum(["applicant", "partner_assist", "platform_review", "system"]),
  decision: z.string(),
  actor_type: z.enum(["visitor", "partner_member", "platform_employee", "system"]),
  actor_visitor_id: NullableStringSchema,
  actor_employee_id: z.uuid().nullable(),
  actor_partner_member_id: z.uuid().nullable(),
  before_status: TenantOnboardingApplicationStatusSchema.nullable(),
  after_status: TenantOnboardingApplicationStatusSchema.nullable(),
  before_partner_assist_status: TenantOnboardingPartnerAssistStatusSchema.nullable(),
  after_partner_assist_status: TenantOnboardingPartnerAssistStatusSchema.nullable(),
  required_fields: z.array(z.string()),
  remark: NullableStringSchema,
  metadata: z.json(),
  created_at: z.string(),
}).strict();

const MutationResultSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("updated"),
    application_id: z.uuid(),
    application_version: z.number().int().positive(),
    application: MutationApplicationSchema,
    idempotent: z.boolean(),
  }).strict(),
  z.object({
    status: z.enum([
      "application_not_found",
      "state_conflict",
      "version_conflict",
      "partner_unavailable",
    ]),
  }).strict(),
]).refine(
  (result) =>
    result.status !== "updated" || (
      result.application.id === result.application_id &&
      result.application.version === result.application_version
    ),
  { message: "mutation application snapshot does not match result metadata" },
);

const LicenseAccessSchema = z.object({
  application_id: z.uuid(),
  visitor_id: z.string(),
  business_license_file_id: z.uuid(),
  file: z.object({
    id: z.uuid(),
    owner_type: z.string(),
    owner_visitor_id: NullableStringSchema,
    scene: z.string(),
    provider: z.string(),
    object_key: z.string(),
    visibility: z.string(),
    public_url: NullableStringSchema,
    status: z.string(),
    deleted_at: NullableStringSchema,
  }).strict().nullable(),
}).strict();

function parse<Output>(schema: z.ZodType<Output>, data: unknown, message: string) {
  const result = schema.safeParse(data);
  if (result.success) return result.data;
  throw Errors.dbError(message, {
    message: "tenant onboarding review repository returned invalid data",
    issues: result.error.issues,
  });
}

export const parsePlatformApplicationList = (
  data: unknown,
): TenantOnboardingPlatformApplicationListRecord[] =>
  parse(z.array(ListRecordSchema), data, "查询平台装企入驻申请失败");

export const parseNullablePlatformApplication = (
  data: unknown,
): TenantOnboardingPlatformApplicationRecord | null => data === null
  ? null
  : parse(DetailRecordSchema, data, "查询平台装企入驻申请详情失败");

export const parsePlatformApplicationReviews = (
  data: unknown,
): TenantOnboardingApplicationReviewRecord[] =>
  parse(z.array(ReviewSchema), data, "查询装企入驻审核记录失败");

export const parsePlatformReviewMutation = (
  data: unknown,
): TenantOnboardingPlatformReviewMutationRpcResult =>
  parse(MutationResultSchema, data, "更新平台装企入驻审核失败");

export const parseNullableLicenseAccess = (
  data: unknown,
): TenantOnboardingLicenseAccessRecord | null => data === null
  ? null
  : parse(LicenseAccessSchema, data, "查询装企入驻营业执照失败");
