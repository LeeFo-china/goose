import { SupabaseDB } from "@/utils/supabase";

class WechatAuthIdentityRepository {
  private adminClient = SupabaseDB.getAdminClient();

  async createWechatAuthUser(input: {
    openid: string;
    unionid?: string | null;
    uniqueEmail?: boolean;
  }) {
    const emailLocalPart = input.uniqueEmail
      ? `${input.openid}.${crypto.randomUUID()}`
      : input.openid;
    const { data, error } = await this.adminClient.auth.admin.createUser({
      email: `${emailLocalPart}@wechat.local`,
      password: crypto.randomUUID(),
      email_confirm: true,
      user_metadata: {
        openid: input.openid,
        unionid: input.unionid || null,
        source: "wechat_miniprogram",
      },
    });

    return { data, error };
  }
}

export const wechatAuthIdentityRepository = new WechatAuthIdentityRepository();
