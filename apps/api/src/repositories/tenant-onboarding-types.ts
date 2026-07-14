import type {
  TenantOnboardingApplicationStatus,
  TenantOnboardingPartnerAssistStatus,
  TenantOnboardingSourceChannel,
  TenantServiceProviderProfileStatus,
} from "@/schema/tenant-onboarding";
import type { AdministrativeAreaRecord } from "@/repositories/administrative-areas";
import type { Json } from "@/types/database";

export type TenantOnboardingAdministrativeAreaRecord = Pick<
  AdministrativeAreaRecord,
  "adcode" | "level" | "parent_adcode"
>;

export type TenantOnboardingPartnerBrief = {
  id: string;
  name: string;
  status: "pending" | "active" | "suspended" | "terminated";
  region_codes: string[];
};

export type TenantOnboardingPartnerOverlapQuery = {
  region_codes: readonly string[];
  limit: 100;
};

export type TenantOnboardingPartnerOverlapResult = {
  partners: readonly TenantOnboardingPartnerBrief[];
  truncated: boolean;
};

export type TenantOnboardingApplicationRecord = {
  id: string;
  application_no: string;
  visitor_id: string;
  visitor_context_id: string | null;
  company_name: string;
  unified_social_credit_code: string;
  business_license_file_id: string;
  admin_name: string;
  admin_phone: string;
  address_province: string | null;
  address_city: string;
  address_district: string | null;
  address_region_code: string;
  address: string;
  address_latitude: number | null;
  address_longitude: number | null;
  service_region_codes: string[];
  source_channel: TenantOnboardingSourceChannel;
  invite_code_id: string | null;
  candidate_partner_id: string | null;
  candidate_match_reason: string | null;
  candidate_snapshot: Json;
  final_partner_id: string | null;
  attribution_source_type: string | null;
  status: TenantOnboardingApplicationStatus;
  partner_assist_status: TenantOnboardingPartnerAssistStatus;
  partner_assist_requested_at: string | null;
  partner_assist_due_at: string | null;
  version: number;
  converted_tenant_id: string | null;
  reviewed_by_employee_id: string | null;
  reviewed_at: string | null;
  review_remark: string | null;
  privacy_policy_version: string;
  onboarding_terms_version: string;
  consented_at: string;
  idempotency_key: string;
  withdrawn_at: string | null;
  created_at: string;
  updated_at: string;
  candidate_partner?: TenantOnboardingPartnerBrief | null;
  final_partner?: TenantOnboardingPartnerBrief | null;
};

export type TenantOnboardingApplicationSummaryRecord = Pick<
  TenantOnboardingApplicationRecord,
  | "id"
  | "application_no"
  | "company_name"
  | "status"
  | "partner_assist_status"
  | "version"
  | "created_at"
  | "updated_at"
>;

export type TenantOnboardingApplicationReviewRecord = {
  id: string;
  application_id: string;
  review_stage: "applicant" | "partner_assist" | "platform_review" | "system";
  decision: string;
  actor_type: "visitor" | "partner_member" | "platform_employee" | "system";
  actor_visitor_id: string | null;
  actor_employee_id: string | null;
  actor_partner_member_id: string | null;
  before_status: TenantOnboardingApplicationStatus | null;
  after_status: TenantOnboardingApplicationStatus | null;
  before_partner_assist_status: TenantOnboardingPartnerAssistStatus | null;
  after_partner_assist_status: TenantOnboardingPartnerAssistStatus | null;
  required_fields: string[];
  remark: string | null;
  metadata: Json;
  created_at: string;
};

export type TenantServiceProviderProfileRecord = {
  id: string;
  tenant_id: string;
  public_name: string | null;
  introduction: string | null;
  public_phone: string | null;
  address_province: string | null;
  address_city: string | null;
  address_district: string | null;
  address_region_code: string | null;
  address: string | null;
  address_latitude: number | null;
  address_longitude: number | null;
  status: TenantServiceProviderProfileStatus;
  version: number;
  submitted_at: string | null;
  reviewed_by_employee_id: string | null;
  reviewed_at: string | null;
  review_remark: string | null;
  published_at: string | null;
  suspended_at: string | null;
  created_at: string;
  updated_at: string;
};

export type TenantOnboardingNotificationEventType =
  | "submitted"
  | "supplement_required"
  | "approved"
  | "rejected";

