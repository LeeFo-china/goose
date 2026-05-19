import { Errors } from "@/errors/error-factory";
import { SupabaseDB } from "@/utils/supabase";

export type CustomerSelfServiceCustomerContextRow = {
  id: string;
  name: string | null;
  phone: string | null;
  user_id: string | null;
  tenant_id: string | null;
  tenant:
    | {
      id: string | null;
      name: string | null;
      slug: string | null;
      status: string | null;
    }
    | Array<{
      id: string | null;
      name: string | null;
      slug: string | null;
      status: string | null;
    }>
    | null;
};

export type CustomerSelfServiceUserProfileRow = {
  auth_user_id: string;
  nickname: string | null;
  avatar_path: string | null;
  profile_completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type CustomerSelfServiceProjectListItem = {
  id: string;
  tenant_id?: string | null;
  name: string | null;
  status: string | null;
  budget: number | null;
  address: string | null;
  start_date: string | null;
  style_tags: unknown;
  designer: {
    id: string;
    name: string | null;
    avatar?: string | null;
  } | {
    id: string;
    name: string | null;
    avatar?: string | null;
  }[] | null;
  property: {
    id: string;
    community: string | null;
    building_info: string | null;
    layout?: string | null;
    area?: number | null;
    latitude?: number | null;
    longitude?: number | null;
  } | {
    id: string;
    community: string | null;
    building_info: string | null;
    layout?: string | null;
    area?: number | null;
    latitude?: number | null;
    longitude?: number | null;
  }[] | null;
};

class CustomerSelfServiceRepository {
  private adminClient = SupabaseDB.getAdminClient();

  private customerContextSelect = `
    id,
    name,
    phone,
    user_id,
    tenant_id,
    tenant:tenants!customers_tenant_id_fkey(
      id,
      name,
      slug,
      status
    )
  `;

  private projectListSelect = `
    id,
    tenant_id,
    name,
    status,
    budget,
    address,
    start_date,
    style_tags,
    designer:employees!projects_designer_id_fkey(
      id,
      name,
      avatar
    ),
    property:properties!projects_property_id_fkey(
      id,
      community,
      building_info,
      layout,
      area,
      latitude,
      longitude
    )
  `;

  async listLegacyCustomerProfilesByAuthUserId(
    authUserId: string,
    options?: {
      tenantId?: string | null;
      customerId?: string | null;
    },
  ) {
    let query = this.adminClient
      .from("customers")
      .select(this.customerContextSelect)
      .eq("user_id", authUserId);

    if (options?.tenantId) {
      query = query.eq("tenant_id", options.tenantId);
    }

    if (options?.customerId) {
      query = query.eq("id", options.customerId);
    }

    const { data, error } = await query.limit(2);

    if (error) {
      throw Errors.dbError("查询客户身份失败", error);
    }

    return (data || []) as unknown as CustomerSelfServiceCustomerContextRow[];
  }

  async listCustomerProfilesByIds(customerIds: string[]) {
    if (customerIds.length === 0) {
      return [] as CustomerSelfServiceCustomerContextRow[];
    }

    const { data, error } = await this.adminClient
      .from("customers")
      .select(this.customerContextSelect)
      .in("id", customerIds);

    if (error) {
      throw Errors.dbError("查询客户业务身份失败", error);
    }

    return (data || []) as unknown as CustomerSelfServiceCustomerContextRow[];
  }

  async getUserProfileByAuthUserId(authUserId: string) {
    const { data, error } = await this.adminClient
      .from("user_profiles")
      .select("auth_user_id, nickname, avatar_path, profile_completed_at, created_at, updated_at")
      .eq("auth_user_id", authUserId)
      .maybeSingle();

    if (error) {
      throw Errors.dbError("查询用户资料失败", error);
    }

    return (data as CustomerSelfServiceUserProfileRow | null) || null;
  }

  async upsertUserProfile(input: {
    authUserId: string;
    nickname: string | null;
    avatarPath: string | null;
    profileCompletedAt: string | null;
  }) {
    const { data, error } = await this.adminClient
      .from("user_profiles")
      .upsert({
        auth_user_id: input.authUserId,
        nickname: input.nickname,
        avatar_path: input.avatarPath,
        profile_completed_at: input.profileCompletedAt,
      }, {
        onConflict: "auth_user_id",
      })
      .select("auth_user_id, nickname, avatar_path, profile_completed_at, created_at, updated_at")
      .single();

    if (error) {
      throw Errors.dbError("保存用户资料失败", error);
    }

    return data as CustomerSelfServiceUserProfileRow;
  }

  async listOwnedProjects(input: {
    customerId: string;
    tenantId: string;
    from: number;
    to: number;
  }) {
    const { data, error, count } = await this.adminClient
      .from("projects")
      .select(this.projectListSelect, { count: "exact" })
      .eq("customer_id", input.customerId)
      .eq("tenant_id", input.tenantId)
      .order("created_at", { ascending: false })
      .range(input.from, input.to);

    if (error) {
      throw Errors.dbError("查询客户项目列表失败", error);
    }

    return {
      list: (data || []) as unknown as CustomerSelfServiceProjectListItem[],
      count: count || 0,
    };
  }

  async findOwnedProject(input: {
    projectId: string;
    customerId: string;
    tenantId?: string | null;
  }) {
    let query = this.adminClient
      .from("projects")
      .select(this.projectListSelect)
      .eq("id", input.projectId)
      .eq("customer_id", input.customerId);

    if (input.tenantId) {
      query = query.eq("tenant_id", input.tenantId);
    }

    const { data, error } = await query.maybeSingle();

    if (error) {
      throw Errors.dbError("查询客户项目详情失败", error);
    }

    return (data as unknown as CustomerSelfServiceProjectListItem | null) ?? null;
  }
}

export const customerSelfServiceRepository = new CustomerSelfServiceRepository();
