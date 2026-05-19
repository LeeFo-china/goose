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
}

export const customerSelfServiceRepository = new CustomerSelfServiceRepository();
