import type {
  PlatformPartnerInviteCodeRecord,
  PlatformPartnerLevelRecord,
  PlatformPartnerMemberRecord,
  PlatformPartnerRecord,
  TenantPartnerBindingRecord,
} from "@/repositories/platform-partners";
import type { AuthContext } from "@/services/authorization";

export const platformAuthContext = {
  authUserId: "auth-platform",
  employeeId: "employee-platform",
  tenantId: null,
  tenantName: null,
  tenantSlug: null,
  tenantStatus: null,
  isPlatformAdmin: true,
  employeeName: "平台超管",
  employeeStatus: "active",
  departmentId: null,
  tenantDepartmentId: null,
  departmentCode: null,
  departmentName: null,
  postId: null,
  postName: null,
  avatar: null,
  roleCodes: ["platform_admin"],
  roles: [],
  permissions: [
    { code: "platform.partner.manage", scope: "all" },
    { code: "platform.partner.binding.manage", scope: "all" },
  ],
} satisfies AuthContext;

export const tenantAuthContext = {
  ...platformAuthContext,
  isPlatformAdmin: false,
  roleCodes: [],
  permissions: [],
} satisfies AuthContext;

export const level = {
  id: "00000000-0000-4000-8000-000000000101",
  code: "city_partner",
  name: "城市合伙人",
  status: "active",
  tenant_recharge_commission_bps: 1500,
  lead_service_fee_commission_bps: 3500,
  lead_service_fee_default_rate_bps: 250,
  settlement_cycle: "monthly",
  settlement_method: "manual",
  requirements: {},
  sort_order: 20,
  version: 1,
  effective_at: "2026-07-04T10:00:00.000Z",
  expired_at: null,
  created_at: "2026-07-04T10:00:00.000Z",
  updated_at: "2026-07-04T10:00:00.000Z",
} satisfies PlatformPartnerLevelRecord;

export const activePartner = {
  id: "00000000-0000-4000-8000-000000000201",
  name: "信阳城市合伙人",
  subject_type: "company",
  contact_name: "张三",
  phone: "13800138000",
  status: "active",
  level_id: level.id,
  region_codes: ["411500"],
  region_version: 1,
  contract_status: "signed",
  settlement_account_status: "valid",
  settlement_account: {},
  remark: null,
  created_by_employee_id: "employee-platform",
  updated_by_employee_id: "employee-platform",
  created_at: "2026-07-04T10:00:00.000Z",
  updated_at: "2026-07-04T10:00:00.000Z",
  level,
} satisfies PlatformPartnerRecord;

export const suspendedPartner = {
  ...activePartner,
  status: "suspended",
} satisfies PlatformPartnerRecord;

export const existingBinding = {
  id: "00000000-0000-4000-8000-000000000402",
  tenant_id: "00000000-0000-4000-8000-000000000501",
  partner_id: activePartner.id,
  invite_code_id: null,
  source_type: "manual",
  source_id: null,
  status: "active",
  bound_at: "2026-07-04T10:00:00.000Z",
  unbound_at: null,
  changed_by_employee_id: "employee-platform",
  change_reason: "平台招商绑定",
  created_at: "2026-07-04T10:00:00.000Z",
  updated_at: "2026-07-04T10:00:00.000Z",
} satisfies TenantPartnerBindingRecord;

export const otherPartnerBinding = {
  ...existingBinding,
  partner_id: "00000000-0000-4000-8000-000000000202",
} satisfies TenantPartnerBindingRecord;

export const createdBinding = {
  ...existingBinding,
  id: "00000000-0000-4000-8000-000000000401",
} satisfies TenantPartnerBindingRecord;

export const inviteCode = {
  id: "00000000-0000-4000-8000-000000000301",
  partner_id: activePartner.id,
  code: "CP-411500-0001",
  region_code: "411500",
  campaign_code: null,
  status: "active",
  scan_count: 0,
  submitted_count: 0,
  approved_count: 0,
  expires_at: null,
  created_by_employee_id: "employee-platform",
  created_at: "2026-07-04T10:00:00.000Z",
  updated_at: "2026-07-04T10:00:00.000Z",
} satisfies PlatformPartnerInviteCodeRecord;

export const pendingPartner = {
  ...activePartner,
  status: "pending",
} satisfies PlatformPartnerRecord;

export const disabledPartner = {
  ...activePartner,
  status: "terminated",
} satisfies PlatformPartnerRecord;

export const partnerMember = {
  id: "00000000-0000-4000-8000-000000000601",
  partner_id: activePartner.id,
  auth_user_id: null,
  name: "李四",
  phone: "13900139000",
  role: "owner",
  status: "pending_bind",
  remark: null,
  created_by_employee_id: "employee-platform",
  updated_by_employee_id: "employee-platform",
  created_at: "2026-07-05T10:00:00.000Z",
  updated_at: "2026-07-05T10:00:00.000Z",
  partner: {
    id: activePartner.id,
    name: activePartner.name,
    status: activePartner.status,
  },
} satisfies PlatformPartnerMemberRecord;

export const boundDisabledPartnerMember = {
  ...partnerMember,
  status: "disabled",
  remark: "离职停用",
  auth_user_id: "00000000-0000-4000-8000-000000000701",
} satisfies PlatformPartnerMemberRecord;

export const memberCreateInput = {
  name: "李四",
  phone: "13900139000",
  role: "operator",
} as const;

export const memberCreatePayload = {
  partner_id: activePartner.id,
  ...memberCreateInput,
  status: "pending_bind",
  created_by_employee_id: "employee-platform",
  updated_by_employee_id: "employee-platform",
} as const;

export const tenantEmployeeAuthContext = {
  ...tenantAuthContext,
  authUserId: "auth-tenant",
  employeeId: "employee-tenant-admin",
  tenantId: existingBinding.tenant_id,
  tenantName: "晴天装饰",
  tenantSlug: "qingtian",
  tenantStatus: "active",
} satisfies AuthContext;
