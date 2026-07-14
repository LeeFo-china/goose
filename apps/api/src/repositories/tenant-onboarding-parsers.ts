import { Errors } from "@/errors/error-factory";
import type {
  TenantOnboardingAdministrativeAreaRecord,
  TenantOnboardingApplicationRecord,
  TenantOnboardingApplicationSummaryRecord,
  TenantOnboardingNotificationDeliveryRecord,
  TenantOnboardingPartnerBrief,
} from "@/repositories/tenant-onboarding-types";
import {
  TenantOnboardingApplicationStatusSchema,
  TenantOnboardingPartnerAssistStatusSchema,
  TenantOnboardingSourceChannelSchema,
} from "@/schema/tenant-onboarding";
import { z } from "zod";

const NullableStringSchema = z.string().nullable();
const PartnerSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  status: z.enum(["pending", "active", "suspended", "terminated"]),
  region_codes: z.array(z.string()),
}).strict();

const ApplicationSchema = z.object({
  id: z.uuid(),
  application_no: z.string(),
  visitor_id: z.string(),
  visitor_context_id: z.uuid().nullable(),
  company_name: z.string(),
  unified_social_credit_code: z.string(),
  business_license_file_id: z.uuid(),
  admin_name: z.string(),
  admin_phone: z.string(),
  address_province: NullableStringSchema,
  address_city: z.string(),
  address_district: NullableStringSchema,
  address_region_code: z.string(),
  address: z.string(),
  address_latitude: z.number().nullable(),
  address_longitude: z.number().nullable(),
  service_region_codes: z.array(z.string()),
  source_channel: TenantOnboardingSourceChannelSchema,
  invite_code_id: z.uuid().nullable(),
  candidate_partner_id: z.uuid().nullable(),
  candidate_match_reason: NullableStringSchema,
  candidate_snapshot: z.json(),
  final_partner_id: z.uuid().nullable(),
  attribution_source_type: NullableStringSchema,
  status: TenantOnboardingApplicationStatusSchema,
  partner_assist_status: TenantOnboardingPartnerAssistStatusSchema,
  partner_assist_requested_at: NullableStringSchema,
  partner_assist_due_at: NullableStringSchema,
  version: z.number().int(),
  converted_tenant_id: z.uuid().nullable(),
  reviewed_by_employee_id: z.uuid().nullable(),
  reviewed_at: NullableStringSchema,
  review_remark: NullableStringSchema,
  privacy_policy_version: z.string(),
  onboarding_terms_version: z.string(),
  consented_at: z.string(),
  idempotency_key: z.string(),
  withdrawn_at: NullableStringSchema,
  created_at: z.string(),
  updated_at: z.string(),
}).strict();

const ApplicationSummarySchema = z.object({
  id: z.uuid(),
  application_no: z.string(),
  company_name: z.string(),
  status: TenantOnboardingApplicationStatusSchema,
  partner_assist_status: TenantOnboardingPartnerAssistStatusSchema,
  version: z.number().int(),
  created_at: z.string(),
  updated_at: z.string(),
}).strict();

const NotificationDeliverySchema = z.object({
  id: z.uuid(),
  application_id: z.uuid(),
  application_version: z.number().int(),
  event_type: z.enum(["submitted", "supplement_required", "approved", "rejected"]),
  channel: z.literal("sms"),
  status: z.enum(["pending", "processing", "sent", "failed"]),
  attempt_count: z.number().int().nonnegative(),
  last_error: NullableStringSchema,
  sent_at: NullableStringSchema,
  claim_token: z.uuid().nullable(),
  claim_expires_at: NullableStringSchema,
  created_at: z.string(),
  updated_at: z.string(),
}).strict();

const RecipientRowSchema = z.object({
  id: z.uuid(),
  application_no: z.string(),
  company_name: z.string(),
  admin_phone: z.string(),
}).strict();

const LocationContextSchema = z.object({
  id: z.uuid(),
  visitor_id: NullableStringSchema,
}).strict();

