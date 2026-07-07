import type {
  PartnerCommissionLedgerRecord,
  PartnerCommissionLedgerStatus,
  PartnerSettlementBatchRecord,
  PartnerSettlementBatchStatus,
  PlatformPartnerRevenueType,
  PlatformRevenueEventRecord,
  PlatformRevenueEventStatus,
} from "@/repositories/platform-partner-revenue";
import type {
  PlatformPartnerInviteCodeRecord,
  PlatformPartnerLevelRecord,
  PlatformPartnerRecord as BasePlatformPartnerRecord,
  TenantPartnerBindingRecord,
} from "@/repositories/platform-partners";

export type PlatformPartnerRecord = Pick<
  BasePlatformPartnerRecord,
  "id" | "name" | "status" | "region_codes"
> & {
  level?: Pick<PlatformPartnerLevelRecord, "id" | "code" | "name" | "status"> | null;
};

export type PlatformPartnerMemberStatus = "pending_bind" | "active" | "disabled";
export type PlatformPartnerMemberRole = "owner" | "operator";

export type PlatformPartnerMemberRecord = {
  id: string;
  partner_id: string;
  auth_user_id: string | null;
  name: string;
  phone: string;
  role: PlatformPartnerMemberRole;
  status: PlatformPartnerMemberStatus;
  partner?: PlatformPartnerRecord | null;
};

export interface PlatformPartnerPortalRepositoryPort {
  findMemberByAuthUserId(authUserId: string): Promise<PlatformPartnerMemberRecord | null>;
  findMemberById(memberId: string): Promise<PlatformPartnerMemberRecord | null>;
  findBindableMemberByPhone(phone: string): Promise<PlatformPartnerMemberRecord | null>;
  claimMemberBinding(input: { phone: string; code: string; authUserId: string }): Promise<PlatformPartnerMemberBindingClaimResult>;
  claimMemberUnbind(input: { memberId: string; authUserId: string; partnerId: string; code: string }): Promise<PlatformPartnerMemberUnbindClaimResult>;
  bindMemberAuthUser(memberId: string, authUserId: string): Promise<PlatformPartnerMemberRecord>;
  findPartnerById(partnerId: string): Promise<PlatformPartnerRecord | null>;
  listInviteCodes(partnerId: string): Promise<PlatformPartnerInviteCodeRecord[]>;
  listTenantBindings(input: PartnerTenantBindingListInput): Promise<PageResult<TenantPartnerBindingRecord>>;
  listRevenueEvents(input: PartnerRevenueEventListInput): Promise<PageResult<PlatformRevenueEventRecord>>;
  listCommissionLedgers(input: PartnerCommissionLedgerListInput): Promise<PageResult<PartnerCommissionLedgerRecord>>;
  listSettlementBatches(input: PartnerSettlementBatchListInput): Promise<PageResult<PartnerSettlementBatchRecord>>;
  getMonthlySummary(input: PartnerDashboardSummaryInput): Promise<PartnerDashboardSummaryRecord>;
}

export type PlatformPartnerMemberBindingClaimResult =
  | { status: "bound"; memberId: string }
  | { status: "sms_invalid" }
  | { status: "member_not_found" }
  | { status: "partner_unavailable" }
  | { status: "member_already_bound"; memberId?: string | null };

export type PlatformPartnerMemberUnbindClaimResult =
  | { status: "unbound"; memberId: string }
  | { status: "sms_invalid"; memberId?: string | null }
  | { status: "member_not_found" }
  | { status: "partner_unavailable"; memberId?: string | null }
  | { status: "member_not_bound"; memberId?: string | null };

export type UntypedTable = {
  select: (...args: unknown[]) => UntypedTable;
  update: (...args: unknown[]) => UntypedTable;
  eq: (...args: unknown[]) => UntypedTable; neq: (...args: unknown[]) => UntypedTable;
  gte: (...args: unknown[]) => UntypedTable; lt: (...args: unknown[]) => UntypedTable;
  in: (...args: unknown[]) => UntypedTable; order: (...args: unknown[]) => UntypedTable;
  limit: (...args: unknown[]) => UntypedTable; range: (...args: unknown[]) => UntypedTable;
  maybeSingle: () => Promise<{ data: unknown; error: unknown }>;
  single: () => Promise<{ data: unknown; error: unknown }>;
  then: Promise<{ data: unknown; error: unknown; count: number | null }>["then"];
};

