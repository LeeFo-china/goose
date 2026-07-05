import { Errors } from "@/errors/error-factory";
import {
  type PlatformPartnerLevelRecord,
  type PlatformPartnerRecord as BasePlatformPartnerRecord,
} from "@/repositories/platform-partners";
import { SupabaseDB } from "@/utils/supabase/index";

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
  claimMemberBinding(input: {
    phone: string;
    code: string;
    authUserId: string;
  }): Promise<PlatformPartnerMemberBindingClaimResult>;
  bindMemberAuthUser(memberId: string, authUserId: string): Promise<PlatformPartnerMemberRecord>;
  findPartnerById(partnerId: string): Promise<PlatformPartnerRecord | null>;
}

export type PlatformPartnerMemberBindingClaimResult =
  | { status: "bound"; memberId: string }
  | { status: "sms_invalid" }
  | { status: "member_not_found" }
  | { status: "member_already_bound"; memberId?: string | null };

type UntypedTable = {
  select: (...args: unknown[]) => UntypedTable;
  update: (...args: unknown[]) => UntypedTable;
  eq: (...args: unknown[]) => UntypedTable;
  neq: (...args: unknown[]) => UntypedTable;
  in: (...args: unknown[]) => UntypedTable;
  order: (...args: unknown[]) => UntypedTable;
  limit: (...args: unknown[]) => UntypedTable;
  maybeSingle: () => Promise<{ data: unknown; error: unknown }>;
  single: () => Promise<{ data: unknown; error: unknown }>;
};

type PartnerPortalTable = "platform_partner_members" | "platform_partners";

type UntypedClient = {
  from: (table: PartnerPortalTable) => UntypedTable;
  rpc: (functionName: string, parameters: Record<string, unknown>) => Promise<{
    data: unknown;
    error: unknown;
  }>;
};

const PARTNER_LEVEL_SELECT = "id, code, name, status";

const PARTNER_SELECT = [
  "id",
  "name",
  "status",
  "region_codes",
  `level:platform_partner_levels!platform_partners_level_id_fkey(${PARTNER_LEVEL_SELECT})`,
].join(", ");

const MEMBER_SELECT = [
  "id",
  "partner_id",
  "auth_user_id",
  "name",
  "phone",
  "role",
  "status",
  `partner:platform_partners!platform_partner_members_partner_id_fkey(${PARTNER_SELECT})`,
].join(", ");

class PlatformPartnerPortalRepository implements PlatformPartnerPortalRepositoryPort {
  private from(table: PartnerPortalTable) {
    return (SupabaseDB.getAdminClient() as unknown as UntypedClient).from(table);
  }

  private rpc(name: string, params: Record<string, unknown>) {
    return (SupabaseDB.getAdminClient() as unknown as UntypedClient).rpc(name, params);
  }

  async findMemberByAuthUserId(authUserId: string) {
    const activeResult = await this.from("platform_partner_members")
      .select(MEMBER_SELECT)
      .eq("auth_user_id", authUserId)
      .eq("status", "active")
      .maybeSingle();

    if (activeResult.error) {
      throw Errors.dbError("查询合伙人成员失败", activeResult.error);
    }
    if (activeResult.data) {
      return activeResult.data as PlatformPartnerMemberRecord;
    }

    const inactiveResult = await this.from("platform_partner_members")
      .select(MEMBER_SELECT)
      .eq("auth_user_id", authUserId)
      .neq("status", "active")
      .order("updated_at", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (inactiveResult.error) {
      throw Errors.dbError("查询合伙人成员失败", inactiveResult.error);
    }
    return (inactiveResult.data as PlatformPartnerMemberRecord | null) ?? null;
  }

  async findMemberById(memberId: string) {
    const { data, error } = await this.from("platform_partner_members")
      .select(MEMBER_SELECT)
      .eq("id", memberId)
      .maybeSingle();

    if (error) throw Errors.dbError("查询合伙人成员失败", error);
    return (data as PlatformPartnerMemberRecord | null) ?? null;
  }

  async findBindableMemberByPhone(phone: string) {
    const { data, error } = await this.from("platform_partner_members")
      .select(MEMBER_SELECT)
      .eq("phone", phone)
      .in("status", ["pending_bind", "active"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw Errors.dbError("查询可绑定合伙人成员失败", error);
    return (data as PlatformPartnerMemberRecord | null) ?? null;
  }

  async claimMemberBinding(input: {
    phone: string;
    code: string;
    authUserId: string;
  }) {
    const { data, error } = await this.rpc(
      "claim_platform_partner_member_binding",
      {
        p_phone: input.phone,
        p_code: input.code,
        p_auth_user_id: input.authUserId,
      },
    );

    if (error) throw Errors.dbError("绑定合伙人成员失败", error);

    const [record] = (data || []) as Array<{
      status: PlatformPartnerMemberBindingClaimResult["status"];
      member_id: string | null;
    }>;
    if (!record) {
      throw Errors.dbError("绑定合伙人成员失败", {
        message: "claim_platform_partner_member_binding returned no rows",
      });
    }

    if (record.status === "bound") {
      if (!record.member_id) {
        throw Errors.dbError("绑定合伙人成员失败", {
          message: "claim_platform_partner_member_binding returned bound without member_id",
        });
      }

      return { status: "bound", memberId: record.member_id } as const;
    }

    if (record.status === "member_already_bound") {
      return {
        status: "member_already_bound",
        memberId: record.member_id,
      } as const;
    }

    if (
      record.status === "sms_invalid" ||
      record.status === "member_not_found"
    ) {
      return { status: record.status } as const;
    }

    throw Errors.dbError("绑定合伙人成员失败", {
      message: `unknown claim status: ${record.status}`,
    });
  }

  async bindMemberAuthUser(memberId: string, authUserId: string) {
    const { data, error } = await this.from("platform_partner_members")
      .update({
        auth_user_id: authUserId,
        status: "active",
      })
      .eq("id", memberId)
      .select(MEMBER_SELECT)
      .single();

    if (error) throw Errors.dbError("绑定合伙人成员失败", error);
    return data as PlatformPartnerMemberRecord;
  }

  async findPartnerById(partnerId: string) {
    const { data, error } = await this.from("platform_partners")
      .select(PARTNER_SELECT)
      .eq("id", partnerId)
      .maybeSingle();

    if (error) throw Errors.dbError("查询城市合伙人失败", error);
    return (data as PlatformPartnerRecord | null) ?? null;
  }
}

export const platformPartnerPortalRepository = new PlatformPartnerPortalRepository();
