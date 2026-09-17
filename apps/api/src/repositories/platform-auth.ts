import { Errors } from "@/errors/error-factory";
import { SupabaseDB } from "@/utils/supabase";

export type PlatformWechatAccountRecord = {
  id: string;
  tenant_id: string | null;
  user_id: string | null;
  phone: string | null;
  status: string | null;
};

export class PlatformAuthRepository {
  private readonly adminClient = SupabaseDB.getAdminClient();

  async findEmployeeAccount(
    employeeId: string,
  ): Promise<PlatformWechatAccountRecord | null> {
    const { data, error } = await this.adminClient
      .from("employees")
      .select("id,tenant_id,user_id,phone,status")
      .eq("id", employeeId)
      .limit(1)
      .maybeSingle();

    if (error) {
      throw Errors.dbError("查询平台管理员账号失败", error);
    }

    return (data ?? null) as PlatformWechatAccountRecord | null;
  }
}

export const platformAuthRepository = new PlatformAuthRepository();
