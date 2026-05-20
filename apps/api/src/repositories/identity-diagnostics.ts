import { createHash } from "node:crypto";
import { Errors } from "@/errors/error-factory";
import { SupabaseDB } from "@/utils/supabase";

type QueryType = "phone" | "openid" | "user_id" | "unknown";

export type IdentityDiagnosticTenantLite = {
  id: string;
  name: string | null;
  slug: string | null;
  status: string | null;
};

export type IdentityDiagnosticCustomerRecord = {
  id: string;
  tenant_id: string | null;
  name: string | null;
  phone: string | null;
  user_id: string | null;
  status?: string | null;
};

export type IdentityDiagnosticEmployeeRecord = {
  id: string;
  tenant_id: string | null;
  name: string | null;
  phone: string | null;
  user_id: string | null;
  status: string | null;
};

export type IdentityDiagnosticOauthRecord = {
  id: string;
  user_id: string;
  platform: string;
  openid: string;
  unionid: string | null;
  status: string;
  bound_at: string | null;
  unbound_at: string | null;
  created_at: string;
  updated_at: string;
};

export type IdentityDiagnosticMembershipRecord = {
  id: string;
  user_id: string;
  tenant_id: string | null;
  identity_type: "customer" | "employee" | "platform_admin" | string;
  identity_id: string;
  status: string;
  is_default: boolean;
  created_at: string;
  updated_at: string;
};

export type IdentityDiagnosticAuthEventRecord = {
  id: string;
  user_id: string | null;
  event_type: string;
  platform: string | null;
  openid_hash: string | null;
  operator_user_id: string | null;
  ip: string | null;
  user_agent: string | null;
  metadata: unknown;
  created_at: string;
};

export type IdentityDiagnosticAuthUserRecord = {
  id: string;
  email: string | null;
  phone: string | null;
  created_at: string | null;
  last_sign_in_at: string | null;
};

type UntypedTable = {
  select: (...args: unknown[]) => UntypedTable;
  eq: (...args: unknown[]) => UntypedTable;
  in: (...args: unknown[]) => UntypedTable;
  order: (...args: unknown[]) => UntypedTable;
  limit: (...args: unknown[]) => UntypedTable;
  maybeSingle: () => Promise<{ data: unknown; error: unknown }>;
  then: Promise<{
    data: unknown;
    error: unknown;
    count: number | null;
  }>["then"];
};

type LookupResult = {
  query: {
    keyword: string;
    type: QueryType;
    openid_hash: string | null;
  };
  auth_users: IdentityDiagnosticAuthUserRecord[];
  oauth_identities: IdentityDiagnosticOauthRecord[];
  memberships: IdentityDiagnosticMembershipRecord[];
  customers: IdentityDiagnosticCustomerRecord[];
  employees: IdentityDiagnosticEmployeeRecord[];
  tenants: IdentityDiagnosticTenantLite[];
  auth_events: IdentityDiagnosticAuthEventRecord[];
};

class IdentityDiagnosticsRepository {
  private client = SupabaseDB.getAdminClient();

  private from(table: string): UntypedTable {
    return (this.client as unknown as {
      from: (tableName: string) => UntypedTable;
    }).from(table);
  }

