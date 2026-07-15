import { Errors } from "@/errors/error-factory";
import { MEMBER_SELECT, type PlatformPartnerMemberRecord } from "@/repositories/platform-partner-portal-types";
import { SupabaseDB } from "@/utils/supabase";

export type RelationOne<T> = T | T[] | null;

export type PhoneCustomerRecord = {
  id: string;
  tenant_id: string | null;
  user_id: string | null;
  name: string | null;
  phone: string | null;
  tenant: RelationOne<{
    id: string;
    name: string | null;
    status: string | null;
  }>;
};

export type PhoneEmployeeRecord = {
  id: string;
  tenant_id: string | null;
  user_id: string | null;
  name: string | null;
  phone: string | null;
  status: string | null;
  tenant: RelationOne<{
    id: string;
    name: string | null;
    status: string | null;
  }>;
  tenant_department: RelationOne<{
    alias_name: string | null;
    code: string | null;
  }>;
  post: RelationOne<{
    name: string | null;
    code: string | null;
  }>;
};

type MembershipKeyRecord = {
  identity_type: string | null;
  tenant_id: string | null;
  identity_id: string | null;
};

type OAuthUserRecord = {
  user_id: string | null;
};

type UntypedTable = {
  select: (...args: unknown[]) => UntypedTable;
  eq: (...args: unknown[]) => UntypedTable;
  in: (...args: unknown[]) => UntypedTable;
  order: (...args: unknown[]) => UntypedTable;
  range: (...args: unknown[]) => UntypedTable;
  then: Promise<{ data: unknown; error: unknown }>["then"];
};

type UntypedClient = {
  from: (table: string) => unknown;
};

const CUSTOMER_SELECT = [
  "id",
  "tenant_id",
  "user_id",
  "name",
  "phone",
  "tenant:tenants!customers_tenant_id_fkey(id, name, status)",
].join(", ");

const EMPLOYEE_SELECT = [
  "id",
  "tenant_id",
  "user_id",
  "name",
  "phone",
  "status",
  "tenant:tenants!employees_tenant_id_fkey(id, name, status)",
  "tenant_department:tenant_departments!employees_tenant_department_id_fkey(alias_name, code)",
  "post:posts!employees_post_id_fkey(name, code)",
].join(", ");

const PHONE_IDENTITY_UPPER_BOUND = 100;

export class PhoneIdentityCandidateRepository {
  constructor(
    private readonly client =
      SupabaseDB.getAdminClient() as unknown as UntypedClient,
  ) {}

  private from(table: string): UntypedTable {
    return this.client.from(table) as UntypedTable;
  }

  async listCustomersByPhone(phone: string): Promise<PhoneCustomerRecord[]> {
    const { data, error } = await this
      .from("customers")
      .select(CUSTOMER_SELECT)
      .eq("phone", phone)
      .order("tenant_id", { ascending: true })
      .order("id", { ascending: true })
      .range(0, PHONE_IDENTITY_UPPER_BOUND);

    if (error) throw Errors.dbError("查询手机号客户身份失败", error);
    return (data ?? []) as PhoneCustomerRecord[];
  }

  async listEmployeesByPhone(phone: string): Promise<PhoneEmployeeRecord[]> {
    const { data, error } = await this
      .from("employees")
      .select(EMPLOYEE_SELECT)
      .eq("phone", phone)
      .order("tenant_id", { ascending: true })
      .order("id", { ascending: true })
      .range(0, PHONE_IDENTITY_UPPER_BOUND);

    if (error) throw Errors.dbError("查询手机号员工身份失败", error);
    return (data ?? []) as PhoneEmployeeRecord[];
  }

  async listPartnerMembersByPhone(
    phone: string,
  ): Promise<PlatformPartnerMemberRecord[]> {
    const { data, error } = await this
      .from("platform_partner_members")
      .select(MEMBER_SELECT)
      .eq("phone", phone)
      .order("status", { ascending: true })
      .order("id", { ascending: true })
      .range(0, 1);

    if (error) throw Errors.dbError("查询手机号合伙人成员身份失败", error);
    return (data ?? []) as PlatformPartnerMemberRecord[];
  }

  async listActiveMembershipKeys(authUserId: string): Promise<Set<string>> {
    const { data, error } = await this
      .from("user_business_memberships")
      .select("identity_type, tenant_id, identity_id")
      .eq("user_id", authUserId)
      .eq("status", "active")
      .in("identity_type", ["customer", "employee"])
      .range(0, PHONE_IDENTITY_UPPER_BOUND);

    if (error) throw Errors.dbError("查询当前用户业务身份失败", error);
    return new Set(
      ((data ?? []) as MembershipKeyRecord[])
        .filter((item) => item.identity_type && item.identity_id)
        .map((item) =>
          `${item.identity_type}:${item.tenant_id ?? ""}:${item.identity_id}`
        ),
    );
  }

  async listActiveWechatOauthUserIds(userIds: string[]): Promise<Set<string>> {
    const uniqueUserIds = Array.from(new Set(userIds.filter((id) => id)));
    if (uniqueUserIds.length === 0) return new Set();

    const { data, error } = await this
      .from("user_oauth_identities")
      .select("user_id")
      .in("user_id", uniqueUserIds)
      .eq("platform", "wechat_mini")
      .eq("status", "active")
      .range(0, uniqueUserIds.length - 1);

    if (error) throw Errors.dbError("查询微信登录凭证失败", error);
    return new Set(
      ((data ?? []) as OAuthUserRecord[])
        .map((item) => item.user_id)
        .filter((id): id is string => typeof id === "string" && id.length > 0),
    );
  }
}

export const phoneIdentityCandidateRepository =
  new PhoneIdentityCandidateRepository();