export type PartnerPortalTable = "platform_partner_members" | "platform_partners" | "platform_partner_invite_codes" | "tenant_partner_bindings" | "platform_revenue_events" | "partner_commission_ledger" | "partner_settlement_batches";

export type UntypedClient = {
  from: (table: PartnerPortalTable) => UntypedTable;
  rpc: (functionName: string, parameters: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
};

const PARTNER_LEVEL_SELECT = "id, code, name, status";

export const PARTNER_SELECT =
  `id, name, status, region_codes, level:platform_partner_levels!platform_partners_level_id_fkey(${PARTNER_LEVEL_SELECT})`;
export const MEMBER_SELECT =
  `id, partner_id, auth_user_id, name, phone, role, status, partner:platform_partners!platform_partner_members_partner_id_fkey(${PARTNER_SELECT})`;

export const INVITE_CODE_SELECT =
  "id, partner_id, code, region_code, campaign_code, status, scan_count, submitted_count, approved_count, expires_at, created_at, updated_at";
export const TENANT_BINDING_SELECT =
  "id, tenant_id, partner_id, invite_code_id, source_type, source_id, status, bound_at, unbound_at, change_reason, created_at, updated_at, tenant:tenants!tenant_partner_bindings_tenant_id_fkey(id, name, slug)";
export const REVENUE_EVENT_SELECT =
  "id, revenue_type, tenant_id, partner_id, partner_level_id, binding_id, source_type, source_id, gross_amount_fen, revenue_amount_fen, paid_amount_fen, service_fee_rate_bps, commission_rate_bps, status, confirmed_at, paid_at, refundable_until, created_at, updated_at, tenant:tenants!platform_revenue_events_tenant_id_fkey(id, name, slug), partner_level:platform_partner_levels!platform_revenue_events_partner_level_id_fkey(id, code, name)";
export const COMMISSION_LEDGER_SELECT =
  "id, partner_id, revenue_event_id, revenue_type, base_amount_fen, commission_rate_bps, commission_amount_fen, status, available_at, settlement_batch_id, blocked_reason, failure_reason, created_at, updated_at, revenue_event:platform_revenue_events!partner_commission_ledger_revenue_event_id_fkey(id, tenant_id, source_type, source_id, revenue_amount_fen)";
export const SETTLEMENT_BATCH_SELECT =
  "id, batch_no, partner_id, period_start, period_end, total_amount_fen, status, settlement_method, payment_reference, payment_proof_url, reviewed_by_employee_id, paid_by_employee_id, paid_at, remark, created_at, updated_at";

export type PageResult<T> = {
  list: T[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
};
type ScopedPageInput = { partnerId: string; page: number; pageSize: number };
export type PartnerTenantBindingListInput = ScopedPageInput & {
  status?: TenantPartnerBindingRecord["status"];
};
export type PartnerRevenueEventListInput = ScopedPageInput & {
  revenue_type?: PlatformPartnerRevenueType;
  status?: PlatformRevenueEventStatus;
  startDate?: string;
  endDate?: string;
};
export type PartnerCommissionLedgerListInput = ScopedPageInput & {
  status?: PartnerCommissionLedgerStatus;
};
export type PartnerSettlementBatchListInput = ScopedPageInput & {
  status?: PartnerSettlementBatchStatus;
};
export type PartnerDashboardSummaryInput = {
  partnerId: string; month: string; startDate: string; endDate: string;
};
export type PartnerDashboardSummaryRecord = {
  tenant_count: number;
  revenue_event_count: number;
  revenue_amount_fen: number;
  paid_amount_fen: number;
  commission_amount_fen: number;
  available_commission_amount_fen: number;
  settled_commission_amount_fen: number;
  settlement_batch_count: number;
  settlement_total_amount_fen: number;
  paid_settlement_amount_fen: number;
};
