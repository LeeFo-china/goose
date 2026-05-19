import { Errors } from "@/errors/error-factory";
import { SupabaseDB } from "@/utils/supabase";

export type UploadCustomerMembershipRecord = {
  tenant_id: string | null;
  identity_id: string;
  is_default: boolean;
  created_at: string;
};

export type UploadLegacyCustomerBindingRecord = {
  id: string;
  tenant_id: string | null;
};

class UploadRepository {
  private adminClient = SupabaseDB.getAdminClient();

  async findDefaultActiveCustomerMembership(authUserId: string) {
    const { data, error } = await this.adminClient
      .from("user_business_memberships")
      .select("tenant_id, identity_id, is_default, created_at")
      .eq("user_id", authUserId)
      .eq("identity_type", "customer")
      .eq("status", "active")
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<UploadCustomerMembershipRecord>();

    if (error) {
      throw Errors.dbError("查询客户上传身份失败", error);
    }

    return data ?? null;
  }

  async findLegacyCustomerBinding(authUserId: string) {
    const { data, error } = await this.adminClient
      .from("customers")
      .select("id, tenant_id")
      .eq("user_id", authUserId)
      .limit(1)
      .maybeSingle<UploadLegacyCustomerBindingRecord>();

    if (error) {
      throw Errors.dbError("查询客户上传身份失败", error);
    }

    return data ?? null;
  }
}

export const uploadRepository = new UploadRepository();
