import { Errors } from "@/errors/error-factory";
import type {
  PlatformPartnerMemberRecord,
  PlatformPartnerRecord,
} from "@/repositories/platform-partner-portal";
import { SupabaseDB } from "@/utils/supabase";

const IDENTITY_OPTION_LIMIT = 50;
const PARTNER_LEVEL_SELECT = "id, code, name, status";
const PARTNER_SELECT =
  `id, name, status, region_codes, level:platform_partner_levels!platform_partners_level_id_fkey(${PARTNER_LEVEL_SELECT})`;
const PARTNER_MEMBER_SELECT =
  `id, partner_id, auth_user_id, name, phone, role, status, partner:platform_partners!platform_partner_members_partner_id_fkey!inner(${PARTNER_SELECT})`;
const BUSINESS_MEMBERSHIP_SELECT =
  "id, user_id, tenant_id, identity_type, identity_id, status, is_default";
const EMPLOYEE_SELECT = `
  id,
  tenant_id,
  user_id,
  name,
  phone,
  status,
  tenant_department_id,
  post_id,
  avatar,
  tenant:tenants!employees_tenant_id_fkey(id, name, slug, status),
  tenant_department:tenant_departments!employees_tenant_department_id_fkey(id, alias_name, code),
  post:posts!employees_post_id_fkey(id, name, code)
`;
const CUSTOMER_SELECT = `
  id,
  tenant_id,
  user_id,
  name,
  phone,
  status,
  customer_origin,
  claimed_at,
  tenant:tenants!customers_tenant_id_fkey(id, name, slug, status)
`;

type RelationOne<T> = T | T[] | null;

export type BusinessIdentityType = "employee" | "customer";

export type BusinessMembershipRecord = {
  id: string;
  user_id: string;
  tenant_id: string | null;
  identity_type: BusinessIdentityType;
  identity_id: string;
  status: string;
  is_default: boolean;
};

export type TenantOptionRecord = {
  id: string | null;
  name: string | null;
  slug: string | null;
  status: string | null;
};

export type EmployeeIdentityOptionRecord = {
  id: string;
  tenant_id: string | null;
  user_id: string | null;
  name: string | null;
  phone: string | null;
  status: string | null;
  tenant_department_id: string | null;
  post_id: string | null;
  avatar: string | null;
  tenant: RelationOne<TenantOptionRecord>;
  tenant_department: RelationOne<{
    id: string | null;
    alias_name: string | null;
    code: string | null;
  }>;
  post: RelationOne<{
    id: string | null;
    name: string | null;
    code: string | null;
  }>;
};

export type CustomerIdentityOptionRecord = {
  id: string;
  tenant_id: string | null;
  user_id: string | null;
  name: string | null;
  phone: string | null;
  status: string | null;
  customer_origin: string | null;
  claimed_at: string | null;
  tenant: RelationOne<TenantOptionRecord>;
};

export type AuthIdentityPartnerMemberRecord = PlatformPartnerMemberRecord & {
  partner: PlatformPartnerRecord;
};

export interface AuthIdentityOptionsRepositoryPort {
  listPartnerMembersByAuthUserId(authUserId: string): Promise<AuthIdentityPartnerMemberRecord[]>;
  listBusinessMemberships(authUserId: string): Promise<BusinessMembershipRecord[]>;
  listEmployeesByIds(employeeIds: string[]): Promise<EmployeeIdentityOptionRecord[]>;
  listCustomersByIds(customerIds: string[]): Promise<CustomerIdentityOptionRecord[]>;
}

type UntypedTable = {
  select: (...args: unknown[]) => UntypedTable;
  eq: (...args: unknown[]) => UntypedTable;
  in: (...args: unknown[]) => UntypedTable;
  order: (...args: unknown[]) => UntypedTable;
  range: (...args: unknown[]) => UntypedTable;
  then: Promise<{ data: unknown; error: unknown }>["then"];
};

type UntypedClient = {
  from: (table: string) => UntypedTable;
};

function uniqueIds(ids: readonly string[]) {
  return Array.from(new Set(ids.filter((id) => id.trim().length > 0)));
}

class AuthIdentityOptionsRepository implements AuthIdentityOptionsRepositoryPort {
  private from(table: string) {
    return (SupabaseDB.getAdminClient() as unknown as UntypedClient).from(table);
  }

  async listPartnerMembersByAuthUserId(authUserId: string) {
    const { data, error } = await this.from("platform_partner_members")
      .select(PARTNER_MEMBER_SELECT)
      .eq("auth_user_id", authUserId)
      .eq("status", "active")
      .eq("partner.status", "active")
      .order("created_at", { ascending: true })
      // 身份切换候选是小集合，但按登录用户读取仍显式封顶，避免异常绑定返回无界列表。
      .range(0, IDENTITY_OPTION_LIMIT - 1);

    if (error) {
      throw Errors.dbError("查询合伙人身份选项失败", error);
    }

    return (data ?? []) as AuthIdentityPartnerMemberRecord[];
  }

  async listBusinessMemberships(authUserId: string) {
    const { data, error } = await this.from("user_business_memberships")
      .select(BUSINESS_MEMBERSHIP_SELECT)
      .eq("user_id", authUserId)
      .eq("status", "active")
      .in("identity_type", ["employee", "customer"])
      .order("is_default", { ascending: false })
      // 身份选项通常远小于 50；这里封顶防止历史脏数据造成无界列表。
      .range(0, IDENTITY_OPTION_LIMIT - 1);

    if (error) {
      throw Errors.dbError("查询业务身份选项失败", error);
    }

    return (data ?? []) as BusinessMembershipRecord[];
  }

  async listEmployeesByIds(employeeIds: string[]) {
    const ids = uniqueIds(employeeIds);
    if (ids.length === 0) {
      return [];
    }

    const { data, error } = await this.from("employees")
      .select(EMPLOYEE_SELECT)
      .in("id", ids);

    if (error) {
      throw Errors.dbError("查询员工身份选项失败", error);
    }

    return (data ?? []) as EmployeeIdentityOptionRecord[];
  }

  async listCustomersByIds(customerIds: string[]) {
    const ids = uniqueIds(customerIds);
    if (ids.length === 0) {
      return [];
    }

    const { data, error } = await this.from("customers")
      .select(CUSTOMER_SELECT)
      .in("id", ids);

    if (error) {
      throw Errors.dbError("查询客户身份选项失败", error);
    }

    return (data ?? []) as CustomerIdentityOptionRecord[];
  }
}

export const authIdentityOptionsRepository = new AuthIdentityOptionsRepository();
