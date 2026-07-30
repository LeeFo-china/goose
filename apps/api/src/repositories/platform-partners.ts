import { Errors } from "@/errors/error-factory";
import type {
  PlatformPartnerCreateRecordInput,
  PlatformPartnerInviteCodeCounterDeltaInput,
  PlatformPartnerInviteCodeCreateRecordInput,
  PlatformPartnerInviteCodeRecord,
  PlatformPartnerInviteCodeWithPartnerRecord,
  PlatformPartnerLevelRecord,
  PlatformPartnerMemberCreateRecordInput,
  PlatformPartnerMemberRecord,
  PlatformPartnerMemberStatusRecordInput,
  PlatformPartnerRecord,
  PlatformPartnerRegionsRecordInput,
  PlatformPartnerStatusRecordInput,
  PlatformPartnerUpdateRecordInput,
  TenantPartnerBindingCreateRecordInput,
  TenantPartnerBindingRecord,
} from "@/repositories/platform-partners-types";
import { SupabaseDB } from "@/utils/supabase/index";

export type * from "@/repositories/platform-partners-types";

type UntypedTable = {
  select: (...args: unknown[]) => UntypedTable;
  insert: (...args: unknown[]) => UntypedTable;
  update: (...args: unknown[]) => UntypedTable;
  eq: (...args: unknown[]) => UntypedTable;
  neq: (...args: unknown[]) => UntypedTable;
  or: (...args: unknown[]) => UntypedTable;
  contains: (...args: unknown[]) => UntypedTable;
  overlaps: (...args: unknown[]) => UntypedTable;
  order: (...args: unknown[]) => UntypedTable;
  range: (...args: unknown[]) => UntypedTable;
  limit: (...args: unknown[]) => UntypedTable;
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
  | "platform_partner_members"
  | "platform_partner_invite_codes"
  | "tenant_partner_bindings";

type UntypedClient = {
  from: (table: PartnerTable) => UntypedTable;
  rpc: (
    functionName: "increment_platform_partner_invite_code_counts",
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: unknown }>;
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

const INVITE_CODE_SELECT = [
  "*",
  "partner:platform_partners!platform_partner_invite_codes_partner_id_fkey(id, name, status, region_codes, level:platform_partner_levels!platform_partners_level_id_fkey(code, name))",
].join(", ");

const MEMBER_SELECT = [
  "*",
  "partner:platform_partners!platform_partner_members_partner_id_fkey(id, name, status)",
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

  async findActiveRegionConflict(input: {
    regionCodes: string[];
    excludePartnerId?: string;
  }) {
    let request = this.from("platform_partners")
      .select("id,name,region_codes")
      .eq("status", "active")
      .overlaps("region_codes", input.regionCodes);

    if (input.excludePartnerId) {
      request = request.neq("id", input.excludePartnerId);
    }

    const { data, error } = await request.limit(1).maybeSingle();
    if (error) throw Errors.dbError("检查城市合伙人区域冲突失败", error);
    return (data as Pick<
      PlatformPartnerRecord,
      "id" | "name" | "region_codes"
    > | null) ?? null;
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

  async updatePartnerRegions(
    partnerId: string,
    input: PlatformPartnerRegionsRecordInput,
  ) {
    const { data, error } = await this.from("platform_partners")
      .update({
        region_codes: input.region_codes,
        region_version: input.expected_version + 1,
        updated_by_employee_id: input.updated_by_employee_id,
      })
      .eq("id", partnerId)
      .eq("region_version", input.expected_version)
      .select(PARTNER_SELECT)
      .maybeSingle();

    if (error) throw Errors.dbError("更新城市合伙人运营区县失败", error);
    return (data as PlatformPartnerRecord | null) ?? null;
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

  async listPartnerMembers(input: {
    partnerId: string;
    page: number;
    pageSize: number;
  }) {
    const from = (input.page - 1) * input.pageSize;
    const to = from + input.pageSize - 1;
    const { data, error, count } = await this.from("platform_partner_members")
      .select(MEMBER_SELECT, { count: "exact" })
      .eq("partner_id", input.partnerId)
      .order("created_at", { ascending: false })
      .range(from, to);

    if (error) throw Errors.dbError("查询合伙人成员失败", error);
    return this.buildPage<PlatformPartnerMemberRecord>(
      data,
      count,
      input.page,
      input.pageSize,
    );
  }

  async createPartnerMember(input: PlatformPartnerMemberCreateRecordInput) {
    const { data, error } = await this.from("platform_partner_members")
      .insert(input)
      .select(MEMBER_SELECT)
      .single();

    if (error) throw Errors.dbError("创建合伙人成员失败", error);
    return data as PlatformPartnerMemberRecord;
  }

  async findPartnerMemberById(memberId: string) {
    const { data, error } = await this.from("platform_partner_members")
      .select(MEMBER_SELECT)
      .eq("id", memberId)
      .maybeSingle();

    if (error) throw Errors.dbError("查询合伙人成员失败", error);
    return (data as PlatformPartnerMemberRecord | null) ?? null;
  }

  async updatePartnerMemberStatus(
    memberId: string,
    input: PlatformPartnerMemberStatusRecordInput,
  ) {
    const { data, error } = await this.from("platform_partner_members")
      .update({
        status: input.status,
        updated_by_employee_id: input.updated_by_employee_id,
        remark: input.remark,
      })
      .eq("id", memberId)
      .select(MEMBER_SELECT)
      .single();

    if (error) throw Errors.dbError("更新合伙人成员状态失败", error);
    return data as PlatformPartnerMemberRecord;
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

  async findInviteCodeByCode(code: string) {
    const { data, error } = await this.from("platform_partner_invite_codes")
      .select(INVITE_CODE_SELECT)
      .eq("code", code)
      .maybeSingle();

    if (error) throw Errors.dbError("查询合伙人邀请码失败", error);
    return (data as PlatformPartnerInviteCodeWithPartnerRecord | null) ?? null;
  }

  async incrementInviteCodeCounts(
    input: PlatformPartnerInviteCodeCounterDeltaInput,
  ) {
    const { error } = await (SupabaseDB.getAdminClient() as unknown as UntypedClient)
      .rpc("increment_platform_partner_invite_code_counts", {
        p_invite_code_id: input.inviteCodeId,
        p_scan_count: input.scan_count ?? 0,
        p_submitted_count: input.submitted_count ?? 0,
        p_approved_count: input.approved_count ?? 0,
      });

    if (error) throw Errors.dbError("更新合伙人邀请码统计失败", error);
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
