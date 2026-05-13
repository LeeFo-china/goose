import { Errors } from "@/errors/error-factory";
import { SupabaseDB } from "@/utils/supabase";

export type OAuthPlatform = "wechat_mini" | "wechat_web" | "ios" | "android" | "web" | "apple";
export type BusinessIdentityType = "customer" | "employee" | "platform_admin";
export type IdentityStatus = "active" | "disabled" | "unbound";

export type UserOAuthIdentityRecord = {
  id: string;
  user_id: string;
  platform: OAuthPlatform;
  openid: string;
  unionid: string | null;
  status: IdentityStatus;
  bound_at: string;
  unbound_at: string | null;
  created_at: string;
  updated_at: string;
};

export type UserBusinessMembershipRecord = {
  id: string;
  user_id: string;
  tenant_id: string | null;
  identity_type: BusinessIdentityType;
  identity_id: string;
  status: IdentityStatus;
  is_default: boolean;
  created_at: string;
  updated_at: string;
};

export type LegacyBusinessBindingRecord = {
  id: string;
  tenant_id: string | null;
  user_id: string | null;
  status?: string | null;
};

type UntypedTable = {
  select: (...args: unknown[]) => UntypedTable;
  insert: (...args: unknown[]) => UntypedTable;
  update: (...args: unknown[]) => UntypedTable;
  eq: (...args: unknown[]) => UntypedTable;
  neq: (...args: unknown[]) => UntypedTable;
  is: (...args: unknown[]) => UntypedTable;
  maybeSingle: () => Promise<{ data: unknown; error: unknown }>;
  single: () => Promise<{ data: unknown; error: unknown }>;
  then: Promise<{
    data: unknown;
    error: unknown;
    count: number | null;
  }>["then"];
};

class UserIdentityRepository {
  private client = SupabaseDB.getAdminClient();

  private from(table: string): UntypedTable {
    return (this.client as unknown as {
      from: (tableName: string) => UntypedTable;
    }).from(table);
  }

  async findActiveOauthIdentity(platform: OAuthPlatform, openid: string) {
    const { data, error } = await this.from("user_oauth_identities")
      .select("*")
      .eq("platform", platform)
      .eq("openid", openid)
      .eq("status", "active")
      .maybeSingle();

    if (error) {
      throw Errors.dbError("查询用户登录凭证失败", error);
    }

    return (data || null) as UserOAuthIdentityRecord | null;
  }

  async createOauthIdentity(input: {
    userId: string;
    platform: OAuthPlatform;
    openid: string;
    unionid?: string | null;
  }) {
    const now = new Date().toISOString();
    const { data, error } = await this.from("user_oauth_identities")
      .insert({
        user_id: input.userId,
        platform: input.platform,
        openid: input.openid,
        unionid: input.unionid ?? null,
        status: "active",
        bound_at: now,
        unbound_at: null,
      })
      .select("*")
      .single();

    if (error) {
      throw Errors.dbError("创建用户登录凭证失败", error);
    }

    return data as UserOAuthIdentityRecord;
  }

  async updateOauthIdentity(input: {
    id: string;
    userId: string;
    unionid?: string | null;
  }) {
    const { data, error } = await this.from("user_oauth_identities")
      .update({
        user_id: input.userId,
        unionid: input.unionid ?? null,
        status: "active",
        unbound_at: null,
      })
      .eq("id", input.id)
      .select("*")
      .single();

    if (error) {
      throw Errors.dbError("更新用户登录凭证失败", error);
    }

    return data as UserOAuthIdentityRecord;
  }

  async listBusinessMemberships(userId: string) {
    const { data, error } = await this.from("user_business_memberships")
      .select("*")
      .eq("user_id", userId);

    if (error) {
      throw Errors.dbError("查询用户业务身份失败", error);
    }

    return (data || []) as UserBusinessMembershipRecord[];
  }

