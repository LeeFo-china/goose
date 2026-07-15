export type TenantOnboardingApplicationStatus =
  | "submitted"
  | "reviewing"
  | "supplement_required"
  | "approved"
  | "rejected"
  | "withdrawn";

export type TenantOnboardingPartnerAssistStatus =
  | "not_applicable"
  | "pending"
  | "verified"
  | "supplement_suggested"
  | "not_recommended"
  | "expired";

export type ServiceProviderPublicationStatus =
  | "draft"
  | "pending_review"
  | "published"
  | "suspended";

export type Pagination = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export type ListData<RecordType> = {
  list: RecordType[];
  pagination: Pagination;
};

export type TenantOnboardingPartnerBrief = {
  id: string;
  name: string;
  status: "pending" | "active" | "suspended" | "terminated";
  region_codes: string[];
};

export type TenantOnboardingApplicationListRecord = {
  id: string;
  application_no: string;
  company_name: string;
  admin_name: string;
  address_city: string;
  address_district: string | null;
  address_region_code: string;
  service_region_codes: string[];
  source_channel: "local_services" | "partner_invite";
  candidate_partner_id: string | null;
  candidate_match_reason: string | null;
  status: TenantOnboardingApplicationStatus;
  partner_assist_status: TenantOnboardingPartnerAssistStatus;
  partner_assist_due_at: string | null;
  version: number;
  created_at: string;
  updated_at: string;
  candidate_partner?: TenantOnboardingPartnerBrief | null;
  final_partner?: TenantOnboardingPartnerBrief | null;
};

export type TenantOnboardingApplicationDetail =
  TenantOnboardingApplicationListRecord & {
    unified_social_credit_code: string;
    business_license_file_id: string;
    admin_phone: string;
    address_province: string | null;
    address: string;
    address_latitude: number | null;
    address_longitude: number | null;
    invite_code_id: string | null;
    candidate_snapshot: unknown;
    final_partner_id: string | null;
    attribution_source_type: string | null;
    partner_assist_requested_at: string | null;
    converted_tenant_id: string | null;
    reviewed_by_employee_id: string | null;
    reviewed_at: string | null;
    review_remark: string | null;
    privacy_policy_version: string;
    onboarding_terms_version: string;
    consented_at: string;
    withdrawn_at: string | null;
  };

export type TenantOnboardingReviewRecord = {
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
  metadata: unknown;
  created_at: string;
};

export type TenantOnboardingNotificationRecord = {
  id: string;
  application_id: string;
  application_version: number;
  event_type: "submitted" | "supplement_required" | "approved" | "rejected";
  channel: "sms";
  status: "pending" | "processing" | "sent" | "failed";
  attempt_count: number;
  last_error: string | null;
  sent_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ServiceProviderPublicationListRecord = {
  tenant_id: string;
  tenant_name: string;
  public_name: string | null;
  public_phone: string | null;
  address_city: string | null;
  address_district: string | null;
  status: ServiceProviderPublicationStatus;
  version: number;
  submitted_at: string | null;
  updated_at: string;
  area_count: number;
};

export type ServiceProviderProfile = {
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
  status: ServiceProviderPublicationStatus;
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

export type ServiceProviderArea = {
  id: string;
  tenant_id: string;
  province: string | null;
  city: string;
  district: string | null;
  adcode: string;
  center_latitude: number | null;
  center_longitude: number | null;
  service_radius_km: number | null;
  priority: number;
  status: "active" | "inactive";
  created_at: string;
  updated_at: string;
};

export type BadgeVariant =
  | "default"
  | "secondary"
  | "danger"
  | "outline"
  | "success"
  | "warning";

export const applicationStatusMeta: Record<
  TenantOnboardingApplicationStatus,
  { label: string; variant: BadgeVariant }
> = {
  submitted: { label: "待审核", variant: "warning" },
  reviewing: { label: "审核中", variant: "secondary" },
  supplement_required: { label: "待补充", variant: "warning" },
  approved: { label: "已通过", variant: "success" },
  rejected: { label: "已拒绝", variant: "danger" },
  withdrawn: { label: "已撤回", variant: "outline" },
};

export const assistStatusMeta: Record<
  TenantOnboardingPartnerAssistStatus,
  { label: string; variant: BadgeVariant }
> = {
  not_applicable: { label: "无需协查", variant: "outline" },
  pending: { label: "协查中", variant: "warning" },
  verified: { label: "已核验", variant: "success" },
  supplement_suggested: { label: "建议补充", variant: "warning" },
  not_recommended: { label: "不建议入驻", variant: "danger" },
  expired: { label: "协查已过期", variant: "outline" },
};

export const publicationStatusMeta: Record<
  ServiceProviderPublicationStatus,
  { label: string; variant: BadgeVariant }
> = {
  draft: { label: "草稿", variant: "outline" },
  pending_review: { label: "待发布审核", variant: "warning" },
  published: { label: "展示中", variant: "success" },
  suspended: { label: "已暂停", variant: "danger" },
};

export const reviewStageLabels: Record<TenantOnboardingReviewRecord["review_stage"], string> = {
  applicant: "申请人操作",
  partner_assist: "合伙人协查",
  platform_review: "平台审核",
  system: "系统处理",
};

export const reviewDecisionLabels: Record<string, string> = {
  submit: "提交申请",
  start_review: "进入平台复核",
  request_partner_assist: "发起合伙人协查",
  request_supplement: "要求补充资料",
  approve: "通过入驻",
  reject: "拒绝入驻",
  withdraw: "撤回申请",
  verify: "协查通过",
  suggest_supplement: "建议补充资料",
  not_recommend: "不建议入驻",
  expire: "协查过期",
};

export const notificationStatusMeta: Record<
  TenantOnboardingNotificationRecord["status"],
  { label: string; variant: BadgeVariant }
> = {
  pending: { label: "待发送", variant: "warning" },
  processing: { label: "发送中", variant: "warning" },
  sent: { label: "已发送", variant: "success" },
  failed: { label: "发送失败", variant: "danger" },
};

export const notificationEventLabels: Record<
  TenantOnboardingNotificationRecord["event_type"],
  string
> = {
  submitted: "申请已提交",
  supplement_required: "需要补充资料",
  approved: "入驻已通过",
  rejected: "入驻未通过",
};

export function formatDateTime(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

export function formatRegion(input: {
  address_city?: string | null;
  address_district?: string | null;
}) {
  return [input.address_city, input.address_district].filter(Boolean).join(" ") || "-";
}
