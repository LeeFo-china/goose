export type PlatformPartnerStatus =
  | "pending"
  | "active"
  | "suspended"
  | "terminated";

export type PlatformPartnerMemberStatus =
  | "pending_bind"
  | "active"
  | "disabled";

export type PlatformPartnerLevelRecord = {
  id: string;
  code: string;
  name: string;
  status: "active" | "inactive";
  tenant_recharge_commission_bps: number;
  lead_service_fee_commission_bps: number;
  lead_service_fee_default_rate_bps: number;
  settlement_cycle: "monthly";
  settlement_method: "manual";
  requirements: Record<string, unknown>;
  sort_order: number;
  version: number;
  effective_at: string;
  expired_at: string | null;
  created_at: string;
  updated_at: string;
};

export type PlatformPartnerRecord = {
  id: string;
  name: string;
  subject_type: "personal" | "individual_business" | "company";
  contact_name: string;
  phone: string;
  status: PlatformPartnerStatus;
  level_id: string;
  region_codes: string[];
  region_version?: number;
  contract_status: string;
  settlement_account_status: string;
  settlement_account: Record<string, unknown>;
  remark: string | null;
  created_by_employee_id: string | null;
  updated_by_employee_id: string | null;
  created_at: string;
  updated_at: string;
  level?: PlatformPartnerLevelRecord | null;
};

export type PlatformPartnerCreateRecordInput = Omit<
  PlatformPartnerRecord,
  "id" | "created_at" | "updated_at" | "level" | "region_version"
>;

export type PlatformPartnerUpdateRecordInput = Partial<
  Omit<PlatformPartnerCreateRecordInput, "created_by_employee_id">
> & {
  updated_by_employee_id: string;
};

export type PlatformPartnerStatusRecordInput = {
  status: PlatformPartnerStatus;
  updated_by_employee_id: string;
  change_reason: string;
};

export type PlatformPartnerRegionsRecordInput = {
  region_codes: string[];
  expected_version: number;
  updated_by_employee_id: string;
};

export type PlatformPartnerMemberRecord = {
  id: string;
  partner_id: string;
  auth_user_id: string | null;
  name: string;
  phone: string;
  role: "owner" | "operator";
  status: PlatformPartnerMemberStatus;
  remark: string | null;
  created_by_employee_id: string | null;
  updated_by_employee_id: string | null;
  created_at: string;
  updated_at: string;
  partner?: Pick<PlatformPartnerRecord, "id" | "name" | "status"> | null;
};

export type PlatformPartnerMemberCreateRecordInput = {
  partner_id: string;
  name: string;
  phone: string;
  role: "owner" | "operator";
  status: "pending_bind";
  created_by_employee_id: string;
  updated_by_employee_id: string;
};

export type PlatformPartnerMemberStatusRecordInput = {
  status: PlatformPartnerMemberStatus;
  updated_by_employee_id: string;
  remark: string;
};

export type PlatformPartnerInviteCodeRecord = {
  id: string;
  partner_id: string;
  code: string;
  region_code: string | null;
  campaign_code: string | null;
  status: "active" | "disabled" | "expired";
  scan_count: number;
  submitted_count: number;
  approved_count: number;
  expires_at: string | null;
  created_by_employee_id: string | null;
  created_at: string;
  updated_at: string;
};

export type PlatformPartnerInviteCodeWithPartnerRecord =
  PlatformPartnerInviteCodeRecord & {
    partner?: (
      Pick<PlatformPartnerRecord, "id" | "name" | "status" | "region_codes"> & {
        level?: Pick<PlatformPartnerLevelRecord, "code" | "name"> | null;
      }
    ) | null;
  };

export type PlatformPartnerInviteCodeCreateRecordInput = {
  partner_id: string;
  code: string;
  region_code?: string | null;
  campaign_code?: string | null;
  expires_at?: string | null;
  created_by_employee_id: string | null;
};

export type PlatformPartnerInviteCodeCounterDeltaInput = {
  inviteCodeId: string;
  scan_count?: number;
  submitted_count?: number;
  approved_count?: number;
};

export type TenantPartnerBindingRecord = {
  id: string;
  tenant_id: string;
  partner_id: string;
  invite_code_id: string | null;
  source_type: "invite_code" | "manual" | "lead_source";
  source_id: string | null;
  status: "active" | "pending_transfer" | "ended";
  bound_at: string;
  unbound_at: string | null;
  changed_by_employee_id: string | null;
  change_reason: string | null;
  created_at: string;
  updated_at: string;
  partner?: Pick<PlatformPartnerRecord, "id" | "name" | "status"> | null;
  tenant?: { id: string; name: string | null; slug: string | null } | null;
};

export type TenantPartnerBindingCreateRecordInput = {
  tenant_id: string;
  partner_id: string;
  invite_code_id?: string | null;
  source_type: "invite_code" | "manual" | "lead_source";
  source_id?: string | null;
  changed_by_employee_id: string | null;
  change_reason: string;
};