const BusinessFileSchema = z.object({
  id: z.uuid(),
  owner_type: z.string(),
  owner_visitor_id: NullableStringSchema,
  scene: z.string(),
  status: z.string(),
  visibility: z.string(),
  public_url: NullableStringSchema,
  deleted_at: NullableStringSchema,
}).strict();

const AdministrativeAreaSchema = z.object({
  adcode: z.string(),
  level: z.enum(["province", "city", "district"]),
  parent_adcode: NullableStringSchema,
}).strict();

const NestedInviteSchema = z.object({
  id: z.uuid(),
  code: z.string(),
  partner_id: z.uuid(),
  expires_at: NullableStringSchema,
  partner: PartnerSchema.nullable(),
}).strict();

const ActiveInviteSchema = z.object({
  id: z.uuid(),
  code: z.string(),
  partner_id: z.uuid(),
  expires_at: NullableStringSchema,
}).strict();

const MutationSchema = z.object({ application_id: z.uuid() }).strict();
const SubmitMutationSchema = MutationSchema.extend({ created: z.boolean() }).strict();

function parse<T>(schema: z.ZodType<T>, data: unknown, message: string): T {
  const result = schema.safeParse(data);
  if (result.success) return result.data;
  throw Errors.dbError(message, {
    message: "tenant onboarding repository returned invalid data",
    issues: result.error.issues,
  });
}

export const parseTenantOnboardingApplication = (
  data: unknown,
  message: string,
): TenantOnboardingApplicationRecord => parse(ApplicationSchema, data, message);

export const parseNullableTenantOnboardingApplication = (
  data: unknown,
  message: string,
) => data === null ? null : parseTenantOnboardingApplication(data, message);

export const parseTenantOnboardingApplicationSummaries = (
  data: unknown,
  message: string,
): TenantOnboardingApplicationSummaryRecord[] =>
  parse(z.array(ApplicationSummarySchema), data, message);

export const parseTenantOnboardingNotificationDelivery = (
  data: unknown,
  message: string,
): TenantOnboardingNotificationDeliveryRecord =>
  parse(NotificationDeliverySchema, data, message);

export const parseNullableTenantOnboardingNotificationDelivery = (
  data: unknown,
  message: string,
) => data === null ? null : parseTenantOnboardingNotificationDelivery(data, message);

export const parseTenantOnboardingNotificationRpcResult = (
  data: unknown,
  message: string,
) => {
  const rows = parse(z.array(NotificationDeliverySchema).max(1), data, message);
  return rows[0] ?? null;
};

export const parseTenantOnboardingRecipientRow = (data: unknown, message: string) =>
  data === null ? null : parse(RecipientRowSchema, data, message);

export const parseTenantOnboardingLocationContext = (data: unknown, message: string) =>
  data === null ? null : parse(LocationContextSchema, data, message);

export const parseTenantOnboardingBusinessFile = (data: unknown, message: string) =>
  data === null ? null : parse(BusinessFileSchema, data, message);

export const parseTenantOnboardingAdministrativeAreas = (
  data: unknown,
  message: string,
): TenantOnboardingAdministrativeAreaRecord[] =>
  parse(z.array(AdministrativeAreaSchema), data, message);

export const parseTenantOnboardingPartners = (
  data: unknown,
  message: string,
): TenantOnboardingPartnerBrief[] => parse(z.array(PartnerSchema), data, message);

export const parseTenantOnboardingNestedInvite = (data: unknown, message: string) =>
  data === null ? null : parse(NestedInviteSchema, data, message);

export const parseTenantOnboardingActiveInvite = (data: unknown, message: string) =>
  data === null ? null : parse(ActiveInviteSchema, data, message);

export const parseTenantOnboardingSubmitMutation = (data: unknown, message: string) => {
  const rows = parse(z.array(SubmitMutationSchema).length(1), data, message);
  const row = rows[0];
  if (row) return row;
  throw Errors.dbError(message, {
    message: "tenant onboarding submit RPC returned no rows",
  });
};

export const parseTenantOnboardingMutation = (data: unknown, message: string) => {
  const rows = parse(z.array(MutationSchema).max(1), data, message);
  return rows[0] ?? null;
};