  detectQueryType(keyword: string): QueryType {
    if (/^[0-9]{11}$/.test(keyword)) return "phone";
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(keyword)) {
      return "user_id";
    }
    if (/^o[A-Za-z0-9_-]{8,}$/.test(keyword)) return "openid";
    return "unknown";
  }

  hashOpenid(keyword: string, queryType: QueryType) {
    if (queryType !== "openid") return null;
    return createHash("sha256").update(keyword).digest("hex");
  }

  async lookup(keyword: string): Promise<LookupResult> {
    const queryType = this.detectQueryType(keyword);
    const openidHash = this.hashOpenid(keyword, queryType);

    const [customersByPhone, employeesByPhone, customersByUuid, employeesByUuid, oauthByOpenid, oauthByUserId, membershipsByUserId, membershipsByIdentityId] = await Promise.all([
      queryType === "phone" ? this.findCustomersByPhone(keyword) : Promise.resolve([]),
      queryType === "phone" ? this.findEmployeesByPhone(keyword) : Promise.resolve([]),
      queryType === "user_id" ? this.findCustomersByUuid(keyword) : Promise.resolve([]),
      queryType === "user_id" ? this.findEmployeesByUuid(keyword) : Promise.resolve([]),
      queryType === "openid" ? this.findOauthByOpenid(keyword) : Promise.resolve([]),
      queryType === "user_id" ? this.findOauthByUserId(keyword) : Promise.resolve([]),
      queryType === "user_id" ? this.findMembershipsByUserId(keyword) : Promise.resolve([]),
      queryType === "user_id" ? this.findMembershipsByIdentityId(keyword) : Promise.resolve([]),
    ]);

    let customers = uniqueById([...customersByPhone, ...customersByUuid]);
    let employees = uniqueById([...employeesByPhone, ...employeesByUuid]);
    let oauthIdentities = uniqueById([...oauthByOpenid, ...oauthByUserId]);
    let memberships = uniqueById([...membershipsByUserId, ...membershipsByIdentityId]);

    const userIds = new Set<string>();
    for (const item of customers) if (item.user_id) userIds.add(item.user_id);
    for (const item of employees) if (item.user_id) userIds.add(item.user_id);
    for (const item of oauthIdentities) userIds.add(item.user_id);
    for (const item of memberships) userIds.add(item.user_id);
    if (queryType === "user_id") userIds.add(keyword);

    const identityIds = new Set<string>();
    for (const item of customers) identityIds.add(item.id);
    for (const item of employees) identityIds.add(item.id);

    const [membershipsByUsers, membershipsByIdentities] = await Promise.all([
      this.findMembershipsByUserIds(Array.from(userIds)),
      this.findMembershipsByIdentityIds(Array.from(identityIds)),
    ]);
    memberships = uniqueById([...memberships, ...membershipsByUsers, ...membershipsByIdentities]);

    for (const item of memberships) {
      userIds.add(item.user_id);
      identityIds.add(item.identity_id);
    }

    const [customersByIds, employeesByIds, oauthByUsers] = await Promise.all([
      this.findCustomersByIds(Array.from(identityIds)),
      this.findEmployeesByIds(Array.from(identityIds)),
      this.findOauthByUserIds(Array.from(userIds)),
    ]);
    customers = uniqueById([...customers, ...customersByIds]);
    employees = uniqueById([...employees, ...employeesByIds]);
    oauthIdentities = uniqueById([...oauthIdentities, ...oauthByUsers]);

    const tenantIds = unique([
      ...customers.map((item) => item.tenant_id),
      ...employees.map((item) => item.tenant_id),
      ...memberships.map((item) => item.tenant_id),
    ]);

    const [tenants, authEvents, authUsers] = await Promise.all([
      this.findTenants(tenantIds),
      this.findAuthEvents({
        userIds: Array.from(userIds),
        openidHash,
      }),
      this.findAuthUsers(Array.from(userIds)),
    ]);

    return {
      query: {
        keyword,
        type: queryType,
        openid_hash: openidHash,
      },
      auth_users: authUsers,
      oauth_identities: sortByCreatedAt(oauthIdentities),
      memberships: sortByCreatedAt(memberships),
      customers,
      employees,
      tenants,
      auth_events: sortByCreatedAt(authEvents).slice(0, 20),
    };
  }

  private async findCustomersByPhone(phone: string) {
    const { data, error } = await this.from("customers")
      .select("id,tenant_id,name,phone,user_id,status")
      .eq("phone", phone);
    if (error) throw Errors.dbError("查询客户档案失败", error);
    return (data || []) as IdentityDiagnosticCustomerRecord[];
  }

  private async findEmployeesByPhone(phone: string) {
    const { data, error } = await this.from("employees")
      .select("id,tenant_id,name,phone,user_id,status")
      .eq("phone", phone);
    if (error) throw Errors.dbError("查询员工档案失败", error);
    return (data || []) as IdentityDiagnosticEmployeeRecord[];
  }

  private async findCustomersByUuid(value: string) {
    const [byId, byUserId] = await Promise.all([
      this.findCustomersByIds([value]),
      this.findCustomersByUserId(value),
    ]);
    return uniqueById([...byId, ...byUserId]);
  }

  private async findEmployeesByUuid(value: string) {
    const [byId, byUserId] = await Promise.all([
      this.findEmployeesByIds([value]),
      this.findEmployeesByUserId(value),
    ]);
    return uniqueById([...byId, ...byUserId]);
  }

  private async findCustomersByUserId(userId: string) {
    const { data, error } = await this.from("customers")
      .select("id,tenant_id,name,phone,user_id,status")
      .eq("user_id", userId);
    if (error) throw Errors.dbError("查询客户档案失败", error);
    return (data || []) as IdentityDiagnosticCustomerRecord[];
  }

  private async findEmployeesByUserId(userId: string) {
    const { data, error } = await this.from("employees")
      .select("id,tenant_id,name,phone,user_id,status")
      .eq("user_id", userId);
    if (error) throw Errors.dbError("查询员工档案失败", error);
    return (data || []) as IdentityDiagnosticEmployeeRecord[];
  }

  private async findCustomersByIds(ids: string[]) {
    const values = unique(ids);
    if (values.length === 0) return [] as IdentityDiagnosticCustomerRecord[];
    const { data, error } = await this.from("customers")
      .select("id,tenant_id,name,phone,user_id,status")
      .in("id", values);
    if (error) throw Errors.dbError("查询客户档案失败", error);
    return (data || []) as IdentityDiagnosticCustomerRecord[];
  }

  private async findEmployeesByIds(ids: string[]) {
    const values = unique(ids);
    if (values.length === 0) return [] as IdentityDiagnosticEmployeeRecord[];
    const { data, error } = await this.from("employees")
      .select("id,tenant_id,name,phone,user_id,status")
      .in("id", values);
    if (error) throw Errors.dbError("查询员工档案失败", error);
    return (data || []) as IdentityDiagnosticEmployeeRecord[];
  }

  private async findOauthByOpenid(openid: string) {
    const { data, error } = await this.from("user_oauth_identities")
      .select("*")
      .eq("openid", openid)
      .order("created_at", { ascending: false });
    if (error) throw Errors.dbError("查询登录凭证失败", error);
    return (data || []) as IdentityDiagnosticOauthRecord[];
  }

  private async findOauthByUserId(userId: string) {
    return this.findOauthByUserIds([userId]);
  }

  private async findOauthByUserIds(userIds: string[]) {
    const values = unique(userIds);
    if (values.length === 0) return [] as IdentityDiagnosticOauthRecord[];
    const { data, error } = await this.from("user_oauth_identities")
      .select("*")
      .in("user_id", values)
      .order("created_at", { ascending: false });
    if (error) throw Errors.dbError("查询登录凭证失败", error);
    return (data || []) as IdentityDiagnosticOauthRecord[];
  }

  private async findMembershipsByUserId(userId: string) {
    return this.findMembershipsByUserIds([userId]);
  }

  private async findMembershipsByUserIds(userIds: string[]) {
    const values = unique(userIds);
    if (values.length === 0) return [] as IdentityDiagnosticMembershipRecord[];
    const { data, error } = await this.from("user_business_memberships")
      .select("*")
      .in("user_id", values)
      .order("created_at", { ascending: false });
    if (error) throw Errors.dbError("查询业务身份关系失败", error);
    return (data || []) as IdentityDiagnosticMembershipRecord[];
  }

  private async findMembershipsByIdentityId(identityId: string) {
    return this.findMembershipsByIdentityIds([identityId]);
  }

  private async findMembershipsByIdentityIds(identityIds: string[]) {
    const values = unique(identityIds);
    if (values.length === 0) return [] as IdentityDiagnosticMembershipRecord[];
    const { data, error } = await this.from("user_business_memberships")
      .select("*")
      .in("identity_id", values)
      .order("created_at", { ascending: false });
    if (error) throw Errors.dbError("查询业务身份关系失败", error);
    return (data || []) as IdentityDiagnosticMembershipRecord[];
  }

  private async findTenants(ids: string[]) {
    const values = unique(ids);
    if (values.length === 0) return [] as IdentityDiagnosticTenantLite[];
    const { data, error } = await this.from("tenants")
      .select("id,name,slug,status")
      .in("id", values);
    if (error) throw Errors.dbError("查询租户信息失败", error);
    return (data || []) as IdentityDiagnosticTenantLite[];
  }

  private async findAuthEvents(input: {
    userIds: string[];
    openidHash: string | null;
  }) {
    const result: IdentityDiagnosticAuthEventRecord[] = [];
    const userIds = unique(input.userIds);

    if (userIds.length > 0) {
      const { data, error } = await this.from("user_auth_events")
        .select("*")
        .in("user_id", userIds)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw Errors.dbError("查询身份事件失败", error);
      result.push(...((data || []) as IdentityDiagnosticAuthEventRecord[]));
    }

    if (input.openidHash) {
      const { data, error } = await this.from("user_auth_events")
        .select("*")
        .eq("openid_hash", input.openidHash)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw Errors.dbError("查询身份事件失败", error);
      result.push(...((data || []) as IdentityDiagnosticAuthEventRecord[]));
    }

    return uniqueById(result);
  }

  private async findAuthUsers(userIds: string[]) {
    const values = unique(userIds);
    const users = await Promise.all(values.map(async (id) => {
      const { data, error } = await this.client.auth.admin.getUserById(id);
      if (error || !data.user) {
        return {
          id,
          email: null,
          phone: null,
          created_at: null,
          last_sign_in_at: null,
        };
      }

      return {
        id: data.user.id,
        email: data.user.email ?? null,
        phone: data.user.phone ?? null,
        created_at: data.user.created_at ?? null,
        last_sign_in_at: data.user.last_sign_in_at ?? null,
      };
    }));

    return users;
  }
}

function unique(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.filter((item): item is string => Boolean(item))));
}

function uniqueById<T extends { id: string }>(items: T[]) {
  return Array.from(new Map(items.map((item) => [item.id, item])).values());
}

function sortByCreatedAt<T extends { created_at?: string | null }>(items: T[]) {
  return [...items].sort((a, b) => {
    const left = a.created_at ? new Date(a.created_at).getTime() : 0;
    const right = b.created_at ? new Date(b.created_at).getTime() : 0;
    return right - left;
  });
}

export const identityDiagnosticsRepository = new IdentityDiagnosticsRepository();
