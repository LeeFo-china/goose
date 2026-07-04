import { Errors } from "@/errors/error-factory";
import { SupabaseDB } from "@/utils/supabase/index";

export type PlatformPartnerStatus =
  | "pending"
  | "active"
  | "suspended"
  | "terminated";

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
  "id" | "created_at" | "updated_at" | "level"
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

export type PlatformPartnerInviteCodeCreateRecordInput = {
  partner_id: string;
  code: string;
  region_code?: string | null;
  campaign_code?: string | null;
  expires_at?: string | null;
  created_by_employee_id: string;
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
  changed_by_employee_id: string;
  change_reason: string;
};

type UntypedTable = {
  select: (...args: unknown[]) => UntypedTable;
  insert: (...args: unknown[]) => UntypedTable;
  update: (...args: unknown[]) => UntypedTable;
  eq: (...args: unknown[]) => UntypedTable;
  or: (...args: unknown[]) => UntypedTable;
  contains: (...args: unknown[]) => UntypedTable;
  order: (...args: unknown[]) => UntypedTable;
  range: (...args: unknown[]) => UntypedTable;
  maybeSingle: () => Promise<{ data: unknown; error: unknown }>;
  single: () => Promise<{ data: unknown; error: unknown }>;
  then: Promise<{
    data: unknown;
    error: unknown;
    count: number | null;
  }>["then"];
};

type PartnerTable =
  | "platform_partner_levels"
  | "platform_partners"
  | "platform_partner_invite_codes"
  | "tenant_partner_bindings";

type UntypedClient = {
  from: (table: PartnerTable) => UntypedTable;
};

const PARTNER_SELECT = [
  "*",
  "level:platform_partner_levels!platform_partners_level_id_fkey(*)",
].join(", ");

const BINDING_SELECT = [
  "*",
  "partner:platform_partners!tenant_partner_bindings_partner_id_fkey(id, name, status)",
  "tenant:tenants!tenant_partner_bindings_tenant_id_fkey(id, name, slug)",
].join(", ");

class PlatformPartnersRepository {
  private from(table: PartnerTable) {
    return (SupabaseDB.getAdminClient() as unknown as UntypedClient).from(table);
  }

  async listPartners(input: {
    page: number;
    pageSize: number;
    status?: string;
    keyword?: string;
    region_code?: string;
  }) {
    const from = (input.page - 1) * input.pageSize;
    const to = from + input.pageSize - 1;
    let request = this.from("platform_partners")
      .select(PARTNER_SELECT, { count: "exact" })
      .order("created_at", { ascending: false })
      .range(from, to);

    if (input.status) request = request.eq("status", input.status);
    if (input.region_code) {
      request = request.contains("region_codes", [input.region_code]);
    }
    if (input.keyword) {
      const escaped = input.keyword.replaceAll(",", "\\,");
      request = request.or(
        `name.ilike.%${escaped}%,contact_name.ilike.%${escaped}%,phone.ilike.%${escaped}%`,
      );
    }

    const { data, error, count } = await request;
    if (error) throw Errors.dbError("查询城市合伙人失败", error);

    return this.buildPage(data, count, input.page, input.pageSize);
  }

  async findPartnerById(partnerId: string) {
    const { data, error } = await this.from("platform_partners")
      .select(PARTNER_SELECT)
      .eq("id", partnerId)
      .maybeSingle();

    if (error) throw Errors.dbError("查询城市合伙人详情失败", error);
    return (data as PlatformPartnerRecord | null) ?? null;
  }

  async listLevels() {
    const { data, error } = await this.from("platform_partner_levels")
      .select("*")
      .eq("status", "active")
      .order("sort_order", { ascending: true });

    if (error) throw Errors.dbError("查询合伙人等级失败", error);
    return (data ?? []) as PlatformPartnerLevelRecord[];
  }

  async createPartner(input: PlatformPartnerCreateRecordInput) {
    const { data, error } = await this.from("platform_partners")
      .insert(input)
      .select(PARTNER_SELECT)
      .single();

    if (error) throw Errors.dbError("创建城市合伙人失败", error);
    return data as PlatformPartnerRecord;
  }

  async updatePartner(partnerId: string, input: PlatformPartnerUpdateRecordInput) {
    const { data, error } = await this.from("platform_partners")
      .update(input)
      .eq("id", partnerId)
      .select(PARTNER_SELECT)
      .single();

    if (error) throw Errors.dbError("更新城市合伙人失败", error);
    return data as PlatformPartnerRecord;
  }

  async updatePartnerStatus(
    partnerId: string,
    input: PlatformPartnerStatusRecordInput,
  ) {
    const { data, error } = await this.from("platform_partners")
      .update({
        status: input.status,
        remark: input.change_reason,
        updated_by_employee_id: input.updated_by_employee_id,
      })
      .eq("id", partnerId)
      .select(PARTNER_SELECT)
      .single();

    if (error) throw Errors.dbError("更新城市合伙人状态失败", error);
    return data as PlatformPartnerRecord;
  }

  async createInviteCode(input: PlatformPartnerInviteCodeCreateRecordInput) {
    const { data, error } = await this.from("platform_partner_invite_codes")
      .insert(input)
      .select("*")
      .single();

    if (error) throw Errors.dbError("创建合伙人邀请码失败", error);
    return data as PlatformPartnerInviteCodeRecord;
  }

  async listInviteCodes(partnerId: string) {
    const { data, error } = await this.from("platform_partner_invite_codes")
      .select("*")
      .eq("partner_id", partnerId)
      .order("created_at", { ascending: false });

    if (error) throw Errors.dbError("查询合伙人邀请码失败", error);
    return (data ?? []) as PlatformPartnerInviteCodeRecord[];
  }

  async findActiveTenantBinding(tenantId: string) {
    const { data, error } = await this.from("tenant_partner_bindings")
      .select(BINDING_SELECT)
      .eq("tenant_id", tenantId)
      .eq("status", "active")
      .maybeSingle();

    if (error) throw Errors.dbError("查询装企合伙人绑定失败", error);
    return (data as TenantPartnerBindingRecord | null) ?? null;
  }

  async createTenantBinding(input: TenantPartnerBindingCreateRecordInput) {
    const { data, error } = await this.from("tenant_partner_bindings")
      .insert(input)
      .select(BINDING_SELECT)
      .single();

    if (error) throw Errors.dbError("创建装企合伙人绑定失败", error);
    return data as TenantPartnerBindingRecord;
  }

  async listTenantBindings(input: {
    page: number;
    pageSize: number;
    partner_id?: string;
    tenant_id?: string;
  }) {
    const from = (input.page - 1) * input.pageSize;
    const to = from + input.pageSize - 1;
    let request = this.from("tenant_partner_bindings")
      .select(BINDING_SELECT, { count: "exact" })
      .order("bound_at", { ascending: false })
      .range(from, to);

    if (input.partner_id) request = request.eq("partner_id", input.partner_id);
    if (input.tenant_id) request = request.eq("tenant_id", input.tenant_id);

    const { data, error, count } = await request;
    if (error) throw Errors.dbError("查询装企合伙人绑定列表失败", error);

    return this.buildPage(data, count, input.page, input.pageSize);
  }

  private buildPage<T>(
    data: unknown,
    count: number | null,
    page: number,
    pageSize: number,
  ) {
    return {
      list: (data ?? []) as T[],
      pagination: {
        page,
        pageSize,
        total: count ?? 0,
        totalPages: count ? Math.ceil(count / pageSize) : 0,
      },
    };
  }
}

export const platformPartnersRepository = new PlatformPartnersRepository();