export type TenantOnboardingNotificationDeliveryRecord = {
  id: string;
  application_id: string;
  application_version: number;
  event_type: TenantOnboardingNotificationEventType;
  channel: "sms";
  status: "pending" | "processing" | "sent" | "failed";
  attempt_count: number;
  last_error: string | null;
  sent_at: string | null;
  claim_token: string | null;
  claim_expires_at: string | null;
  created_at: string;
  updated_at: string;
};

export type TenantOnboardingNotificationDeliverySummaryRecord = Omit<
  TenantOnboardingNotificationDeliveryRecord,
  "claim_token" | "claim_expires_at"
>;

export type TenantOnboardingPagination = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export type TenantOnboardingPageResult<RecordType> = {
  list: RecordType[];
  pagination: TenantOnboardingPagination;
};

export type TenantOnboardingInitializationRecord = {
  template_code: string;
  template_version: string;
  departments_count: number;
  posts_count: number;
  roles_count: number;
  admin_employee_id: string;
  admin_role_id: string;
};

export type ApproveTenantOnboardingRpcInput = {
  applicationId: string;
  expectedVersion: number;
  reviewerEmployeeId: string;
  tenantSlug: string;
  finalPartnerId: string | null;
  attributionSourceType: "invite_code" | "region_auto_assignment" | "platform_manual" | null;
  reviewRemark: string | null;
};

export type TenantOnboardingApprovalRpcErrorStatus =
  | "application_not_found"
  | "application_state_conflict"
  | "application_version_conflict"
  | "subject_exists"
  | "admin_phone_exists"
  | "partner_ambiguous"
  | "partner_unavailable";

export type TenantOnboardingApprovalRpcResult =
  | {
      status: "approved";
      application_id: string;
      tenant_id: string;
      binding_id: string | null;
      profile_id: string;
      initialization: TenantOnboardingInitializationRecord;
      idempotent: boolean;
    }
  | {
      status: TenantOnboardingApprovalRpcErrorStatus;
    };

export type TenantOnboardingPlatformApplicationListRecord = Pick<
  TenantOnboardingApplicationRecord,
  | "id"
  | "application_no"
  | "company_name"
  | "admin_name"
  | "address_city"
  | "address_district"
  | "address_region_code"
  | "service_region_codes"
  | "source_channel"
  | "candidate_partner_id"
  | "candidate_match_reason"
  | "status"
  | "partner_assist_status"
  | "partner_assist_due_at"
  | "version"
  | "created_at"
  | "updated_at"
> & {
  candidate_partner?: TenantOnboardingPartnerBrief | null;
  final_partner?: TenantOnboardingPartnerBrief | null;
};

export type TenantOnboardingPlatformApplicationRecord =
  TenantOnboardingPlatformApplicationListRecord & Pick<
    TenantOnboardingApplicationRecord,
    | "unified_social_credit_code"
    | "business_license_file_id"
    | "admin_phone"
    | "address_province"
    | "address"
    | "address_latitude"
    | "address_longitude"
    | "invite_code_id"
    | "candidate_snapshot"
    | "final_partner_id"
    | "attribution_source_type"
    | "partner_assist_requested_at"
    | "converted_tenant_id"
    | "reviewed_by_employee_id"
    | "reviewed_at"
    | "review_remark"
    | "privacy_policy_version"
    | "onboarding_terms_version"
    | "consented_at"
    | "withdrawn_at"
  >;

export type TenantOnboardingPlatformReviewMutationErrorStatus =
  | "application_not_found"
  | "state_conflict"
  | "version_conflict"
  | "partner_unavailable";

export type TenantOnboardingPlatformReviewMutationRpcResult =
  | {
      status: "updated";
      application_id: string;
      application_version: number;
      application: TenantOnboardingPlatformApplicationRecord;
      idempotent: boolean;
    }
  | { status: TenantOnboardingPlatformReviewMutationErrorStatus };

export type TenantOnboardingPlatformReviewMutationResult =
  | {
      status: "updated";
      application: TenantOnboardingPlatformApplicationRecord;
      idempotent: boolean;
    }
  | { status: TenantOnboardingPlatformReviewMutationErrorStatus };

export type TenantOnboardingLicenseAccessRecord = {
  application_id: string;
  visitor_id: string;
  business_license_file_id: string;
  file: {
    id: string;
    owner_type: string;
    owner_visitor_id: string | null;
    scene: string;
    provider: string;
    object_key: string;
    visibility: string;
    public_url: string | null;
    status: string;
    deleted_at: string | null;
  } | null;
};