  async findBusinessMembership(input: {
    userId: string;
    tenantId: string | null;
    identityType: BusinessIdentityType;
    identityId: string;
  }) {
    let query = this.from("user_business_memberships")
      .select("*")
      .eq("user_id", input.userId)
      .eq("identity_type", input.identityType)
      .eq("identity_id", input.identityId);

    query = input.tenantId ? query.eq("tenant_id", input.tenantId) : query.is("tenant_id", null);

    const { data, error } = await query.maybeSingle();

    if (error) {
      throw Errors.dbError("查询用户业务身份失败", error);
    }

    return (data || null) as UserBusinessMembershipRecord | null;
  }

  async createBusinessMembership(input: {
    userId: string;
    tenantId: string | null;
    identityType: BusinessIdentityType;
    identityId: string;
    status?: IdentityStatus;
    isDefault?: boolean;
  }) {
    const { data, error } = await this.from("user_business_memberships")
      .insert({
        user_id: input.userId,
        tenant_id: input.tenantId,
        identity_type: input.identityType,
        identity_id: input.identityId,
        status: input.status ?? "active",
        is_default: input.isDefault ?? true,
      })
      .select("*")
      .single();

    if (error) {
      throw Errors.dbError("创建用户业务身份失败", error);
    }

    return data as UserBusinessMembershipRecord;
  }

  async updateBusinessMembership(input: {
    id: string;
    status: IdentityStatus;
    isDefault?: boolean;
  }) {
    const { data, error } = await this.from("user_business_memberships")
      .update({
        status: input.status,
        is_default: input.isDefault ?? false,
      })
      .eq("id", input.id)
      .select("*")
      .single();

    if (error) {
      throw Errors.dbError("更新用户业务身份失败", error);
    }

    return data as UserBusinessMembershipRecord;
  }

  async deactivateOtherMemberships(input: {
    userId: string;
    identityType: BusinessIdentityType;
    keepIdentityId: string;
  }) {
    const { error } = await this.from("user_business_memberships")
      .update({
        status: "unbound",
        is_default: false,
      })
      .eq("user_id", input.userId)
      .eq("identity_type", input.identityType)
      .eq("status", "active")
      .neq("identity_id", input.keepIdentityId);

    if (error) {
      throw Errors.dbError("清理用户旧业务身份失败", error);
    }
  }

  async unbindBusinessMembership(input: {
    userId: string;
    tenantId: string;
    identityType: BusinessIdentityType;
    identityId: string;
  }) {
    const { error } = await this.from("user_business_memberships")
      .update({
        status: "unbound",
        is_default: false,
      })
      .eq("user_id", input.userId)
      .eq("tenant_id", input.tenantId)
      .eq("identity_type", input.identityType)
      .eq("identity_id", input.identityId)
      .eq("status", "active");

    if (error) {
      throw Errors.dbError("解绑用户业务身份失败", error);
    }
  }

  async listLegacyCustomerBindings(userId: string) {
    const { data, error } = await this.from("customers")
      .select("id, tenant_id, user_id")
      .eq("user_id", userId);

    if (error) {
      throw Errors.dbError("查询旧客户身份失败", error);
    }

    return (data || []) as LegacyBusinessBindingRecord[];
  }

  async listLegacyEmployeeBindings(userId: string) {
    const { data, error } = await this.from("employees")
      .select("id, tenant_id, user_id, status")
      .eq("user_id", userId);

    if (error) {
      throw Errors.dbError("查询旧员工身份失败", error);
    }

    return (data || []) as LegacyBusinessBindingRecord[];
  }

  async recordAuthEvent(input: {
    userId?: string | null;
    eventType: string;
    platform?: OAuthPlatform | null;
    openidHash?: string | null;
    operatorUserId?: string | null;
    metadata?: Record<string, unknown>;
  }) {
    const { error } = await this.from("user_auth_events")
      .insert({
        user_id: input.userId ?? null,
        event_type: input.eventType,
        platform: input.platform ?? null,
        openid_hash: input.openidHash ?? null,
        operator_user_id: input.operatorUserId ?? null,
        metadata: input.metadata ?? {},
      });

    if (error) {
      throw Errors.dbError("记录用户身份事件失败", error);
    }
  }
}

export const userIdentityRepository = new UserIdentityRepository();
