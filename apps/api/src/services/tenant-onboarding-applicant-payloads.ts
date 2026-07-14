import type {
  TenantOnboardingCreateApplicationInput,
  TenantOnboardingSupplementPatch,
} from "@/repositories/tenant-onboarding";
import type { SubmitTenantOnboardingApplicationInput } from "@/schema/tenant-onboarding";
import type { TenantOnboardingPartnerResolution } from "./tenant-onboarding-region-match";

const REVIEW_HOURS = 48;

export type TenantOnboardingApplicantPatch = TenantOnboardingSupplementPatch & {
  company_location?: SubmitTenantOnboardingApplicationInput["company_location"];
};

export function buildTenantOnboardingCreateRecord(input: {
  input: SubmitTenantOnboardingApplicationInput;
  applicationNumber: string;
  visitorId: string;
  idempotencyKey: string;
  normalizedCreditCode: string;
  phone: string;
  resolution: TenantOnboardingPartnerResolution;
  inviteCodeId: string | null;
  now: Date;
}): TenantOnboardingCreateApplicationInput {
  const selected = input.resolution.selectedPartner;
  const unique = input.resolution.kind === "unique";
  return {
    application_no: input.applicationNumber,
    visitor_id: input.visitorId,
    visitor_context_id: input.input.visitor_context_id,
    company_name: input.input.company_name.trim(),
    unified_social_credit_code: input.normalizedCreditCode,
    business_license_file_id: input.input.business_license_file_id,
    admin_name: input.input.admin_name.trim(),
    admin_phone: input.phone,
    address_province: input.input.company_location.province ?? null,
    address_city: input.input.company_location.city,
    address_district: input.input.company_location.district ?? null,
    address_region_code: input.input.company_location.region_code,
    address: input.input.company_location.address,
    address_latitude: input.input.company_location.latitude ?? null,
    address_longitude: input.input.company_location.longitude ?? null,
    service_region_codes: [...input.input.service_region_codes],
    source_channel: input.input.source_channel,
    invite_code_id: input.inviteCodeId,
    candidate_partner_id: selected?.id ?? null,
    candidate_match_reason: input.resolution.reason,
    candidate_snapshot: selected ? {
      partner_id: selected.id,
      partner_name: selected.name,
      region_codes: [...selected.region_codes],
      match_reason: input.resolution.reason,
    } : {
      partner_ids: [...input.resolution.partnerIds],
      match_reason: input.resolution.reason,
    },
    partner_assist_status: unique ? "pending" : "not_applicable",
    partner_assist_requested_at: unique ? input.now.toISOString() : null,
    partner_assist_due_at: unique
      ? new Date(input.now.getTime() + REVIEW_HOURS * 60 * 60 * 1000).toISOString()
      : null,
    privacy_policy_version: input.input.privacy_policy_version,
    onboarding_terms_version: input.input.onboarding_terms_version,
    consented_at: input.now.toISOString(),
    idempotency_key: input.idempotencyKey,
  };
}

export function buildTenantOnboardingSupplementPatch(
  patch: TenantOnboardingApplicantPatch,
): TenantOnboardingSupplementPatch {
  const result: TenantOnboardingSupplementPatch = {};
  if (patch.company_name !== undefined) result.company_name = patch.company_name.trim();
  if (patch.unified_social_credit_code !== undefined) {
    result.unified_social_credit_code = patch.unified_social_credit_code.trim().toUpperCase();
  }
  if (patch.business_license_file_id !== undefined) {
    result.business_license_file_id = patch.business_license_file_id;
  }
  if (patch.admin_name !== undefined) result.admin_name = patch.admin_name.trim();
  if (patch.service_region_codes !== undefined) {
    result.service_region_codes = [...patch.service_region_codes];
  }
  if (patch.company_location) {
    result.address_province = patch.company_location.province ?? null;
    result.address_city = patch.company_location.city;
    result.address_district = patch.company_location.district ?? null;
    result.address_region_code = patch.company_location.region_code;
    result.address = patch.company_location.address;
    result.address_latitude = patch.company_location.latitude ?? null;
    result.address_longitude = patch.company_location.longitude ?? null;
  }
  return result;
}

export function buildTenantOnboardingCandidateMutation(
  replace: boolean,
  resolution: TenantOnboardingPartnerResolution | null,
  now: Date,
) {
  const selected = resolution?.selectedPartner ?? null;
  const unique = resolution?.kind === "unique";
  return {
    replace,
    partnerId: selected?.id ?? null,
    matchReason: resolution?.reason ?? null,
    snapshot: selected ? {
      partner_id: selected.id,
      partner_name: selected.name,
      region_codes: [...selected.region_codes],
      match_reason: resolution?.reason,
    } : {
      partner_ids: [...(resolution?.partnerIds ?? [])],
      match_reason: resolution?.reason ?? null,
    },
    assistStatus: unique ? "pending" : "not_applicable",
    requestedAt: unique ? now.toISOString() : null,
    dueAt: unique
      ? new Date(now.getTime() + REVIEW_HOURS * 60 * 60 * 1000).toISOString()
      : null,
  };
}

export function haveSameTenantOnboardingRegionSet(
  left: readonly string[],
  right: readonly string[],
) {
  const normalize = (values: readonly string[]) =>
    [...new Set(values.map((value) => value.trim()))].sort();
  const normalizedLeft = normalize(left);
  const normalizedRight = normalize(right);
  return normalizedLeft.length === normalizedRight.length &&
    normalizedLeft.every((value, index) => value === normalizedRight[index]);
}
