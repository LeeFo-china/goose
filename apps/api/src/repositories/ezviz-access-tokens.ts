import { Errors } from "@/errors/error-factory";
import { SupabaseDB } from "@/utils/supabase";

export type EzvizAccessTokenRow = {
  id: string;
  access_token: string;
  expires_at: string;
  created_at: string;
  updated_at: string;
};

class EzvizAccessTokenRepository {
  private adminClient = SupabaseDB.getAdminClient();

  async findLatestValid(minExpiresAt: Date) {
    const { data, error } = await this.adminClient
      .from("ezviz_access_tokens")
      .select("*")
      .gt("expires_at", minExpiresAt.toISOString())
      .order("expires_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      throw Errors.dbError("查询萤石 token 缓存失败", error);
    }

    return (data || null) as EzvizAccessTokenRow | null;
  }

  async create(input: { access_token: string; expires_at: string }) {
    const { data, error } = await this.adminClient
      .from("ezviz_access_tokens")
      .insert(input)
      .select("*")
      .single();

    if (error) {
      throw Errors.dbError("保存萤石 token 缓存失败", error);
    }

    return data as EzvizAccessTokenRow;
  }
}

export const ezvizAccessTokenRepository = new EzvizAccessTokenRepository();
